import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPoiCategory } from '../lib/poi-category.mjs';

const taxonomy = poi => {
  const result = inferPoiCategory(poi);
  return { group: result.group, subtype: result.subtype, status: result.status };
};

test('maps bakery and beverage labels without treating all desserts as bakery', () => {
  assert.deepEqual(taxonomy({ name: '某某西式糕点' }), { group: '餐饮', subtype: '烘焙', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '某某蛋糕店' }), { group: '餐饮', subtype: '烘焙', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '某某甜品店' }), { group: '餐饮', subtype: '饮品', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '某某酸奶店' }), { group: '餐饮', subtype: '饮品', status: 'confirmed' });
});

test('does not let broad words override a specific trade', () => {
  assert.deepEqual(taxonomy({ name: '某某蛋糕商店' }), { group: '餐饮', subtype: '烘焙', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '某某餐饮服务中心', typecode: '050100' }), { group: '餐饮', subtype: '正餐', status: 'confirmed' });
});

test('maps common fast food, retail, service and leisure aliases', () => {
  assert.equal(inferPoiCategory({ name: '某某快餐店' }).subtype, '快餐');
  assert.equal(inferPoiCategory({ name: '某某购物中心' }).group, '零售');
  assert.equal(inferPoiCategory({ name: '某某美容院' }).group, '服务配套');
  assert.equal(inferPoiCategory({ name: '某某健身房' }).group, '休闲娱乐');
});

test('uses detailed Amap type codes as a fallback', () => {
  assert.deepEqual(taxonomy({ name: '某个场所', typecode: '050800' }), { group: '餐饮', subtype: '烘焙', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '某个场所', typecode: '050700' }), { group: '餐饮', subtype: '饮品', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '某个场所', typecode: '080000' }), { group: '休闲娱乐', subtype: '休闲娱乐', status: 'confirmed' });
});

test('applies audited brand rules before keywords and type codes', () => {
  assert.deepEqual(taxonomy({ name: '鲜芋仙（融科店）', type: '餐饮服务;糕点店' }), { group: '餐饮', subtype: '饮品', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '三元梅园（中关村店）', type: '餐饮服务;糕点店' }), { group: '餐饮', subtype: '饮品', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '酸奶罐罐（五道口店）', type: '餐饮服务;蛋糕店' }), { group: '餐饮', subtype: '饮品', status: 'confirmed' });
  assert.deepEqual(taxonomy({ name: '味多美（中关村店）', type: '生活服务;服务中心', typecode: '070000' }), { group: '餐饮', subtype: '烘焙', status: 'confirmed' });
});

test('marks conflicting or unknown merchants for review instead of defaulting to proper dining', () => {
  assert.deepEqual(taxonomy({ name: '蛋糕咖啡实验室' }), { group: '待审核', subtype: '待审核', status: 'review' });
  assert.deepEqual(taxonomy({ name: '无法识别品牌' }), { group: '待审核', subtype: '待审核', status: 'review' });
  assert.deepEqual(taxonomy({ name: '某餐饮场所', typecode: '050000' }), { group: '餐饮', subtype: '待审核', status: 'review' });
});
