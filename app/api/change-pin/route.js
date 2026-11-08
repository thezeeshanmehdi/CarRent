import { NextResponse as N } from 'next/server';
import { db, checkAuth, pinOk, hashPin, getAuthInfo, makeToken, sanitizeMongoError } from '../../../lib/db';

export const dynamic = 'force-dynamic';
const MAX = 5, LOCK = 15 * 60e3;
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

export async function POST(req) {
  const isAuthed = await checkAuth(req);
  if (!isAuthed) {
    return N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }

  const ip = (req.headers.get('x-forwarded-for') || 'x').split(',')[0].trim();
  let col, rec;
  try {
    col = (await db()).collection('_auth');
    rec = await col.findOne({ _id: ip });
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStore });
  }

  if (rec?.until > Date.now()) {
    const minsLeft = Math.max(1, Math.ceil((rec.until - Date.now()) / 60000));
    return N.json({ error: `Too many wrong attempts. Try again in ${minsLeft} minutes.` }, { status: 429, headers: noStore });
  }

  const body = await req.json().catch(() => ({}));
  const { oldPin, newPin, confirmPin } = body;

  if (!oldPin) {
    return N.json({ error: 'Old PIN is required' }, { status: 400, headers: noStore });
  }

  const isOldValid = await pinOk(oldPin);
  if (!isOldValid) {
    const n = (rec?.n || 0) + 1;
    try {
      await col?.updateOne(
        { _id: ip },
        { $set: { n: n >= MAX ? 0 : n, until: n >= MAX ? Date.now() + LOCK : 0 } },
        { upsert: true }
      );
    } catch {}
    await new Promise((r) => setTimeout(r, 700));
    return N.json({ error: 'Old PIN is wrong' }, { status: 401, headers: noStore });
  }

  if (!newPin || typeof newPin !== 'string') {
    return N.json({ error: 'New PIN is required' }, { status: 400, headers: noStore });
  }
  if (newPin.length < 4) {
    return N.json({ error: 'New PIN must be at least 4 characters' }, { status: 400, headers: noStore });
  }
  if (newPin.length > 64) {
    return N.json({ error: 'New PIN cannot exceed 64 characters' }, { status: 400, headers: noStore });
  }
  if (newPin !== confirmPin) {
    return N.json({ error: 'New PIN and confirm PIN do not match' }, { status: 400, headers: noStore });
  }
  if (newPin === oldPin) {
    return N.json({ error: 'New PIN must be different from old PIN' }, { status: 400, headers: noStore });
  }

  const weakValues = ['123456', '654321', '12345678', 'password', 'admin123', '000000', '111111', '999999'];
  const allSameChar = /^(.)\1+$/.test(newPin);
  if (weakValues.includes(newPin.toLowerCase()) || allSameChar) {
    return N.json({ error: 'New PIN is too weak. Avoid repeated or sequential characters.' }, { status: 400, headers: noStore });
  }

  try {
    const { hash, salt } = hashPin(newPin);
    const auth = await getAuthInfo();
    const nextVersion = (auth.version || 0) + 1;
    const database = await db();
    await database.collection('settings').updateOne(
      { _id: 'auth' },
      {
        $set: {
          hash,
          salt,
          version: nextVersion,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );

    await col?.deleteOne({ _id: ip });

    const res = N.json({ ok: 1, message: 'PIN changed successfully' }, { headers: noStore });
    const freshToken = await makeToken();
    res.cookies.set('cr_session', freshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 86400
    });
    return res;
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStore });
  }
}
