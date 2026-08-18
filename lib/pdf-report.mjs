const encoder = new TextEncoder();

function utf16Hex(value) {
  const text = String(value ?? '');
  const bytes = [0xfe, 0xff];
  for (const symbol of text) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint <= 0xffff) {
      bytes.push(codePoint >> 8, codePoint & 0xff);
      continue;
    }
    const adjusted = codePoint - 0x10000;
    const high = 0xd800 + (adjusted >> 10);
    const low = 0xdc00 + (adjusted & 0x3ff);
    bytes.push(high >> 8, high & 0xff, low >> 8, low & 0xff);
  }
  return bytes.map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function wrapText(value, maxLength = 34) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  const lines = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const chars = Array.from(paragraph);
    if (!chars.length) {
      lines.push('');
      continue;
    }
    for (let index = 0; index < chars.length; index += maxLength) {
      lines.push(chars.slice(index, index + maxLength).join(''));
    }
  }
  return lines;
}

export function reportLines(report) {
  const lines = [{ text: report.title || '招商分析报告', size: 19 }];
  if (report.generatedAt) lines.push({ text: `生成时间：${report.generatedAt}`, size: 9 });
  lines.push({ text: `招商结论：${report.verdict || '待补充'}${report.score == null ? '' : `    综合得分：${report.score}`}`, size: 14 });
  if (report.confidence != null) lines.push({ text: `数据可信度：${report.confidence}%`, size: 10 });
  lines.push({ text: '', size: 7 });
  if (report.summary) {
    lines.push({ text: '结论摘要', size: 14 });
    wrapText(report.summary).forEach(text => lines.push({ text, size: 11 }));
  }
  if (Array.isArray(report.facts) && report.facts.length) {
    lines.push({ text: '关键数据', size: 14 });
    report.facts.forEach(([label, value]) => wrapText(`${label}：${value}`).forEach(text => lines.push({ text, size: 11 })));
  }
  for (const section of report.sections || []) {
    lines.push({ text: section.title, size: 14 });
    for (const item of section.items || []) {
      wrapText(`• ${item}`).forEach(text => lines.push({ text, size: 11 }));
    }
  }
  lines.push({ text: '', size: 7 });
  lines.push({ text: '数据说明', size: 12 });
  wrapText(report.source || '本报告由楼宇招商分析台根据当前页面数据生成。').forEach(text => lines.push({ text, size: 9 }));
  return lines;
}

function pageStream(lines, pageNumber, pageCount) {
  const commands = ['BT', '50 800 Td'];
  for (const line of lines) {
    commands.push(`/F1 ${line.size || 11} Tf`);
    commands.push(`<${utf16Hex(line.text)}> Tj`);
    commands.push('0 -19 Td');
  }
  commands.push(`/F1 8 Tf <${utf16Hex(`第 ${pageNumber} / ${pageCount} 页`)}> Tj`);
  commands.push('ET');
  return commands.join('\n');
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function buildPdfFromObjects(objects) {
  const chunks = [encoder.encode('%PDF-1.4\n%PDF\n')];
  const offsets = [0];
  let byteLength = chunks[0].length;
  for (let id = 1; id < objects.length; id += 1) {
    const body = typeof objects[id] === 'string' ? encoder.encode(objects[id]) : objects[id];
    const chunk = concatBytes([encoder.encode(`${id} 0 obj\n`), body, encoder.encode('\nendobj\n')]);
    offsets[id] = byteLength;
    chunks.push(chunk);
    byteLength += chunk.length;
  }
  const xrefOffset = byteLength;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(xref));
  return concatBytes(chunks);
}

function decodeBase64(data) {
  const base64 = String(data || '').replace(/^data:image\/jpeg;base64,/, '');
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(base64, 'base64'));
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function buildImagePdf(report) {
  const images = Array.isArray(report.images) ? report.images.filter(Boolean) : [];
  const width = Number(report.imageWidth) || 1190;
  const height = Number(report.imageHeight) || 1684;
  const pageIds = images.map((_, index) => 3 + index * 3);
  const contentIds = images.map((_, index) => 4 + index * 3);
  const imageIds = images.map((_, index) => 5 + index * 3);
  const objects = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${images.length} >>`;
  images.forEach((image, index) => {
    const imageBytes = decodeBase64(image);
    objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${index + 1} ${imageIds[index]} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    const stream = `q 595 0 0 842 0 0 cm /Im${index + 1} Do Q`;
    objects[contentIds[index]] = `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;
    objects[imageIds[index]] = concatBytes([encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`), imageBytes, encoder.encode('\nendstream')]);
  });
  return buildPdfFromObjects(objects);
}

export function buildAnalysisPdf(report = {}) {
  if (Array.isArray(report.images) && report.images.length) return buildImagePdf(report);
  const allLines = reportLines(report);
  const pageSize = 36;
  const pages = [];
  for (let index = 0; index < allLines.length; index += pageSize) pages.push(allLines.slice(index, index + pageSize));
  if (!pages.length) pages.push([{ text: '招商分析报告', size: 19 }]);

  const objects = [];
  const pageIds = pages.map((_, index) => 5 + index * 2);
  const contentIds = pages.map((_, index) => 6 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [4 0 R] >>';
  objects[4] = '<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 4 >> /DW 1000 >>';
  pages.forEach((lines, index) => {
    const stream = pageStream(lines, index + 1, pages.length);
    objects[pageIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
    objects[contentIds[index]] = `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });

  return buildPdfFromObjects(objects);
}
