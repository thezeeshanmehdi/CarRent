import { NextResponse as N } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { db, getWebAuthnRp, sanitizeMongoError } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function POST(req) {
  try {
    const { rpID } = getWebAuthnRp(req);

    const database = await db();
    const creds = await database.collection('webauthn_credentials').find({}).toArray();

    if (creds.length === 0) {
      return N.json({ error: 'No biometric credentials registered' }, { status: 404, headers: noStore });
    }

    const allowCredentials = creds.map((c) => ({
      id: c.credentialID,
      type: 'public-key',
      transports: c.transports || [],
    }));

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'required',
    });

    // Store challenge
    await database.collection('webauthn_challenges').deleteMany({});
    await database.collection('webauthn_challenges').insertOne({
      challenge: options.challenge,
      type: 'login',
      createdAt: new Date(),
    });

    return N.json(options, { headers: noStore });
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStore });
  }
}

