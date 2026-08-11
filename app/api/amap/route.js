import { NextResponse } from 'next/server';

const AMAP_BASE = 'https://restapi.amap.com';
const BUILDING_ADDRESS = '北京市海淀区中关村融科资讯中心';

function errorResponse(message, status = 400) {
  return NextResponse.json({ ok: false, message }, { status });
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
    const result = await amapRequest('/v3/place/around', {
      location,
      radius,
      keywords: (params.get('keywords') || '').slice(0, 50),
      types: (params.get('types') || '').slice(0, 80),
      city: '110000',
      city_limit: 'true',
      sortrule: 'distance',
      extensions: 'all',
      offset: 20,
      page: 1
    });
    if (result.error) return errorResponse(result.error, result.status);

    const pois = (result.data.pois || []).map(poi => {
      const [lng, lat] = String(poi.location || '').split(',').map(Number);
      const rating = typeof poi.biz_ext?.rating === 'string' && poi.biz_ext.rating ? poi.biz_ext.rating : null;
      const cost = typeof poi.biz_ext?.cost === 'string' && poi.biz_ext.cost ? poi.biz_ext.cost : null;
      return {
        id: poi.id,
        name: poi.name,
        address: Array.isArray(poi.address) ? poi.address.join('') : poi.address || '地址待补充',
        type: poi.type || '',
        typecode: poi.typecode || '',
        distance: Number(poi.distance) || 0,
        lng,
        lat,
        rating,
        cost
      };
    }).filter(poi => poi.id && Number.isFinite(poi.lng) && Number.isFinite(poi.lat));

    return NextResponse.json({ ok: true, pois });
  }

  return errorResponse('不支持的高德操作');
}
