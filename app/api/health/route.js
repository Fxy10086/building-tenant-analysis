import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'building-tenant-analysis',
    dataSource: 'mock',
    amapConfigured: Boolean(process.env.NEXT_PUBLIC_AMAP_KEY),
    feishuConfigured: Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET),
    timestamp: new Date().toISOString()
  });
}
