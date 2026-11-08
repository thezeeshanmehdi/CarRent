import { MongoClient, ObjectId } from 'mongodb';
import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from 'crypto';

export { ObjectId };

export function normalizeMongoUri(rawUri) {
  if (!rawUri || typeof rawUri !== 'string') {
    throw new Error('MONGODB_URI is not set');
  }
  let uri = rawUri.trim();
  if ((uri.startsWith('"') && uri.endsWith('"')) || (uri.startsWith("'") && uri.endsWith("'"))) {
    uri = uri.slice(1, -1).trim();
  }

  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://');
  }
  if (uri.includes('<') || uri.includes('>')) {
    throw new Error('MONGODB_URI contains unreplaced placeholder < or >. Please update with your actual Atlas credentials.');
  }

  const schemeIdx = uri.indexOf('://');
  const scheme = uri.slice(0, schemeIdx + 3);
  const rest = uri.slice(schemeIdx + 3);

  const lastAt = rest.lastIndexOf('@');
  if (lastAt !== -1) {
    const creds = rest.slice(0, lastAt);
    const hostPart = rest.slice(lastAt + 1);

    const colonIdx = creds.indexOf(':');
    let user = creds;
    let pass = '';
    if (colonIdx !== -1) {
      user = creds.slice(0, colonIdx);
      pass = creds.slice(colonIdx + 1);
    }

    const safeEncode = (val) => {
      let raw = val;
      try {
        raw = decodeURIComponent(val);
      } catch {
        raw = val;
      }
      return encodeURIComponent(raw);
    };

    const encodedUser = safeEncode(user);
    const encodedPass = pass !== '' ? ':' + safeEncode(pass) : '';
    uri = `${scheme}${encodedUser}${encodedPass}@${hostPart}`;
  }

  return uri;
}

export function sanitizeMongoError(err) {
  const msg = String(err?.message || err || '');
  if (!process.env.MONGODB_URI) {
    return 'MONGODB_URI is not set. Add it in Vercel environment variables or .env.local.';
  }
  if (/bad auth|authentication failed|auth failed/i.test(msg)) {
    return 'MongoDB username/password is wrong in MONGODB_URI. Reset the Atlas database user password (letters and numbers only), update the Vercel env variable, then redeploy.';
  }
  if (/server selection timed out|serverselectiontimeout|etimedout|enotfound/i.test(msg)) {
    return 'Server selection timed out. Atlas Network Access must allow 0.0.0.0/0 and your cluster must be running.';
  }
  if (msg.includes('placeholder') || msg.includes('<') || msg.includes('>')) {
    return 'MONGODB_URI contains unreplaced placeholder < or >. Please update with your actual Atlas credentials.';
  }
  if (msg.includes('mongodb://') || msg.includes('mongodb+srv://')) {
    return 'Invalid MONGODB_URI format. Must start with mongodb:// or mongodb+srv://';
  }
  return msg.replace(/mongodb(\+srv)?:\/\/[^@\s]+@/gi, 'mongodb$1://***:***@');
}

export const db = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  if (!global._m) {
    const uri = normalizeMongoUri(process.env.MONGODB_URI);
    global._m = new MongoClient(uri).connect();
  }
  try {
    const conn = await global._m;
    return conn.db(process.env.MONGODB_DB || 'carrent');
  } catch (err) {
    global._m = null;
    throw new Error(sanitizeMongoError(err));
  }
};

export function getSafeMongoInfo() {
  try {
    const rawUri = process.env.MONGODB_URI;
    if (!rawUri) return { ok: false, error: 'MONGODB_URI is not set' };
    const uri = normalizeMongoUri(rawUri);
    const schemeIdx = uri.indexOf('://');
    const rest = uri.slice(schemeIdx + 3);
    const lastAt = rest.lastIndexOf('@');
    let username = '';
    let afterCreds = rest;
    if (lastAt !== -1) {
      const creds = rest.slice(0, lastAt);
      const colonIdx = creds.indexOf(':');
      username = colonIdx !== -1 ? creds.slice(0, colonIdx) : creds;
      try { username = decodeURIComponent(username); } catch {}
      afterCreds = rest.slice(lastAt + 1);
    }
    const slashIdx = afterCreds.indexOf('/');
    const qIdx = afterCreds.indexOf('?');
    let hostEnd = afterCreds.length;
    if (slashIdx !== -1) hostEnd = slashIdx;
    else if (qIdx !== -1) hostEnd = qIdx;
    const host = afterCreds.slice(0, hostEnd);

    const dbName = process.env.MONGODB_DB || (slashIdx !== -1 ? afterCreds.slice(slashIdx + 1, qIdx !== -1 ? qIdx : undefined) : '') || 'carrent';
    return { ok: true, host, dbName, username };
  } catch (e) {
    return { ok: false, error: sanitizeMongoError(e) };
  }
}

export function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(pin), salt, 64).toString('hex');
  return { hash, salt };
}

export function verifyScrypt(pin, storedHash, storedSalt) {
  if (!pin || !storedHash || !storedSalt) return false;
  try {
    const keyA = scryptSync(String(pin), storedSalt, 64);
    const keyB = Buffer.from(storedHash, 'hex');
    return keyA.length === keyB.length && timingSafeEqual(keyA, keyB);
  } catch {
    return false;
  }
}

export async function getAuthInfo() {
  try {
    const database = await db();
    const doc = await database.collection('settings').findOne({ _id: 'auth' });
    if (doc?.hash && doc?.salt) {
      return {
        custom: true,
        hash: doc.hash,
        salt: doc.salt,
        version: doc.version || 1
      };
    }
  } catch {
    // If settings collection or DB is unavailable, fall back to environment variable
  }
  return {
    custom: false,
    pin: process.env.APP_PIN || '',
    version: 0
  };
}

const key = (version = 0) =>
  process.env.AUTH_SECRET ||
  createHash('sha256')
    .update(`cr|${process.env.APP_PIN || ''}|${version}|${process.env.MONGODB_URI || ''}`)
    .digest('hex');

export async function makeToken() {
  const auth = await getAuthInfo();
  const version = auth.version || 0;
  const exp = Date.now() + 30 * 864e5;
  const payload = `${exp}.${version}`;
  const sig = createHmac('sha256', key(version)).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

export async function checkToken(t) {
  if (!t || typeof t !== 'string') return false;
  const parts = t.split('.');
  let exp, version, sig;
  if (parts.length === 3) {
    [exp, version, sig] = parts;
  } else if (parts.length === 2) {
    [exp, sig] = parts;
    version = '0';
  } else {
    return false;
  }
  if (!exp || !sig || +exp < Date.now()) return false;

  const auth = await getAuthInfo();
  const currentVersion = String(auth.version || 0);
  if (String(version) !== currentVersion) return false;

  const payload = parts.length === 3 ? `${exp}.${version}` : String(exp);
  const expectedSig = createHmac('sha256', key(Number(version) || 0)).update(payload).digest('hex');

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function pinOk(p) {
  if (!p) return false;
  try {
    const auth = await getAuthInfo();
    if (auth.custom) {
      return verifyScrypt(String(p), auth.hash, auth.salt);
    }
    if (!process.env.APP_PIN) return false;
    const h = (x) => createHash('sha256').update(String(x || '')).digest();
    return timingSafeEqual(h(String(p)), h(process.env.APP_PIN));
  } catch {
    return false;
  }
}

export const cookie = (req, n) =>
  (req.headers.get('cookie') || '')
    .split(/;\s*/)
    .map((c) => c.split('='))
    .find((c) => c[0] === n)?.[1];

export async function checkAuth(req) {
  return checkToken(cookie(req, 'cr_session'));
}

export const bad = async (req, col) =>
  !['cars', 'drivers', 'entries', 'expenses'].includes(col) || !(await checkAuth(req));

export async function recomputeOilSummary(database, carId) {
  if (!carId || !ObjectId.isValid(String(carId))) return;
  const latest = await database.collection('expenses').findOne(
    { carId: String(carId), category: 'Oil change', odometer: { $type: 'number' } },
    { sort: { date: -1, _id: -1 } }
  );
  const cars = database.collection('cars');
  const filter = { _id: new ObjectId(String(carId)) };
  if (!latest) {
    await cars.updateOne(filter, { $unset: { lastOilReading: '', lastOilDate: '', nextOilDue: '' } });
    return;
  }
  await cars.updateOne(filter, {
    $set: {
      lastOilReading: Number(latest.odometer),
      lastOilDate: latest.date,
      nextOilDue: Number(latest.nextDue ?? latest.odometer + 5000)
    }
  });
}
