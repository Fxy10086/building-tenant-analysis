import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAnalysisPdf } from '../lib/pdf-report.mjs';

test('builds a downloadable PDF with the analysis report structure', () => {
  const pdf = buildAnalysisPdf({
    title: '胖子龙虾招商分析报告',
    verdict: '建议引入',
    score: 86,
    summary: '基准情景经营利润为正。',
    sections: [{ title: '招商财务测算', items: ['基准月销售 82 万元', '租售比 17.7%'] }]
  });
  const header = new TextDecoder().decode(pdf.slice(0, 8));
  const text = new TextDecoder().decode(pdf);
  assert.equal(header, '%PDF-1.4');
  assert.match(text, /\/Type \/Page/);
  assert.match(text, /STSong-Light/);
  assert.ok(pdf.length > 1000);
});

test('embeds browser-rendered report pages as images for portable Chinese PDFs', () => {
  const pdf = buildAnalysisPdf({ images: ['data:image/jpeg;base64,/9j/4AAQ'], imageWidth: 1190, imageHeight: 1684 });
  const text = new TextDecoder().decode(pdf);
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /\/Filter \/DCTDecode/);
});
