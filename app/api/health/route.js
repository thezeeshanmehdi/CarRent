import { NextResponse as N } from 'next/server';
import { db, checkAuth } from '../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

export async function GET(req) {
  const isAuthed = await checkAuth(req);
  if (!isAuthed) {
    return N.json({ ok: false }, { status: 401, headers: noStore });
  }

  try {
    const database = await db();
    await database.command({ ping: 1 });
    return N.json({ ok: true }, { headers: noStore });
  } catch {
    return N.json({ ok: false }, { status: 500, headers: noStore });
  }
}
