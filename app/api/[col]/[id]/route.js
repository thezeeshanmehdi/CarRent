import { NextResponse as N } from 'next/server';
import { db, bad, ObjectId, sanitizeMongoError } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

const no = () => N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
const fail = (e) => N.json({ error: sanitizeMongoError(e) }, { status: 500, headers: noStore });

export async function PUT(req, { params }) {
  const { col, id } = await params;
  if (await bad(req, col)) return no();
  try {
    const { _id, ...b } = await req.json();
    await (await db()).collection(col).updateOne({ _id: new ObjectId(id) }, { $set: b });
    return N.json({ ok: 1 }, { headers: noStore });
  } catch (e) { return fail(e); }
}

export async function DELETE(req, { params }) {
  const { col, id } = await params;
  if (await bad(req, col)) return no();
  try {
    await (await db()).collection(col).deleteOne({ _id: new ObjectId(id) });
    return N.json({ ok: 1 }, { headers: noStore });
  } catch (e) { return fail(e); }
}
