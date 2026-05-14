import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import authRouter from './routes/auth';
import tasksRouter from './routes/tasks';
import pushRouter from './routes/push';
import householdsRouter from './routes/households';
import inviteRouter from './routes/invite';

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  }));

  app.use('/api/auth', authRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/households', householdsRouter);
  app.use('/api/invite', inviteRouter);

  if (process.env.NODE_ENV === 'production') {
    const frontendDist = path.join(__dirname, '../frontend-dist');
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  return app;
}
