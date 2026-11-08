import { NextResponse as N } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { db, getWebAuthnRp, makeToken, sanitizeMongoError } from '../../../../lib/db';

export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

export async function POST(req) {
  try {
    const body = await req.json();
    const { rpID, origin: expectedOrigin } = getWebAuthnRp(req);

    const database = await db();
    const challengeDoc = await database.collection('webauthn_challenges').findOne({ type: 'login' });
    if (!challengeDoc) {
      return N.json({ error: 'No login challenge found. Please try again.' }, { status: 400, headers: noStore });
    }

    await database.collection('webauthn_challenges').deleteMany({ type: 'login' });

    if (Date.now() - challengeDoc.createdAt.getTime() > 5 * 60 * 1000) {
      return N.json({ error: 'Challenge expired. Please try again.' }, { status: 400, headers: noStore });
    }

    // Find the credential
    const credentialID = body.id;
    const storedCred = await database.collection('webauthn_credentials').findOne({ credentialID });
    if (!storedCred) {
      return N.json({ error: 'Unknown credential' }, { status: 400, headers: noStore });
    }

    // Reconstruct the public key as Uint8Array
    const publicKey = isoBase64URL.toBuffer(storedCred.publicKey);

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: storedCred.credentialID,
        publicKey,
        counter: storedCred.counter,
        transports: storedCred.transports || [],
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      return N.json({ error: 'Biometric verification failed' }, { status: 401, headers: noStore });
    }

    // Update counter
    await database.collection('webauthn_credentials').updateOne(
      { credentialID },
      { $set: { counter: verification.authenticationInfo.newCounter } }
    );

    // Set session cookie (session-based, no maxAge)
    const token = await makeToken();
    const res = N.json({ ok: true }, { headers: noStore });
    res.cookies.set('cr_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return res;
  } catch (err) {
    return N.json({ error: sanitizeMongoError(err) }, { status: 500, headers: noStore });
  }
}

