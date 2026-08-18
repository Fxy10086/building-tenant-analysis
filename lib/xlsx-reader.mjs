const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 12 * 1024 * 1024;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 120;

function findEndOfCentralDirectory(bytes, view) {
  const start = Math.max(0, bytes.length - 65557);
  for (let offset = bytes.length - 22; offset >= start; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  throw new Error('不是有效的 Excel .xlsx 文件');
}

function readZipDirectory(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEndOfCentralDirectory(bytes, view);
  const entryCount = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entryCount > MAX_ENTRIES) throw new Error('Excel 文件结构过于复杂');

  const entries = new Map();
  let offset = directoryOffset;
  let totalSize = 0;
  const decoder = new TextDecoder('utf-8');
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Excel 文件目录损坏');
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(bytes.subarray(offset + 46, offset + 46 + fileNameLength)).replace(/\\/g, '/');
    totalSize += uncompressedSize;
    if (uncompressedSize > MAX_ENTRY_BYTES || totalSize > MAX_UNCOMPRESSED_BYTES) throw new Error('Excel 文件解压后过大');
    entries.set(fileName, { method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }
  return { entries, view };
}

async function readEntry(bytes, view, entry) {
  const offset = entry.localOffset;
  if (view.getUint32(offset, true) !== 0x04034b50) throw new Error('Excel 文件内容损坏');
  const fileNameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + fileNameLength + extraLength;
  const compressed = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return compressed;
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('当前浏览器无法读取此 Excel 压缩格式');
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const output = new Uint8Array(await new Response(stream).arrayBuffer());
  if (output.length > MAX_ENTRY_BYTES) throw new Error('Excel 工作表内容过大');
  return output;
}

function parseXml(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('Excel 工作表内容无法解析');
  return xml;
}

function elements(node, localName) {
  return Array.from(node?.getElementsByTagNameNS?.('*', localName) || node?.getElementsByTagName(localName) || []);
}

function nodeText(node) {
  return elements(node, 't').map(item => item.textContent || '').join('');
}

function sheetRows(xml, sharedStrings) {
  return elements(xml, 'row').map(row => {
    const values = [];
    for (const cell of elements(row, 'c')) {
      const reference = cell.getAttribute('r') || '';
      const columnLetters = reference.match(/^[A-Z]+/)?.[0] || 'A';
      let column = 0;
      for (const letter of columnLetters) column = column * 26 + letter.charCodeAt(0) - 64;
      column -= 1;
      const type = cell.getAttribute('t');
      const raw = elements(cell, 'v')[0]?.textContent ?? '';
      let value = raw;
      if (type === 's') value = sharedStrings[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = nodeText(cell);
      else if (type === 'b') value = raw === '1';
      else if (type !== 'str' && raw !== '' && Number.isFinite(Number(raw))) value = Number(raw);
      values[column] = value;
    }
    return values;
  });
}

export async function readXlsxRows(file, preferredSheet = '品牌招商资料') {
  if (!file || file.size <= 0) throw new Error('请选择 Excel 文件');
  if (file.size > MAX_FILE_BYTES) throw new Error('Excel 文件不能超过 3MB');
  if (!file.name.toLowerCase().endsWith('.xlsx') && file.type !== XLSX_MIME) throw new Error('仅支持 .xlsx 格式');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { entries, view } = readZipDirectory(bytes);
  const decoder = new TextDecoder('utf-8');
  const readText = async name => {
    const entry = entries.get(name);
    if (!entry) return '';
    return decoder.decode(await readEntry(bytes, view, entry));
  };

  const workbookXml = parseXml(await readText('xl/workbook.xml'));
  const relationshipsXml = parseXml(await readText('xl/_rels/workbook.xml.rels'));
  const relationships = new Map(elements(relationshipsXml, 'Relationship').map(item => [item.getAttribute('Id'), item.getAttribute('Target')]));
  const sheets = elements(workbookXml, 'sheet');
  const selected = sheets.find(item => item.getAttribute('name') === preferredSheet) || sheets[0];
  if (!selected) throw new Error('Excel 中没有可读取的工作表');
  const relationId = selected.getAttribute('r:id') || selected.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const target = relationships.get(relationId);
  if (!target) throw new Error('找不到 Excel 工作表内容');
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;

  const sharedText = await readText('xl/sharedStrings.xml');
  const sharedStrings = sharedText ? elements(parseXml(sharedText), 'si').map(nodeText) : [];
  const selectedText = await readText(sheetPath);
  if (!selectedText) throw new Error('Excel 工作表为空或已损坏');
  return sheetRows(parseXml(selectedText), sharedStrings);
}
