import { NextResponse } from 'next/server';
import { getFeishuConfigStatus } from '@/lib/feishu.mjs';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'building-tenant-analysis',
    dataSource: getFeishuConfigStatus().configured ? 'feishu-ready' : 'mock',
    amapConfigured: Boolean(process.env.NEXT_PUBLIC_AMAP_KEY),
    feishuConfigured: getFeishuConfigStatus().configured,
    timestamp: new Date().toISOString()
  });
}
