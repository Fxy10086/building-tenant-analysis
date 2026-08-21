export const BRAND_CATEGORY_RULES = [
  { brands: ['鲜芋仙', '三元梅园', '酸奶罐罐'], group: '餐饮', subtype: '饮品' },
  { brands: ['味多美'], group: '餐饮', subtype: '烘焙' }
];

const SPECIFIC_CATEGORY_RULES = [
  { group: '餐饮', subtype: '烘焙', label: '烘焙关键词', pattern: /西式糕点|糕饼店|糕点店|蛋糕店|面包店|烘焙坊|饼屋|烘焙|糕点|蛋糕|面包|西点/iu },
  { group: '餐饮', subtype: '饮品', label: '饮品关键词', pattern: /咖啡厅|咖啡馆|咖啡店|咖啡|茶饮|奶茶|饮品|饮料|果汁|茶座|酸奶|糖水|冰淇淋|冰激凌|豆花|烧仙草|甜品/iu },
  { group: '餐饮', subtype: '快餐', label: '快餐关键词', pattern: /快餐|小吃|简餐|面馆|面店|米粉|粉面|盖饭|汉堡|披萨|煎饼|饺子|包子|麻辣烫|冒菜/iu },
  { group: '餐饮', subtype: '商务餐', label: '商务餐关键词', pattern: /商务餐|商务宴请|商务宴会|会所餐厅/iu },
  { group: '餐饮', subtype: '正餐', label: '正餐关键词', pattern: /正餐|中餐|西餐|日料|日本料理|韩餐|火锅|烧烤|海鲜|餐厅|饭店|餐馆/iu },
  { group: '休闲娱乐', subtype: '休闲娱乐', label: '休闲娱乐关键词', pattern: /健身房|健身馆|运动馆|瑜伽|游泳馆|影院|电影院|KTV|台球|网吧|剧本杀|密室/iu },
  { group: '服务配套', subtype: '服务配套', label: '服务配套关键词', pattern: /美容院|美发店|理发店|洗衣店|维修店|照相馆|摄影馆|宠物医院|宠物美容|银行|邮局|快递站|旅行社|房产中介|家政/iu },
  { group: '零售', subtype: '零售', label: '零售关键词', pattern: /购物中心|商场|商城|百货|超市|便利店|服装店|鞋店|家居店|书店|药房|药店|眼镜店|宠物用品/iu }
];

const AMAP_TYPECODE_RULES = [
  { prefix: '0508', group: '餐饮', subtype: '烘焙', label: '高德糕饼店编码' },
  { prefix: '0505', group: '餐饮', subtype: '饮品', label: '高德咖啡厅编码' },
  { prefix: '0506', group: '餐饮', subtype: '饮品', label: '高德茶艺馆编码' },
  { prefix: '0507', group: '餐饮', subtype: '饮品', label: '高德冷饮店编码' },
  { prefix: '0509', group: '餐饮', subtype: '饮品', label: '高德甜品店编码' },
  { prefix: '0503', group: '餐饮', subtype: '快餐', label: '高德快餐厅编码' },
  { prefix: '0501', group: '餐饮', subtype: '正餐', label: '高德中餐厅编码' },
  { prefix: '0502', group: '餐饮', subtype: '正餐', label: '高德外国餐厅编码' },
  { prefix: '06', group: '零售', subtype: '零售', label: '高德购物服务编码' },
  { prefix: '07', group: '服务配套', subtype: '服务配套', label: '高德生活服务编码' },
  { prefix: '08', group: '休闲娱乐', subtype: '休闲娱乐', label: '高德体育休闲编码' }
];

function result(group, subtype, status, source, reason, confidence) {
  return { group, subtype, status, source, reason, confidence };
}

export function inferPoiCategory(poi = {}) {
  const name = String(poi.name || '').normalize('NFKC');
  const type = String(poi.type || '').normalize('NFKC');
  const text = `${name}${type}`;

  const brandRule = BRAND_CATEGORY_RULES.find(rule => rule.brands.some(brand => name.includes(brand)));
  if (brandRule) {
    const brand = brandRule.brands.find(item => name.includes(item));
    return result(brandRule.group, brandRule.subtype, 'confirmed', 'brand', `品牌规则：${brand}`, 100);
  }

  const keywordMatches = SPECIFIC_CATEGORY_RULES.filter(rule => rule.pattern.test(text));
  const uniqueCategories = new Map(keywordMatches.map(rule => [`${rule.group}/${rule.subtype}`, rule]));
  if (uniqueCategories.size === 1) {
    const rule = [...uniqueCategories.values()][0];
    return result(rule.group, rule.subtype, 'confirmed', 'keyword', rule.label, 90);
  }
  if (uniqueCategories.size > 1) {
    const labels = [...uniqueCategories.values()].map(rule => `${rule.group}/${rule.subtype}`).join('、');
    return result('待审核', '待审核', 'review', 'conflict', `关键词同时命中：${labels}`, 0);
  }

  const typecode = String(poi.typecode || '');
  const codeRule = AMAP_TYPECODE_RULES.find(rule => typecode.startsWith(rule.prefix));
  if (codeRule) return result(codeRule.group, codeRule.subtype, 'confirmed', 'typecode', codeRule.label, 75);

  if (typecode.startsWith('05')) {
    return result('餐饮', '待审核', 'review', 'typecode', '仅能确认属于餐饮，无法确定细分业态', 40);
  }
  return result('待审核', '待审核', 'review', 'unknown', '名称、类型和高德编码均不足以判断', 0);
}
