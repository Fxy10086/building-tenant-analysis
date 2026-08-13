import { NextResponse } from 'next/server';
import { getFeishuConfigStatus, syncFeishuSalesTable } from '@/lib/feishu.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const action = request.nextUrl.searchParams.get('action') || 'status';
  if (action === 'status') return NextResponse.json({ ok: true, ...getFeishuConfigStatus() });
  if (action === 'records') {
    try {
      const result = await syncFeishuSalesTable();
      return NextResponse.json({ ok: true, tableId: result.tableId, tableName: result.tableName, recordCount: result.recordCount, records: result.records, syncedAt: result.syncedAt });
    } catch (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status || 502 });
    }
  }
  return NextResponse.json({ ok: false, message: 'Unsupported Feishu action' }, { status: 400 });
}

export async function POST() {
  try {
    const result = await syncFeishuSalesTable();
    return NextResponse.json({
      ok: true,
      tableId: result.tableId,
      tableName: result.tableName,
      recordCount: result.recordCount,
      syncedAt: result.syncedAt,
      storage: 'not-configured'
    });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: error.status || 502 });
  }
}
