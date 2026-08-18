import { buildAnalysisPdf } from '@/lib/pdf-report.mjs';

export async function POST(request) {
  try {
    const report = await request.json();
    const pdf = buildAnalysisPdf(report);
    const name = String(report?.fileName || report?.title || '招商分析报告').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="analysis-report.pdf"; filename*=UTF-8''${encodeURIComponent(name)}.pdf`,
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    return Response.json({ ok: false, message: error.message || 'PDF 报告生成失败' }, { status: 400 });
  }
}
