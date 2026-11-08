import { NextResponse as N } from 'next/server';
import { db, sanitizeMongoError } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function GET() {
  try {
    const database = await db();
    const count = await database.collection('webauthn_credentials').countDocuments({});
    return N.json({ registered: count > 0 }, { headers: noStore });
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err), registered: false }, { status: 500, headers: noStore });
  }
}

export async function DELETE(req) {
  // Protected - only allow clearing credentials when authenticated
  const { checkAuth } = await import('../../../../lib/db');
  if (!(await checkAuth(req))) {
    return N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }
  try {
    const database = await db();
    await database.collection('webauthn_credentials').deleteMany({});
    return N.json({ ok: true }, { headers: noStore });
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStore });
  }
}

