import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const connString = process.env.DATABASE_URL;
if (!connString) throw new Error('DATABASE_URL env var is required');

const pool = new Pool({ connectionString: connString });
export const db = drizzle(pool, { schema });
