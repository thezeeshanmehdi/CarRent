import { NextResponse as N } from 'next/server';
import { db, bad, sanitizeMongoError, recomputeOilSummary } from '../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

const no = () => N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
const fail = (e) => N.json({ error: sanitizeMongoError(e) }, { status: 500, headers: noStore });

export async function GET(req, { params }) {
  const { col } = await params;
  if (await bad(req, col)) return no();
  try {
    const data = await (await db()).collection(col).find().sort({ date: -1, _id: -1 }).toArray();
    return N.json(data, { headers: noStore });
  } catch (e) { return fail(e); }
}

export async function POST(req, { params }) {
  const { col } = await params;
  if (await bad(req, col)) return no();
  try {
    const { _id, ...b } = await req.json();
    const database = await db();
    const r = await database.collection(col).insertOne(b);
    if (col === 'expenses' && b.category === 'Oil change') await recomputeOilSummary(database, b.carId);
    return N.json({ ...b, _id: r.insertedId }, { headers: noStore });
  } catch (e) { return fail(e); }
}
