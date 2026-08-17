const ACTIVE_EXCLUSIONS = new Set(['已退租', '已撤场', '已闭店']);

const RENT_SALES_THRESHOLDS = Object.freeze({
  餐饮: { watch: 20, high: 30 },
  服务配套: { watch: 30, high: 40 },
  零售: { watch: 25, high: 40 },
  休闲娱乐: { watch: 30, high: 45 }
});

function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function supplyLevel(count, share) {
  if (!count) return '业态空缺';
  if (count <= 2 && share < 0.12) return '供给偏少';
  if (count >= 6 || share >= 0.25) return '供给较多';
  return '供给适中';
}

export function buildTenantBenchmark(merchants = [], candidate = {}) {
  const active = merchants.filter(item => item?.name && !ACTIVE_EXCLUSIONS.has(item.status));
  const sameGroup = active.filter(item => item.group === candidate.group);
  const sameSubtype = active.filter(item => item.subtype === candidate.subtype);
  const sales = active.map(item => finite(item.revenue)).filter(value => value !== null);
  const groupSales = sameGroup.map(item => finite(item.revenue)).filter(value => value !== null);
  const subtypeSales = sameSubtype.map(item => finite(item.revenue)).filter(value => value !== null);
  const efficiencies = sameSubtype.map(item => {
    const revenue = finite(item.revenue);
    const area = finite(item.area);
    return revenue !== null && area > 0 ? revenue * 10000 / area : null;
  }).filter(value => value !== null);
  const totalSales = sum(sales);
  const categorySales = sum(groupSales);
  const comparableSales = sum(subtypeSales);
  const subtypeShare = active.length ? sameSubtype.length / active.length : 0;

  return {
    totalCount: active.length,
    categoryCount: sameGroup.length,
    subtypeCount: sameSubtype.length,
    categoryShare: active.length ? sameGroup.length / active.length : 0,
    subtypeShare,
    totalSales,
    categorySales,
    comparableSales,
    categorySalesShare: totalSales ? categorySales / totalSales : null,
    subtypeSalesShare: totalSales ? comparableSales / totalSales : null,
    comparableSalesCount: subtypeSales.length,
    medianSales: median(subtypeSales),
    averageSales: subtypeSales.length ? comparableSales / subtypeSales.length : null,
    averageEfficiency: efficiencies.length ? sum(efficiencies) / efficiencies.length : null,
    efficiencyCount: efficiencies.length,
    supply: supplyLevel(sameSubtype.length, subtypeShare)
  };
}

export function rentSalesThreshold(group) {
  return RENT_SALES_THRESHOLDS[group] || { watch: 25, high: 35 };
}

export function assessRentSales(group, value) {
  const number = finite(value);
  if (number === null) return { level: '待补充', tone: 'blue' };
  const threshold = rentSalesThreshold(group);
  if (number >= threshold.high) return { level: '高风险', tone: 'risk' };
  if (number >= threshold.watch) return { level: '需关注', tone: 'warn' };
  return { level: '可接受', tone: 'good' };
}
