import { NextResponse as N } from 'next/server';
import { db, bad, ObjectId, sanitizeMongoError, recomputeOilSummary } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

const no = () => N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
const fail = (e) => N.json({ error: sanitizeMongoError(e) }, { status: 500, headers: noStore });

export async function PUT(req, { params }) {
  const { col, id } = await params;
  if (await bad(req, col)) return no();
  try {
    const { _id, ...b } = await req.json();
    const database = await db();
    const collection = database.collection(col);
    const old = col === 'expenses' ? await collection.findOne({ _id: new ObjectId(id) }) : null;
    const update = { $set: b };
    if (col === 'expenses' && b.category && b.category !== 'Oil change') update.$unset = { odometer: '', nextDue: '' };
    await collection.updateOne({ _id: new ObjectId(id) }, update);
    if (col === 'expenses' && (old?.category === 'Oil change' || b.category === 'Oil change')) {
      await recomputeOilSummary(database, old?.carId);
      if (b.carId !== old?.carId) await recomputeOilSummary(database, b.carId);
    }
    return N.json({ ok: 1 }, { headers: noStore });
  } catch (e) { return fail(e); }
}

export async function DELETE(req, { params }) {
  const { col, id } = await params;
  if (await bad(req, col)) return no();
  try {
    const database = await db();
    const collection = database.collection(col);
    const old = col === 'expenses' ? await collection.findOne({ _id: new ObjectId(id) }) : null;
    await collection.deleteOne({ _id: new ObjectId(id) });
    if (old?.category === 'Oil change') await recomputeOilSummary(database, old.carId);
    return N.json({ ok: 1 }, { headers: noStore });
  } catch (e) { return fail(e); }
}
