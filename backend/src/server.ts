import 'dotenv/config';
import path from 'path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db } from './db';
import { createApp } from './app';
import { scheduleAll } from './scheduler';

const PORT = Number(process.env.PORT) || 3000;

async function main() {
  await migrate(db, { migrationsFolder: path.join(__dirname, '../drizzle') });
  await scheduleAll();
  const app = createApp();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch(err => {
  console.error('Startup failed:', err);
  process.exit(1);
});
