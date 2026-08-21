import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPoiCategory } from '../lib/poi-category.mjs';

test('maps common Amap bakery labels into the website taxonomy', () => {
  assert.deepEqual(inferPoiCategory({ name: '某某西式糕点', type: '餐饮服务;糕点店' }), { group: '餐饮', subtype: '烘焙' });
  assert.deepEqual(inferPoiCategory({ name: '某某蛋糕店', type: '餐饮服务' }), { group: '餐饮', subtype: '烘焙' });
});

test('maps beverage, fast food, retail and service aliases', () => {
  assert.equal(inferPoiCategory({ name: '某某咖啡厅' }).subtype, '饮品');
  assert.equal(inferPoiCategory({ name: '某某快餐店' }).subtype, '快餐');
  assert.equal(inferPoiCategory({ name: '某某购物中心' }).group, '零售');
  assert.equal(inferPoiCategory({ name: '某某美容店' }).group, '服务配套');
});

test('uses Amap type codes as a fallback', () => {
  assert.deepEqual(inferPoiCategory({ name: '某个场所', typecode: '080000' }), { group: '休闲娱乐', subtype: '休闲娱乐' });
});

test('applies audited brand overrides before generic labels and type codes', () => {
  assert.deepEqual(inferPoiCategory({ name: '鲜芋仙（融科店）', type: '餐饮服务;甜品店', typecode: '050000' }), { group: '餐饮', subtype: '饮品' });
  assert.deepEqual(inferPoiCategory({ name: '三元梅园（中关村店）', type: '餐饮服务;糕点店', typecode: '050000' }), { group: '餐饮', subtype: '饮品' });
  assert.deepEqual(inferPoiCategory({ name: '酸奶罐罐（五道口店）', type: '餐饮服务;蛋糕店', typecode: '050000' }), { group: '餐饮', subtype: '饮品' });
  assert.deepEqual(inferPoiCategory({ name: '味多美（中关村店）', type: '生活服务;服务中心', typecode: '070000' }), { group: '餐饮', subtype: '烘焙' });
});
