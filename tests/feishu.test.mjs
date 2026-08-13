import test from 'node:test';
import assert from 'node:assert/strict';
import { getFeishuConfig, normalizeFeishuRecord } from '../lib/feishu.mjs';

test('uses the full sales table name by default', () => {
  assert.equal(getFeishuConfig().tableName, '商业销售数据分析');
});

test('maps the existing Feishu fields without renaming them', () => {
  const fields = {
    '楼座': 'A座',
    '楼层': 'B1',
    '铺位号': 'B1-08',
    '业态大类': '餐饮',
    '业态细分': '中式快餐',
    '品牌名称': '测试品牌',
    '科传品牌名称': '测试品牌北京',
    '租赁状态': '在营',
    '1月销售': 120000,
    '2月销售': '￥135,000',
    '3月销售': '14.2万'
  };

  const result = normalizeFeishuRecord({ record_id: 'rec001', fields });

  assert.equal(result.recordId, 'rec001');
  assert.equal(result.floorArea, 'A座');
  assert.equal(result.floor, 'B1');
  assert.equal(result.unit, 'B1-08');
  assert.equal(result.category, '餐饮');
  assert.equal(result.subcategory, '中式快餐');
  assert.equal(result.brand, '测试品牌');
  assert.equal(result.brandAlias, '测试品牌北京');
  assert.equal(result.leaseStatus, '在营');
  assert.deepEqual(result.monthlySales.slice(0, 4), [120000, 135000, 142000, null]);
  assert.equal(result.annualSales, 397000);
  assert.strictEqual(result.sourceFields, fields);
});

test('supports formula-like and array field values', () => {
  const result = normalizeFeishuRecord({
    fields: {
      '品牌名称': [{ text: '品牌甲' }],
      '1月销售': { value: '88,000元' },
      '2月销售': { text: '9.5万' }
    }
  });

  assert.equal(result.brand, '品牌甲');
  assert.deepEqual(result.monthlySales.slice(0, 3), [88000, 95000, null]);
  assert.equal(result.annualSales, 183000);
});
