import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRentSales, buildTenantBenchmark, rentSalesThreshold } from '../lib/analysis-report.mjs';

test('builds a candidate benchmark from active real merchant rows', () => {
  const merchants = [
    { name: 'A', group: '餐饮', subtype: '饮品', revenue: 12, area: 100, status: '在营' },
    { name: 'B', group: '餐饮', subtype: '饮品', revenue: 20, area: 80, status: '在营' },
    { name: 'C', group: '零售', subtype: '零售', revenue: 8, area: 50, status: '在营' },
    { name: 'D', group: '餐饮', subtype: '饮品', revenue: 30, area: 100, status: '已退租' }
  ];

  const result = buildTenantBenchmark(merchants, { group: '餐饮', subtype: '饮品' });
  assert.equal(result.totalCount, 3);
  assert.equal(result.categoryCount, 2);
  assert.equal(result.subtypeCount, 2);
  assert.equal(result.comparableSales, 32);
  assert.equal(result.medianSales, 16);
  assert.equal(result.averageEfficiency, 1850);
  assert.equal(result.supply, '供给较多');
});

test('uses category-specific rent-to-sales warning thresholds', () => {
  assert.deepEqual(rentSalesThreshold('餐饮'), { watch: 20, high: 30 });
  assert.equal(assessRentSales('餐饮', 18).level, '可接受');
  assert.equal(assessRentSales('餐饮', 24).level, '需关注');
  assert.equal(assessRentSales('餐饮', 32).level, '高风险');
  assert.equal(assessRentSales('零售', null).level, '待补充');
});
