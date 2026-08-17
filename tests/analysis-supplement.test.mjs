import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSupplementReport, parseAnalysisSupplementRows } from '../lib/analysis-supplement.mjs';

const completeRows = [
  ['候选商户名称*', '测试品牌'],
  ['品牌联系人*', '张经理'],
  ['业态大类*', '餐饮'],
  ['细分业态*', '饮品'],
  ['所需面积(㎡)*', 90],
  ['数据截止日期*', 46250],
  ['保守月销售(万元)*', 30],
  ['基准月销售(万元)*', 40],
  ['乐观月销售(万元)*', 50],
  ['报价月租金(万元)*', 7],
  ['毛利率(%)*', 0.65],
  ['每月固定成本(万元)*', 14],
  ['装修投入(万元)*', 60],
  ['工作日销售占比(%)', 0.75],
  ['自然客流依赖', '中']
];

test('parses the website Excel template fields and percentages', () => {
  const result = parseAnalysisSupplementRows(completeRows);
  assert.equal(result.valid, true);
  assert.equal(result.data.name, '测试品牌');
  assert.equal(result.data.grossMargin, 65);
  assert.equal(result.data.weekdayShare, 75);
  assert.match(result.data.asOfDate, /^2026-/);
});

test('rejects incomplete or inconsistent supplement data', () => {
  const missing = parseAnalysisSupplementRows([['候选商户名称*', '测试品牌']]);
  assert.equal(missing.valid, false);
  assert.match(missing.errors[0], /缺少必填项/);

  const inconsistent = parseAnalysisSupplementRows(completeRows.map(row => row[0].startsWith('保守月销售') ? [row[0], 60] : row));
  assert.equal(inconsistent.valid, false);
  assert.ok(inconsistent.errors.some(error => error.includes('保守 ≤ 基准 ≤ 乐观')));
});

test('builds a financial decision report from uploaded values', () => {
  const parsed = parseAnalysisSupplementRows(completeRows);
  const report = buildSupplementReport(parsed.data, { supply: '供给偏少', comparableSalesCount: 2 });
  assert.equal(report.scenarios.length, 3);
  assert.equal(report.base.profit, 5);
  assert.equal(report.base.rentSales, 17.5);
  assert.equal(report.breakeven, 21 / 0.65);
  assert.ok(['建议引入', '条件引入'].includes(report.verdict));
});
