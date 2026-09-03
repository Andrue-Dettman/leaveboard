import express from 'express';
import cors from 'cors';

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? true }));
  app.use(express.json());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.use((req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    });
  });

  return app;
}
