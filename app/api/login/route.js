import { NextResponse as N } from 'next/server';
import { db, pinOk, makeToken } from '../../../lib/db';
export const dynamic = 'force-dynamic';
const MAX = 5, LOCK = 15 * 60e3;
export async function POST(req) {
  const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  let col, rec;
  try { col = (await db()).collection('_auth'); rec = await col.findOne({ _id: ip }); } catch {}
  if (rec?.until > Date.now()) return N.json({ error: 'Too many wrong attempts. Try again in 15 minutes.' }, { status: 429 });
  const { pin } = await req.json().catch(() => ({}));
  if (!pinOk(pin)) {
    const n = (rec?.n || 0) + 1;
    try { await col?.updateOne({ _id: ip }, { $set: { n: n >= MAX ? 0 : n, until: n >= MAX ? Date.now() + LOCK : 0 } }, { upsert: true }); } catch {}
    await new Promise((r) => setTimeout(r, 700));
    return N.json({ error: 'Wrong PIN' }, { status: 401 });
  }
  try { await col?.deleteOne({ _id: ip }); } catch {}
  const res = N.json({ ok: 1 });
  res.cookies.set('cr_session', makeToken(), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 30 * 86400 });
  return res;
}
export async function DELETE() {
  const res = N.json({ ok: 1 });
  res.cookies.set('cr_session', '', { path: '/', maxAge: 0 });
  return res;
}
