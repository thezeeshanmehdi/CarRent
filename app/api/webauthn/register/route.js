import { NextResponse as N } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db, checkAuth, getWebAuthnRp, sanitizeMongoError } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function POST(req) {
  if (!(await checkAuth(req))) {
    return N.json({ error: 'unauthorized' }, { status: 401, headers: noStore });
  }

  try {
    const body = await req.json();
    const { rpID, origin: expectedOrigin } = getWebAuthnRp(req);

    const database = await db();
    const challengeDoc = await database.collection('webauthn_challenges').findOne({ type: 'register' });
    if (!challengeDoc) {
      return N.json({ error: 'No registration challenge found. Please try again.' }, { status: 400, headers: noStore });
    }

    // Clean up challenge
    await database.collection('webauthn_challenges').deleteMany({ type: 'register' });

    // Check challenge age (max 5 minutes)
    if (Date.now() - challengeDoc.createdAt.getTime() > 5 * 60 * 1000) {
      return N.json({ error: 'Challenge expired. Please try again.' }, { status: 400, headers: noStore });
    }

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return N.json({ error: 'Biometric verification failed' }, { status: 400, headers: noStore });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    // Save credential
    await database.collection('webauthn_credentials').insertOne({
      credentialID: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: body.response?.transports || [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      createdAt: new Date(),
    });

    return N.json({ ok: true }, { headers: noStore });
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStore });
  }
}

