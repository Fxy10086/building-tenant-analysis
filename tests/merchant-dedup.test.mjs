import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterOutExistingTenants,
  normalizeMerchantName
} from '../lib/merchant-dedup.mjs';

test('normalizes branch suffixes and punctuation', () => {
  assert.equal(normalizeMerchantName('星巴克咖啡（融科资讯中心店）'), '星巴克咖啡');
  assert.equal(normalizeMerchantName('M Stand 咖啡'), 'mstand咖啡');
});

test('filters the same tenant by normalized brand name', () => {
  const tenants = [{ name: '星巴克', status: '在营' }, { name: 'M Stand 咖啡', status: '在营' }];
  const candidates = [
    { id: '1', name: '星巴克咖啡（融科资讯中心店）' },
    { id: '2', name: 'M Stand咖啡(中关村店)' },
    { id: '3', name: 'Peet’s Coffee（中关村店）' }
  ];

  assert.deepEqual(filterOutExistingTenants(candidates, tenants).map(item => item.id), ['3']);
});

test('filters brand matches with shopping-center and branch suffixes', () => {
  const tenants = [{ name: '星巴克', status: '在营' }];
  const candidates = [
    { id: '1', name: '星巴克北京鼎好店' },
    { id: '2', name: '星巴克臻选北京华联店' },
    { id: '3', name: '瑞幸咖啡北京店' }
  ];

  assert.deepEqual(filterOutExistingTenants(candidates, tenants).map(item => item.id), ['3']);
});

test('filters an authorized tenant by Amap POI id', () => {
  const tenants = [{ fields: { '商户名称': '测试商户', '高德POI ID': 'B000123', '经营状态': '在营' } }];
  const candidates = [{ id: 'B000123', name: '完全不同的门店名称' }, { id: 'B000456', name: '另一家门店' }];

  assert.deepEqual(filterOutExistingTenants(candidates, tenants).map(item => item.id), ['B000456']);
});

test('supports Feishu aliases and ignores closed tenants', () => {
  const tenants = [
    { fields: { '商户名称': '北京某某餐饮有限公司', '品牌别名': '麦当劳, McDonald’s', '经营状态': '在营' } },
    { fields: { '商户名称': '已撤场咖啡', '经营状态': '已撤场' } }
  ];
  const candidates = [{ id: '1', name: '麦当劳（中关村店）' }, { id: '2', name: '已撤场咖啡店' }];

  assert.deepEqual(filterOutExistingTenants(candidates, tenants).map(item => item.id), ['2']);
});
