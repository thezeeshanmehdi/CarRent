import { MongoClient, ObjectId } from 'mongodb';
export const db = async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  const conn = global._m || (global._m = new MongoClient(process.env.MONGODB_URI).connect());
  return (await conn).db(process.env.MONGODB_DB || 'carrent');
};
export { ObjectId };
export const bad = (req, col) =>
  !['cars', 'drivers', 'entries', 'expenses'].includes(col) || req.headers.get('x-pin') !== process.env.APP_PIN;
