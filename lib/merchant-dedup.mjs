const ACTIVE_STATUSES = new Set(['', '在营', '营业中', '正常营业', 'active', 'open']);
const BRAND_ALIASES = {
  '星巴克': ['starbucks'],
  '麦当劳': ['mcdonalds', 'mcdonald'],
  '肯德基': ['kfc'],
  '瑞幸咖啡': ['luckincoffee', 'luckin'],
  '喜茶': ['heytea'],
  '奈雪的茶': ['naixue', 'naixuethetea'],
  '无印良品': ['muji'],
  '名创优品': ['miniso']
};
const GENERIC_SUFFIXES = [
  '生活方式百货', '综合健身房', '会籍制健身房', '24小时健身房',
  '健身房', '健身', '咖啡店', '咖啡', '餐饮店', '餐厅', '饭店',
  '便利店', '百货店', '百货', '茶饮店', '茶饮', '门店'
];

function scalar(value) {
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(',');
  if (value && typeof value === 'object') {
    return value.text || value.name || value.value || '';
  }
  return value == null ? '' : String(value);
}

function field(record, names) {
  const source = record?.fields || record || {};
  for (const name of names) {
    if (source[name] !== undefined && source[name] !== null) return source[name];
  }
  return '';
}

function splitAliases(value) {
  if (Array.isArray(value)) return value.flatMap(splitAliases);
  return scalar(value).split(/[，,、;；|/\n]+/).map(item => item.trim()).filter(Boolean);
}

export function normalizeMerchantName(value) {
  return scalar(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[（(【[][^）)】\]]*[）)】\]]/g, '')
    .replace(/(?:融科资讯中心|融科中心|融科天地|融科大厦|中关村)[^店]{0,12}店$/u, '')
    .replace(/(?:旗舰店|总店|分店)$/u, '')
    .replace(/[\s·•.。:：_—-]+/g, '')
    .replace(/[^一-鿿㐀-䶿a-z0-9%&+]/g, '');
}

function merchantKeys(value) {
  const normalized = normalizeMerchantName(value);
  if (!normalized) return [];
  const keys = new Set([normalized]);
  for (const suffix of GENERIC_SUFFIXES) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length + 1) {
      keys.add(normalized.slice(0, -suffix.length));
    }
  }
  Object.entries(BRAND_ALIASES).forEach(([canonical, aliases]) => {
    const canonicalKey = normalizeMerchantName(canonical);
    if (normalized === canonicalKey || normalized.startsWith(canonicalKey)) aliases.forEach(alias => keys.add(alias));
    if (aliases.some(alias => normalized === alias || normalized.startsWith(alias))) keys.add(canonicalKey);
  });
  return [...keys];
}

export function toTenantIdentity(record) {
  const name = field(record, ['name', 'merchantName', 'tenantName', '商户名称', '门店名称']);
  const brand = field(record, ['brand', 'brandName', '品牌名称', '品牌']);
  const aliases = splitAliases(field(record, ['aliases', 'alias', '商户别名', '品牌别名', '别名']));
  const poiId = scalar(field(record, ['poiId', 'amapPoiId', '高德POI ID', '高德POI_ID', '高德门店ID'])).trim();
  const status = scalar(field(record, ['status', '经营状态', '商户状态', '状态'])).trim().toLowerCase();
  return { name: scalar(name), brand: scalar(brand), aliases, poiId, status };
}

export function buildTenantIndex(records = []) {
  const poiIds = new Set();
  const nameKeys = new Set();

  records.map(toTenantIdentity).forEach(tenant => {
    if (!ACTIVE_STATUSES.has(tenant.status)) return;
    if (tenant.poiId) poiIds.add(tenant.poiId);
    [tenant.name, tenant.brand, ...tenant.aliases].forEach(value => {
      merchantKeys(value).forEach(key => nameKeys.add(key));
    });
  });

  return { poiIds, nameKeys };
}

export function isExistingTenant(candidate, tenantIndex) {
  const poiId = scalar(candidate?.poiId || candidate?.amapPoiId || candidate?.id).trim();
  if (poiId && tenantIndex.poiIds.has(poiId)) return true;

  const names = [candidate?.merchant, candidate?.name, candidate?.brand, ...(candidate?.aliases || [])];
  const candidateKeys = names.flatMap(merchantKeys);
  return candidateKeys.some(candidateKey => [...tenantIndex.nameKeys].some(tenantKey => {
    if (candidateKey === tenantKey) return true;
    const shorter = Math.min(candidateKey.length, tenantKey.length);
    return shorter >= 2 && (candidateKey.includes(tenantKey) || tenantKey.includes(candidateKey));
  }));
}

export function filterOutExistingTenants(candidates = [], tenantRecords = []) {
  const index = buildTenantIndex(tenantRecords);
  return candidates.filter(candidate => !isExistingTenant(candidate, index));
}
