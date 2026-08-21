const BRAND_OVERRIDES = [
  // Brand semantics take precedence over Amap's sometimes broad type codes.
  { group: '餐饮', subtype: '饮品', pattern: /鲜芋仙/iu },
  { group: '餐饮', subtype: '烘焙', pattern: /味多美/iu }
];

const CATEGORY_PATTERNS = [
  { group: '休闲娱乐', subtype: '休闲娱乐', pattern: /健身|运动馆|瑜伽|游泳|影院|电影院|娱乐|KTV|台球|网吧|剧本杀|密室/iu },
  { group: '服务配套', subtype: '服务配套', pattern: /美容|美发|理发|洗衣|维修|摄影|宠物|银行|邮局|快递|旅行社|中介|服务中心|家政/iu },
  { group: '零售', subtype: '零售', pattern: /购物中心|商场|百货|超市|便利店|商店|零售|服装|鞋店|家居|书店|药房|眼镜店/iu },
  { group: '餐饮', subtype: '烘焙', pattern: /西式糕点|糕点店|蛋糕店|面包店|烘焙|糕点|蛋糕|面包|甜品店|西点/iu },
  { group: '餐饮', subtype: '饮品', pattern: /咖啡厅|咖啡馆|咖啡店|咖啡|茶饮|奶茶|饮品|饮料|果汁|茶座/iu },
  { group: '餐饮', subtype: '快餐', pattern: /快餐|小吃|简餐|面馆|面店|米粉|粉面|盖饭|汉堡|披萨|煎饼|饺子|包子/iu },
  { group: '餐饮', subtype: '商务餐', pattern: /商务餐|商务宴请|商务宴会|会所餐厅/iu },
  { group: '餐饮', subtype: '正餐', pattern: /正餐|中餐|西餐|日料|日本料理|韩餐|火锅|烧烤|海鲜|餐厅|饭店|餐馆/iu }
];

export function inferPoiCategory(poi = {}) {
  const text = `${poi.name || ''}${poi.type || ''}`.normalize('NFKC');
  const brandMatch = BRAND_OVERRIDES.find(item => item.pattern.test(text));
  if (brandMatch) return { group: brandMatch.group, subtype: brandMatch.subtype };
  const matched = CATEGORY_PATTERNS.find(item => item.pattern.test(text));
  if (matched) return { group: matched.group, subtype: matched.subtype };

  const typecode = String(poi.typecode || '');
  if (/^08/.test(typecode)) return { group: '休闲娱乐', subtype: '休闲娱乐' };
  if (/^07/.test(typecode)) return { group: '服务配套', subtype: '服务配套' };
  if (/^06/.test(typecode)) return { group: '零售', subtype: '零售' };
  return { group: '餐饮', subtype: '正餐' };
}
