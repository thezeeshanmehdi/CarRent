import { MongoClient, ObjectId } from 'mongodb';
import { createHmac, createHash, timingSafeEqual } from 'crypto';
export const db = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  const conn = global._m || (global._m = new MongoClient(process.env.MONGODB_URI).connect());
  return (await conn).db(process.env.MONGODB_DB || 'carrent');
};
export { ObjectId };
const key = () => process.env.AUTH_SECRET || createHash('sha256').update('cr|' + process.env.APP_PIN + '|' + process.env.MONGODB_URI).digest('hex');
const sign = (x) => createHmac('sha256', key()).update(x).digest('hex');
export const makeToken = () => { const exp = Date.now() + 30 * 864e5; return exp + '.' + sign(String(exp)); };
const checkToken = (t) => {
  const [exp, sig] = (t || '').split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
};
export const pinOk = (p) => {
  if (!process.env.APP_PIN) return false;
  const h = (x) => createHash('sha256').update(String(x || '')).digest();
  return timingSafeEqual(h(p), h(process.env.APP_PIN));
};
const cookie = (req, n) => (req.headers.get('cookie') || '').split(/;\s*/).map((c) => c.split('=')).find((c) => c[0] === n)?.[1];
export const bad = (req, col) => !['cars', 'drivers', 'entries', 'expenses'].includes(col) || !checkToken(cookie(req, 'cr_session'));
