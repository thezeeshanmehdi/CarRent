import { NextResponse as N } from 'next/server';
import { db, pinOk, makeToken, sanitizeMongoError } from '../../../lib/db';

export const dynamic = 'force-dynamic';
const MAX = 5, LOCK = 15 * 60e3;

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
};

export async function POST(req) {
  const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  let col, rec;
  try {
    col = (await db()).collection('_auth');
    rec = await col.findOne({ _id: ip });
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStoreHeaders });
  }

  if (rec?.until > Date.now()) {
    const minsLeft = Math.max(1, Math.ceil((rec.until - Date.now()) / 60000));
    return N.json({ error: `Too many wrong attempts. Try again in ${minsLeft} minutes.` }, { status: 429, headers: noStoreHeaders });
  }

  const { pin } = await req.json().catch(() => ({}));
  try {
    const isValid = await pinOk(pin);
    if (!isValid) {
      const n = (rec?.n || 0) + 1;
      try {
        await col?.updateOne(
          { _id: ip },
          { $set: { n: n >= MAX ? 0 : n, until: n >= MAX ? Date.now() + LOCK : 0 } },
          { upsert: true }
        );
      } catch {}
      await new Promise((r) => setTimeout(r, 700));
      return N.json({ error: 'Wrong PIN' }, { status: 401, headers: noStoreHeaders });
    }
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStoreHeaders });
  }

  try { await col?.deleteOne({ _id: ip }); } catch {}
  const res = N.json({ ok: 1 }, { headers: noStoreHeaders });
  const token = await makeToken();
  res.cookies.set('cr_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = N.json({ ok: 1 }, { headers: noStoreHeaders });
  res.cookies.set('cr_session', '', { path: '/', maxAge: 0, sameSite: 'lax' });
  return res;
}
