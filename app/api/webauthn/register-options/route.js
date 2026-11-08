import { NextResponse as N } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { db, checkAuth, getWebAuthnRp, sanitizeMongoError } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function POST(req) {
  if (!(await checkAuth(req))) {
    return N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }

  try {
    const { rpID } = getWebAuthnRp(req);

    const database = await db();
    const creds = await database.collection('webauthn_credentials').find({}).toArray();
    const excludeCredentials = creds.map((c) => ({
      id: c.credentialID,
      type: 'public-key',
      transports: c.transports || [],
    }));

    const options = await generateRegistrationOptions({
      rpName: 'CarRent',
      rpID,
      userName: 'carrent-user',
      userDisplayName: 'CarRent User',
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      excludeCredentials,
    });

    // Store challenge in DB for verification
    await database.collection('webauthn_challenges').deleteMany({});
    await database.collection('webauthn_challenges').insertOne({
      challenge: options.challenge,
      type: 'register',
      createdAt: new Date(),
    });

    return N.json(options, { headers: noStore });
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStore });
  }
}

