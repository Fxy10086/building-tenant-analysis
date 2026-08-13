const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const PAGE_SIZE = 500;

const FIELD_NAMES = Object.freeze({
  floorArea: ['\u697c\u5ea7'],
  floor: ['\u697c\u5c42'],
  unit: ['\u94fa\u4f4d\u53f7'],
  category: ['\u4e1a\u6001\u5927\u7c7b'],
  subcategory: ['\u4e1a\u6001\u7ec6\u5206'],
  brand: ['\u54c1\u724c\u540d\u79f0'],
  brandAlias: ['\u79d1\u4f20\u54c1\u724c\u540d\u79f0'],
  leaseStatus: ['\u79df\u8d41\u72b6\u6001'],
  sales: Array.from({ length: 12 }, (_, index) => `${index + 1}\u6708\u9500\u552e`)
});

function configValue(name) {
  return String(process.env[name] || '').trim();
}

export function getFeishuConfig() {
  return {
    appId: configValue('FEISHU_APP_ID'),
    appSecret: configValue('FEISHU_APP_SECRET'),
    appToken: configValue('FEISHU_APP_TOKEN'),
    tableId: configValue('FEISHU_TABLE_ID'),
    tableName: configValue('FEISHU_TABLE_NAME') || '2026\u5e74\u9500\u552e\u62a5\u8868'
  };
}

export function getFeishuConfigStatus() {
  const config = getFeishuConfig();
  return {
    configured: Boolean(config.appId && config.appSecret && config.appToken),
    appIdConfigured: Boolean(config.appId),
    appSecretConfigured: Boolean(config.appSecret),
    appTokenConfigured: Boolean(config.appToken),
    tableIdConfigured: Boolean(config.tableId),
    tableName: config.tableName,
    mode: 'read-only'
  };
}

function scalar(value) {
  if (Array.isArray(value)) return value.map(scalar).filter(Boolean).join(', ');
  if (value && typeof value === 'object') {
    if ('value' in value) return scalar(value.value);
    return String(value.text || value.name || '');
  }
  return value == null ? '' : String(value).trim();
}

function fieldValue(fields, names) {
  for (const name of names) {
    if (fields && fields[name] !== undefined && fields[name] !== null) return fields[name];
  }
  return '';
}

function numericValue(value) {
  const text = scalar(value).replace(/[,，￥¥元\s]/g, '');
  if (!text) return null;
  const number = Number(text.replace(/万$/, ''));
  if (!Number.isFinite(number)) return null;
  return text.endsWith('万') ? number * 10000 : number;
}

function optionLabels(fields = []) {
  const labels = new Map();
  for (const field of fields) {
    for (const option of field.property?.options || []) labels.set(option.id, option.name);
  }
  return labels;
}

function resolveOptions(value, labels) {
  return scalar(value).split(',').map(item => labels.get(item.trim()) || item.trim()).filter(Boolean).join(', ');
}

export function normalizeFeishuRecord(record = {}, labels = new Map()) {
  const fields = record.fields || {};
  const monthlySales = FIELD_NAMES.sales.map(name => numericValue(fieldValue(fields, [name])));
  return {
    recordId: scalar(record.record_id || record.recordId),
    floorArea: resolveOptions(fieldValue(fields, FIELD_NAMES.floorArea), labels),
    floor: resolveOptions(fieldValue(fields, FIELD_NAMES.floor), labels),
    unit: scalar(fieldValue(fields, FIELD_NAMES.unit)),
    category: resolveOptions(fieldValue(fields, FIELD_NAMES.category), labels),
    subcategory: resolveOptions(fieldValue(fields, FIELD_NAMES.subcategory), labels),
    brand: scalar(fieldValue(fields, FIELD_NAMES.brand)),
    brandAlias: scalar(fieldValue(fields, FIELD_NAMES.brandAlias)),
    leaseStatus: scalar(fieldValue(fields, FIELD_NAMES.leaseStatus)),
    monthlySales,
    annualSales: monthlySales.reduce((sum, value) => sum + (value || 0), 0),
    sourceFields: fields
  };
}

async function feishuRequest(path, options = {}) {
  const response = await fetch(`${FEISHU_API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store'
  });
  let body = null;
  try { body = await response.json(); } catch {}
  if (!response.ok || body?.code !== 0) {
    const message = body?.msg || `Feishu request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}

async function getTenantAccessToken(config) {
  const body = await feishuRequest('/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret })
  });
  if (!body.tenant_access_token) throw new Error('Feishu did not return a tenant access token');
  return body.tenant_access_token;
}

async function listTables(config, token) {
  const tables = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (pageToken) query.set('page_token', pageToken);
    const body = await feishuRequest(`/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables?${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    tables.push(...(body.data?.items || []));
    pageToken = body.data?.page_token || '';
  } while (pageToken);
  return tables;
}

async function listRecords(config, token, tableId) {
  const records = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (pageToken) query.set('page_token', pageToken);
    const body = await feishuRequest(`/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables/${encodeURIComponent(tableId)}/records?${query}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    records.push(...(body.data?.items || []));
    pageToken = body.data?.page_token || '';
  } while (pageToken);
  return records;
}

async function listFields(config, token, tableId) {
  const body = await feishuRequest(`/bitable/v1/apps/${encodeURIComponent(config.appToken)}/tables/${encodeURIComponent(tableId)}/fields?page_size=100`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return body.data?.items || [];
}

export async function syncFeishuSalesTable() {
  const config = getFeishuConfig();
  if (!config.appId || !config.appSecret || !config.appToken) {
    const error = new Error('Feishu read-only configuration is incomplete');
    error.status = 503;
    throw error;
  }
  const token = await getTenantAccessToken(config);
  let table = { table_id: config.tableId, name: config.tableName };
  if (!config.tableId) {
    const tables = await listTables(config, token);
    table = tables.find(item => item.name === config.tableName);
    if (!table?.table_id) {
      const error = new Error(`Feishu table not found: ${config.tableName}`);
      error.status = 404;
      throw error;
    }
  }
  const [sourceRecords, fields] = await Promise.all([
    listRecords(config, token, table.table_id),
    listFields(config, token, table.table_id)
  ]);
  const labels = optionLabels(fields);
  const records = sourceRecords.map(record => normalizeFeishuRecord(record, labels));
  return {
    tableId: table.table_id,
    tableName: table.name,
    recordCount: records.length,
    records,
    syncedAt: new Date().toISOString()
  };
}

export { FIELD_NAMES };
