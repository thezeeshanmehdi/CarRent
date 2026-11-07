import { NextResponse as N } from 'next/server';
import { db, bad, ObjectId } from '../../../../lib/db';
export const dynamic = 'force-dynamic';
const no = () => N.json({ error: 'unauthorized' }, { status: 401 });
export async function PUT(req, { params }) {
  const { col, id } = await params;
  if (bad(req, col)) return no();
  const { _id, ...b } = await req.json();
  await (await db()).collection(col).updateOne({ _id: new ObjectId(id) }, { $set: b });
  return N.json({ ok: 1 });
}
export async function DELETE(req, { params }) {
  const { col, id } = await params;
  if (bad(req, col)) return no();
  await (await db()).collection(col).deleteOne({ _id: new ObjectId(id) });
  return N.json({ ok: 1 });
}
