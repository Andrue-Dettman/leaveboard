import 'dotenv/config';
import pg from 'pg';

const { Pool, types } = pg;

// node-postgres hands DATE columns back as JS Date objects in the server's local
// timezone, which shifts a leave date by a day west of UTC. Every date in this schema
// is a calendar date, so keep them as the YYYY-MM-DD strings Postgres already sends.
const DATE_OID = 1082;
types.setTypeParser(DATE_OID, (value) => value);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

export function query(text, params) {
  return pool.query(text, params);
}
