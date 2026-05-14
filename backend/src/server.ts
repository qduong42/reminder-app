import 'dotenv/config';
import { createApp } from './app';
import { scheduleAll } from './scheduler';

const PORT = Number(process.env.PORT) || 3000;

async function main() {
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
