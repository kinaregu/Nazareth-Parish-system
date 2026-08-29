import { NextResponse } from 'next/server';
import { pool } from '@nazareth/db';

// Liveness/readiness probe for Render / load balancers / CI smoke tests.
// Public by design (no PII); reports app + database health.
export async function GET() {
  let db = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    db = 'error';
  }
  const status = db === 'ok' ? 200 : 503;
  return NextResponse.json(
    { status: db === 'ok' ? 'ok' : 'degraded', db, time: new Date().toISOString() },
    { status },
  );
}
