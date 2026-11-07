import { NextResponse as N } from 'next/server';
import { db, bad } from '../../../lib/db';
export const dynamic = 'force-dynamic';
const no = () => N.json({ error: 'unauthorized' }, { status: 401 });
export async function GET(req, { params }) {
  const { col } = await params;
  if (bad(req, col)) return no();
  const rows = await (await db()).collection(col).find().sort({ date: -1, _id: -1 }).toArray();
  return N.json(rows);
}
export async function POST(req, { params }) {
  const { col } = await params;
  if (bad(req, col)) return no();
  const b = await req.json();
  const r = await (await db()).collection(col).insertOne(b);
  return N.json({ ...b, _id: r.insertedId });
}
