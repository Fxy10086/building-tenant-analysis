import { assessRentSales, rentSalesThreshold } from './analysis-report.mjs';

const GROUPS = new Set(['餐饮', '服务配套', '零售', '休闲娱乐']);
const SUBTYPES = new Set(['商务餐', '饮品', '正餐', '快餐', '烘焙', '服务配套', '零售', '休闲娱乐']);

const fields = {
  候选商户名称: ['name', 'text', true],
  品牌联系人: ['contact', 'text', true],
  联系电话: ['phone', 'text', false],
  业态大类: ['group', 'text', true],
  细分业态: ['subtype', 'text', true],
  '所需面积(㎡)': ['area', 'number', true],
  数据截止日期: ['asOfDate', 'date', true],
  意向铺位: ['unit', 'text', false],
  '保守月销售(万元)': ['revenueLow', 'number', true],
  '基准月销售(万元)': ['revenueBase', 'number', true],
  '乐观月销售(万元)': ['revenueHigh', 'number', true],
  '报价月租金(万元)': ['rent', 'number', true],
  '毛利率(%)': ['grossMargin', 'percent', true],
  '每月固定成本(万元)': ['fixedCost', 'number', true],
  '装修投入(万元)': ['capex', 'number', true],
  '预计分流率(%)': ['cannibalization', 'percent', false],
  '品牌目标回收期(月)': ['targetPayback', 'number', false],
  '租金谈判底线(万元)': ['rentFloor', 'number', false],
  同类写字楼门店数: ['officeStoreCount', 'number', false],
  成熟门店数量: ['matureStoreCount', 'number', false],
  '工作日销售占比(%)': ['weekdayShare', 'percent', false],
  '核心时段销售占比(%)': ['peakShare', 'percent', false],
  自然客流依赖: ['trafficDependency', 'text', false],
  周末独立获客能力: ['weekendAcquisition', 'text', false],
  差异化定位: ['differentiation', 'text', false],
  给排水: ['water', 'text', false],
  排烟: ['exhaust', 'text', false],
  燃气: ['gas', 'text', false],
  '电力需求(kW)': ['power', 'number', false],
  '楼板承重要求(kg/㎡)': ['loadBearing', 'number', false],
  消防特殊要求: ['fireSafety', 'text', false],
  营业时间: ['businessHours', 'text', false],
  '工程改造预算(万元)': ['engineeringBudget', 'number', false],
  预计开业日期: ['openingDate', 'date', false],
  周边竞争说明: ['competition', 'text', false],
  主要风险: ['statedRisks', 'text', false],
  谈判前置条件: ['negotiationConditions', 'text', false],
  审批备注: ['approvalNotes', 'text', false],
  其他备注: ['notes', 'text', false]
};

const requiredFields = Object.entries(fields).filter(([, value]) => value[2]);

function cleanLabel(value) {
  return String(value ?? '').trim().replace(/[＊*]\s*$/, '');
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[,，%％万元㎡]/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function dateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).trim() : date.toISOString().slice(0, 10);
}

function parseValue(value, type) {
  if (type === 'number') return numberValue(value);
  if (type === 'percent') {
    const number = numberValue(value);
    if (number === null) return null;
    return number > 0 && number <= 1 ? number * 100 : number;
  }
  if (type === 'date') return dateValue(value);
  return value === null || value === undefined ? '' : String(value).trim();
}

export function parseAnalysisSupplementRows(rows = []) {
  const data = {};
  for (const row of rows) {
    const definition = fields[cleanLabel(row?.[0])];
    if (!definition) continue;
    const [key, type] = definition;
    data[key] = parseValue(row?.[1], type);
  }

  const missing = requiredFields.filter(([, [key]]) => data[key] === null || data[key] === undefined || data[key] === '').map(([label]) => label);
  const errors = missing.length ? [`缺少必填项：${missing.join('、')}`] : [];
  if (data.group && !GROUPS.has(data.group)) errors.push('业态大类不在模板选项中');
  if (data.subtype && !SUBTYPES.has(data.subtype)) errors.push('细分业态不在模板选项中');
  if ([data.revenueLow, data.revenueBase, data.revenueHigh].every(Number.isFinite) && !(data.revenueLow <= data.revenueBase && data.revenueBase <= data.revenueHigh)) errors.push('月销售情景应满足：保守 ≤ 基准 ≤ 乐观');
  if (Number.isFinite(data.grossMargin) && (data.grossMargin <= 0 || data.grossMargin > 100)) errors.push('毛利率必须大于0且不超过100%');
  for (const key of ['area', 'revenueLow', 'revenueBase', 'revenueHigh', 'rent', 'fixedCost', 'capex']) {
    if (Number.isFinite(data[key]) && data[key] < 0) errors.push(`${key}不能为负数`);
  }
  const recognized = Object.values(data).filter(value => value !== null && value !== undefined && value !== '').length;
  return { valid: errors.length === 0, data, errors, completeness: Math.round(recognized / Object.keys(fields).length * 100) };
}

export function buildSupplementReport(data, benchmark = {}) {
  const revenues = { low: data.revenueLow, base: data.revenueBase, high: data.revenueHigh };
  const scenarios = Object.entries(revenues).map(([key, revenue]) => {
    const profit = revenue * data.grossMargin / 100 - data.fixedCost - data.rent;
    const rentSales = revenue > 0 ? data.rent / revenue * 100 : null;
    return { key, revenue, profit, rentSales, payback: profit > 0 ? data.capex / profit : null, assessment: assessRentSales(data.group, rentSales) };
  });
  const base = scenarios.find(item => item.key === 'base');
  const threshold = rentSalesThreshold(data.group);
  const breakeven = data.grossMargin > 0 ? (data.fixedCost + data.rent) / (data.grossMargin / 100) : null;
  let score = 50;
  score += base.profit > 0 ? 15 : -25;
  score += base.assessment.level === '可接受' ? 15 : base.assessment.level === '需关注' ? 4 : -12;
  score += benchmark.supply === '业态空缺' ? 12 : benchmark.supply === '供给偏少' ? 9 : benchmark.supply === '供给适中' ? 4 : -5;
  score += Number.isFinite(data.weekdayShare) ? (data.weekdayShare >= 70 ? 8 : data.weekdayShare >= 55 ? 4 : -4) : 0;
  score += data.trafficDependency === '低' ? 5 : data.trafficDependency === '高' ? -4 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const paybackOverTarget = Number.isFinite(data.targetPayback) && base.payback !== null && base.payback > data.targetPayback;
  const verdict = base.profit <= 0 || base.assessment.level === '高风险' ? '不建议引入' : score >= 80 && !paybackOverTarget ? '建议引入' : score >= 65 ? '条件引入' : '暂缓引入';
  const confidence = Math.min(95, 72 + Math.min(12, benchmark.comparableSalesCount || 0) + (data.matureStoreCount >= 3 ? 6 : 0));
  const risks = [];
  if (base.profit <= 0) risks.push('基准情景无法覆盖租金与固定成本');
  if (base.assessment.level !== '可接受') risks.push(`基准租售比为 ${base.rentSales.toFixed(1)}%，判断为${base.assessment.level}`);
  if (benchmark.supply === '供给较多') risks.push(`楼内${data.subtype}供给较多，需重点控制同业分流`);
  if (Number.isFinite(data.weekdayShare) && data.weekdayShare < 55) risks.push('工作日销售占比较低，与写字楼客流模型存在偏差');
  if (data.trafficDependency === '高') risks.push('品牌高度依赖自然客流，需要证明非购物中心环境的获客能力');
  if (data.statedRisks) risks.push(data.statedRisks);
  if (!risks.length) risks.push('未发现高优先级风险，仍需持续核验真实经营数据');
  const conditions = [
    `租售比按${data.group}关注线 ${threshold.watch}%、高风险线 ${threshold.high}%控制`,
    data.differentiation || `明确与楼内现有${data.subtype}商户的差异化定位`,
    data.negotiationConditions || '将经营数据真实性、工程可实施性作为审批前置条件'
  ];
  return { scenarios, base, threshold, breakeven, score, verdict, confidence, risks, conditions };
}
