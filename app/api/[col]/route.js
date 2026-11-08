import { NextResponse as N } from 'next/server';
import { db, bad } from '../../../lib/db';
export const dynamic = 'force-dynamic';
const no = () => N.json({ error: 'unauthorized' }, { status: 401 });
const fail = (e) => N.json({ error: e.message || 'Server error' }, { status: 500 });
export async function GET(req, { params }) {
  const { col } = await params;
  if (bad(req, col)) return no();
  try {
    return N.json(await (await db()).collection(col).find().sort({ date: -1, _id: -1 }).toArray());
  } catch (e) { return fail(e); }
}
export async function POST(req, { params }) {
  const { col } = await params;
  if (bad(req, col)) return no();
  try {
    const { _id, ...b } = await req.json();
    const r = await (await db()).collection(col).insertOne(b);
    return N.json({ ...b, _id: r.insertedId });
  } catch (e) { return fail(e); }
}
