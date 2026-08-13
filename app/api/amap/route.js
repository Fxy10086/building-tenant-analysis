import { NextResponse } from 'next/server';

const AMAP_BASE = 'https://restapi.amap.com';
const BUILDING_ADDRESS = '北京市海淀区中关村融科资讯中心';
const PINNED_MALLS = ['五道口购物中心', '大融城'];
const MALL_SEARCH_RADIUS = 500;
const MALL_DEEP_SEARCH_PAGES = 3;

function errorResponse(message, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isInsideTargetBuilding(poi) {
  if (poi.distance > 250) return false;
  const text = `${poi.name}${poi.address}${poi.mall || ''}`;
  return /融科(?:资讯|咨询|天地|中心|大厦|店)/.test(text) || /科学院?南路[2二]号/.test(text);
}

function matchesKeyword(poi, keyword) {
  if (!keyword) return true;
  return `${poi.name || ''}${poi.address || ''}${poi.type || ''}`.toLowerCase().includes(keyword.toLowerCase());
}

function matchesTypes(poi, types) {
  if (!types) return true;
  const typecode = String(poi.typecode || '');
  return types.split('|').some(type => {
    const prefix = type.replace(/0+$/, '');
    return prefix && typecode.startsWith(prefix);
  });
}

function isMerchantPoi(poi) {
  const typecode = String(poi.typecode || '');
  const text = `${poi.name || ''}${poi.type || ''}`;
  if (typecode === '060100') return false;
  return !/(停车场|充电站|卫生间|洗手间|出入口|入口|出口|电梯|扶梯|服务台|客服中心|母婴室|公共电话|ATM|车库)/.test(text);
}

function normalizePoi(poi, origin, mall = null) {
  const fallbackLocation = mall?.location || '';
  const [lng, lat] = String(poi.location || fallbackLocation).split(',').map(Number);
  const rating = typeof poi.biz_ext?.rating === 'string' && poi.biz_ext.rating ? poi.biz_ext.rating : null;
  const cost = typeof poi.biz_ext?.cost === 'string' && poi.biz_ext.cost ? poi.biz_ext.cost : null;
  const childAddress = Array.isArray(poi.address) ? poi.address.join('') : poi.address || '';
  const mallName = mall?.name || '';
  return {
    id: poi.id,
    name: poi.name,
    address: childAddress || (mallName ? `${mallName}内` : '地址待补充'),
    mall: mallName,
    type: poi.type || '',
    typecode: poi.typecode || '',
    distance: Number.isFinite(lng) && Number.isFinite(lat) ? distanceInMeters(origin, [lng, lat]) : 0,
    lng,
    lat,
    rating,
    cost
  };
}

function normalizeMallName(name = '') {
  return name.toLowerCase().replace(/[\s·•()（）-]/g, '').replace(/北京|购物中心|商场|商城|mall/g, '');
}

function belongsToMall(poi, mall) {
  if (poi.parent && poi.parent === mall.id) return true;
  const mallName = normalizeMallName(mall.name);
  if (!mallName) return false;
  const text = normalizeMallName(`${poi.address || ''}${poi.pname || ''}${poi.cityname || ''}${poi.adname || ''}`);
  return text.includes(mallName);
}

function isNearMall(poi, mall, radius = MALL_SEARCH_RADIUS) {
  const [lng, lat] = String(poi.location || '').split(',').map(Number);
  const [mallLng, mallLat] = String(mall.location || '').split(',').map(Number);
  return Number.isFinite(lng) && Number.isFinite(lat) && Number.isFinite(mallLng) && Number.isFinite(mallLat) &&
    distanceInMeters([lng, lat], [mallLng, mallLat]) <= radius;
}

function mallSearchKeywords(mallName, keyword, type) {
  if (keyword) return `${mallName} ${keyword}`;
  if (type.startsWith('050')) return `${mallName} 餐饮`;
  if (type.startsWith('0801')) return `${mallName} 健身`;
  return `${mallName} 店铺`;
}

function pinnedMallName(mall) {
  const normalizedName = normalizeMallName(mall.name);
  return PINNED_MALLS.find(name => {
    const normalizedPinnedName = normalizeMallName(name);
    return normalizedName.includes(normalizedPinnedName) || normalizedPinnedName.includes(normalizedName);
  });
}

function distanceInMeters(origin, target) {
  const toRadians = value => value * Math.PI / 180;
  const [originLng, originLat] = origin;
  const [targetLng, targetLat] = target;
  const latDelta = toRadians(targetLat - originLat);
  const lngDelta = toRadians(targetLng - originLng);
  const startLat = toRadians(originLat);
  const endLat = toRadians(targetLat);
  const value = Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(lngDelta / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

function offsetLocation(origin, distance, angle) {
  const [lng, lat] = origin;
  const radians = angle * Math.PI / 180;
  const north = Math.cos(radians) * distance;
  const east = Math.sin(radians) * distance;
  const nextLat = lat + north / 111320;
  const nextLng = lng + east / (111320 * Math.cos(lat * Math.PI / 180));
  return `${nextLng.toFixed(6)},${nextLat.toFixed(6)}`;
}

function createSearchSamples(origin, radius) {
  const center = origin.join(',');
  if (radius <= 1000) return [{ location: center, radius, offset: 25 }];

  const samples = [{ location: center, radius: Math.ceil(radius * 0.35), offset: 15 }];
  if (radius >= 5000) {
    [0, 90, 180, 270].forEach(angle => {
      samples.push({
        location: offsetLocation(origin, radius * 0.45, angle),
        radius: Math.ceil(radius * 0.3),
        offset: 10
      });
    });
  }
  for (let angle = 0; angle < 360; angle += 45) {
    samples.push({
      location: offsetLocation(origin, radius * 0.85, angle),
      radius: Math.ceil(radius * 0.3),
      offset: radius >= 5000 ? 10 : 15
    });
  }
  return samples;
}

async function amapRequest(path, params) {
  const key = process.env.AMAP_WEB_SERVICE_KEY;
  if (!key) return { error: '高德 Web 服务 Key 尚未配置', status: 503 };

  const url = new URL(path, AMAP_BASE);
  url.searchParams.set('key', key);
  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(name, String(value));
    }
  });

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) return { error: '高德服务暂时不可用', status: 502 };
  const data = await response.json();
  if (data.status !== '1') return { error: data.info || '高德服务返回异常', status: 502 };
  return { data };
}

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const action = params.get('action');

  if (action === 'geocode') {
    const address = (params.get('address') || BUILDING_ADDRESS).slice(0, 120);
    const result = await amapRequest('/v3/geocode/geo', {
      address,
      city: '北京',
      output: 'json'
    });
    if (result.error) return errorResponse(result.error, result.status);
    const geocode = result.data.geocodes?.[0];
    if (!geocode?.location) return errorResponse('未找到写字楼坐标', 404);
    const [lng, lat] = geocode.location.split(',').map(Number);
    return NextResponse.json({
      ok: true,
      building: { address, formattedAddress: geocode.formatted_address, lng, lat }
    });
  }

  if (action === 'around') {
    const location = params.get('location');
    if (!/^\d{2,3}\.\d+,-?\d{2}\.\d+$/.test(location || '')) {
      return errorResponse('缺少有效的中心坐标');
    }
    const radius = Math.min(10000, Math.max(100, Number(params.get('radius')) || 1000));
    const origin = location.split(',').map(Number);
    const keywords = (params.get('keywords') || '').slice(0, 50);
    const types = (params.get('types') || '').slice(0, 80);
    const samples = createSearchSamples(origin, radius);
    const typeQueries = types.includes('|') ? types.split('|').filter(Boolean) : [types];
    const results = [];
    for (let index = 0; index < samples.length; index += 3) {
      const batch = samples.slice(index, index + 3);
      const batchResults = await Promise.all(batch.flatMap(sample =>
        typeQueries.map(typeQuery => amapRequest('/v3/place/around', {
            location: sample.location,
            radius: sample.radius,
            keywords,
            types: typeQuery,
            city: '110000',
            city_limit: 'true',
            sortrule: 'distance',
            extensions: 'all',
            offset: sample.offset,
            page: 1
          }))
      ));
      results.push(...batchResults);
    }

    // Shopping-center POIs expose their internal stores as children. Fetch the
    // nearest centers separately because category searches often omit them.
    const nearbyMallSearchResults = await Promise.all(
      [1, 2, 3].map(page => amapRequest('/v3/place/around', {
        location,
        radius,
        types: '060100',
        city: '110000',
        city_limit: 'true',
        sortrule: 'distance',
        extensions: 'all',
        offset: 25,
        page
      }))
    );
    const pinnedMallSearchResults = await Promise.all(
      PINNED_MALLS.map(name => amapRequest('/v3/place/text', {
        keywords: name,
        city: '110000',
        city_limit: 'true',
        extensions: 'all',
        offset: 25,
        page: 1
      }).then(result => ({ result, name })))
    );
    const nearbyMalls = nearbyMallSearchResults.flatMap(result => result.data?.pois || []);
    const pinnedMalls = pinnedMallSearchResults.flatMap(({ result, name }) =>
      (result.data?.pois || [])
        .filter(mall => {
          const mallName = normalizeMallName(mall.name);
          const expectedName = normalizeMallName(name);
          return mallName.includes(expectedName) || expectedName.includes(mallName);
        })
        .map(mall => ({ ...mall, name }))
    );
    const malls = [...pinnedMalls, ...nearbyMalls]
      .filter(mall => mall.id && mall.location)
      .filter((mall, index, items) => items.findIndex(item => item.id === mall.id) === index)
      .filter(mall => {
        const coordinates = mall.location.split(',').map(Number);
        return coordinates.length === 2 && distanceInMeters(origin, coordinates) <= radius;
      });
    const mallDetailResults = malls.length ? await Promise.all(
      malls.slice(0, 15).map(mall => amapRequest('/v3/place/detail', {
        id: mall.id,
        extensions: 'all'
      }))
    ) : [];
    const detailedMalls = mallDetailResults.flatMap(result => result.data?.pois || []);
    const mallById = new Map(malls.map(mall => [mall.id, mall]));
    detailedMalls.forEach(mall => mallById.set(mall.id, { ...mallById.get(mall.id), ...mall }));
    const mallEntries = [...mallById.values()]
      .sort((first, second) => Number(Boolean(pinnedMallName(second))) - Number(Boolean(pinnedMallName(first))))
      .slice(0, 15);
    const tenantSearchResults = await Promise.all(
      mallEntries.map(mall => amapRequest('/v3/place/around', {
        location: mall.location,
        radius: MALL_SEARCH_RADIUS,
        city: '110000',
        city_limit: 'true',
        sortrule: 'distance',
        extensions: 'all',
        offset: 25,
        page: 1
      }))
    );
    // Amap does not consistently expose a store's parent shopping mall. Query
    // each mall by name as well, so stores whose address lacks a parent field
    // are still available to the search result.
    const pinnedMallEntries = mallEntries.filter(pinnedMallName);
    const mallTenantTextResults = await Promise.all(
      pinnedMallEntries.flatMap(mall => typeQueries.flatMap(typeQuery =>
        Array.from({ length: MALL_DEEP_SEARCH_PAGES }, (_, index) => amapRequest('/v3/place/text', {
          keywords: mallSearchKeywords(pinnedMallName(mall) || mall.name, keywords, typeQuery || '060000'),
          types: typeQuery,
          city: '110000',
          city_limit: 'true',
          extensions: 'all',
          offset: 25,
          page: index + 1
        }).then(result => ({ result, mall })))
      ))
    );
    const pinnedMallAroundResults = await Promise.all(
      pinnedMallEntries.flatMap(mall => typeQueries.flatMap(typeQuery =>
        Array.from({ length: MALL_DEEP_SEARCH_PAGES }, (_, index) => amapRequest('/v3/place/around', {
          location: mall.location,
          radius: MALL_SEARCH_RADIUS,
          keywords,
          types: typeQuery,
          city: '110000',
          city_limit: 'true',
          sortrule: 'distance',
          extensions: 'all',
          offset: 25,
          page: index + 1
        }).then(result => ({ result, mall })))
      ))
    );

    const successfulResults = results.filter(result => !result.error);
    if (!successfulResults.length) {
      return errorResponse(results[0]?.error || '高德范围搜索失败', results[0]?.status || 502);
    }
    const directPois = successfulResults.flatMap(result => result.data.pois || [])
      .map(poi => normalizePoi(poi, origin, mallById.get(poi.parent)));
    const mallPois = [...mallById.values()].flatMap(mall =>
      (Array.isArray(mall.children) ? mall.children : []).map(child => normalizePoi(child, origin, mall))
    );
    const searchedMallPois = tenantSearchResults.flatMap((result, index) => {
      const mall = mallEntries[index];
      return (result.data?.pois || [])
        .filter(poi => belongsToMall(poi, mall) || isNearMall(poi, mall))
        .map(poi => normalizePoi(poi, origin, mall));
    });
    const namedMallPois = mallTenantTextResults.flatMap(({ result, mall }) =>
      (result.data?.pois || [])
        .filter(poi => isNearMall(poi, mall) || belongsToMall(poi, mall))
        .map(poi => normalizePoi(poi, origin, mall))
    );
    const deepMallPois = pinnedMallAroundResults.flatMap(({ result, mall }) =>
      (result.data?.pois || [])
        .filter(poi => isNearMall(poi, mall) || belongsToMall(poi, mall))
        .map(poi => normalizePoi(poi, origin, mall))
    );

    const pois = [...directPois, ...mallPois, ...searchedMallPois, ...namedMallPois, ...deepMallPois]
      .filter(poi => poi.id && Number.isFinite(poi.lng) && Number.isFinite(poi.lat))
      .filter(poi => !mallById.has(poi.id))
      .filter(isMerchantPoi)
      .filter(poi => poi.distance <= radius)
      .filter(poi => matchesKeyword(poi, keywords))
      .filter(poi => matchesTypes(poi, types))
      .filter(poi => !isInsideTargetBuilding(poi))
      .filter((poi, index, items) => items.findIndex(item => item.id === poi.id) === index)
      .sort((first, second) => first.distance - second.distance);

    return NextResponse.json({ ok: true, pois });
  }

  return errorResponse('不支持的高德操作');
}
