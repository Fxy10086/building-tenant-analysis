import { NextResponse } from 'next/server';

const AMAP_BASE = 'https://restapi.amap.com';
const BUILDING_ADDRESS = '北京市海淀区中关村融科资讯中心';

function errorResponse(message, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
}

function isInsideTargetBuilding(poi) {
  if (poi.distance > 250) return false;
  const text = `${poi.name}${poi.address}`;
  return /融科(?:资讯|咨询|天地|中心|大厦|店)/.test(text) || /科学院?南路[2二]号/.test(text);
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
    const results = await Promise.all(createSearchSamples(origin, radius).map(sample =>
      amapRequest('/v3/place/around', {
        location: sample.location,
        radius: sample.radius,
        keywords,
        types,
        city: '110000',
        city_limit: 'true',
        sortrule: 'distance',
        extensions: 'all',
        offset: sample.offset,
        page: 1
      })
    ));
    const successfulResults = results.filter(result => !result.error);
    if (!successfulResults.length) {
      return errorResponse(results[0]?.error || '高德范围搜索失败', results[0]?.status || 502);
    }
    const rawPois = successfulResults.flatMap(result => result.data.pois || []);

    const pois = rawPois.map(poi => {
      const [lng, lat] = String(poi.location || '').split(',').map(Number);
      const rating = typeof poi.biz_ext?.rating === 'string' && poi.biz_ext.rating ? poi.biz_ext.rating : null;
      const cost = typeof poi.biz_ext?.cost === 'string' && poi.biz_ext.cost ? poi.biz_ext.cost : null;
      return {
        id: poi.id,
        name: poi.name,
        address: Array.isArray(poi.address) ? poi.address.join('') : poi.address || '地址待补充',
        type: poi.type || '',
        typecode: poi.typecode || '',
        distance: Number.isFinite(lng) && Number.isFinite(lat) ? distanceInMeters(origin, [lng, lat]) : 0,
        lng,
        lat,
        rating,
        cost
      };
    })
      .filter(poi => poi.id && Number.isFinite(poi.lng) && Number.isFinite(poi.lat))
      .filter(poi => poi.distance <= radius)
      .filter(poi => !isInsideTargetBuilding(poi))
      .filter((poi, index, items) => items.findIndex(item => item.id === poi.id) === index)
      .sort((first, second) => first.distance - second.distance);

    return NextResponse.json({ ok: true, pois });
  }

  return errorResponse('不支持的高德操作');
}
