import { NextResponse as N } from 'next/server';
import { db, checkAuth, getSafeMongoInfo, sanitizeMongoError } from '../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' };

export async function GET(req) {
  const isAuthed = await checkAuth(req);
  if (!isAuthed) {
    return N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }

  const info = getSafeMongoInfo();
  try {
    const database = await db();
    await database.command({ ping: 1 });
    return N.json({
      ok: true,
      database: info.dbName,
      cluster: info.host,
      username: info.username
    }, { headers: noStore });
  } catch (err) {
    return N.json(
      {
        ok: false,
        database: info.dbName,
        cluster: info.host,
        username: info.username,
        error: sanitizeMongoError(err)
      },
      { status: 500, headers: noStore }
    );
  }
}
