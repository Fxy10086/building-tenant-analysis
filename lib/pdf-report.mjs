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

function reportLines(report) {
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

export function buildAnalysisPdf(report = {}) {
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

  let pdf = '%PDF-1.4\n%楼宇招商分析台\n';
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = encoder.encode(pdf).length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(pdf);
}
