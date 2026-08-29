import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCtx } from '@/lib/api';
import { queryOne, queryValue } from '@nazareth/db';
import { audit } from '@nazareth/core';
import PDFDocument from 'pdfkit';

export const dynamic = 'force-dynamic';

/**
 * PDF receipt for one giving record.
 * Allowed for the donor (linked member) or anyone holding giving.view.
 * Anonymous gifts have no receipt.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  return withCtx(async (req, ctx) => {
    const c = ctx as any;
    const g = await queryOne<any>(
      `SELECT g.id, g.receipt_no, g.amount, g.tx_date, g.method, g.is_anonymous, g.fund_id, g.member_id,
              gf.name AS fund_name,
              m.first_name || COALESCE(' ' || m.middle_name, '') || ' ' || m.last_name AS payer_name
         FROM giving_transactions g
         JOIN giving_funds gf ON gf.id = g.fund_id
         LEFT JOIN members m ON m.id = g.member_id
        WHERE g.id = $1 AND g.deleted_at IS NULL`,
      [params.id],
    );
    if (!g || g.status !== 'recorded') {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Giving record not found.' } }, { status: 404 });
    }
    const isDonor = Boolean(g.member_id && c.scope.linkedMemberId === g.member_id);
    const isFinance = c.scope.isSuper || c.scope.permissions.has('giving.view');
    if (!isDonor && !isFinance) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to view this record.' } }, { status: 403 });
    }
    if (g.is_anonymous) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Anonymous gifts do not carry receipts.' } }, { status: 403 });
    }
    const currency = await queryValue<string>('SELECT default_currency FROM organizations WHERE id = $1', [c.scope.orgId]) ?? 'SSP';

    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    doc.on('data', (ch: Buffer) => chunks.push(ch));
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1b3a6b').text('Nazareth Parish Church', { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#444').text('Giving Receipt', { align: 'center' });
    doc.moveDown(1.5).fontSize(10).fillColor('#000');
    doc.text(`Receipt no: ${g.receipt_no ?? '—'}`);
    doc.text(`Date: ${new Date(g.tx_date).toLocaleDateString('en-GB')}`);
    doc.text(`Payer: ${g.payer_name ?? 'Anonymous'}`);
    doc.text(`Fund: ${g.fund_name}`);
    doc.text(`Method: ${g.method}`);
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(12);
    doc.text(`Amount: ${currency} ${Number(g.amount).toFixed(2)}`);
    doc.moveDown(2).font('Helvetica').fontSize(9.5).fillColor('#666').text('Thank you for your generosity to the work of the parish.', { align: 'center' });
    doc.end();
    await new Promise<void>((resolve, reject) => {
      doc.on('end', () => resolve());
      doc.on('error', reject);
    });
    await audit({ userId: c.userId, orgId: c.scope.orgId, action: 'giving.receipt', entity: 'giving_transaction', entityId: params.id, ip: c.ip, metadata: { donor: isDonor } });
    return new NextResponse(new Uint8Array(Buffer.concat(chunks)), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="receipt_${g.receipt_no ?? params.id}.pdf"` },
    });
  })(req);
}
