import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { ApiError } from './errors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes/index.js';

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

// The client is served from a different origin than the API in every environment, so CORS
// is load-bearing rather than a formality. In production the origins have to be named:
// reflecting whichever origin asked would let any page on the internet call this API with
// somebody else's X-User-Id. In development it stays open so a phone on the LAN can reach
// the dev server without a config change.
function corsOptions() {
  const configured = (process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length > 0) {
    return { origin: configured };
  }

  if (isProduction()) {
    throw new Error('CLIENT_ORIGIN is not set. List the origins allowed to call this API.');
  }

  return { origin: true };
}

function createLimiter() {
  return rateLimit({
    windowMs: RATE_LIMIT_WINDOW_MS,
    // Read per app rather than once at import so a test can build an app with a small
    // limit without having to reach into the module.
    limit: Number(process.env.RATE_LIMIT_MAX ?? 300),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // A liveness probe runs on a schedule and is the one caller that must never be turned
    // away: rate limiting it would make the host think the service is down.
    skip: (req) => req.path === '/health',
    handler: (req, res, next, options) => {
      res.setHeader('Retry-After', Math.ceil(options.windowMs / 1000));
      next(new ApiError('RATE_LIMITED', 'Too many requests. Try again in a few minutes.'));
    },
  });
}

export function createApp() {
  const app = express();

  if (isProduction()) {
    // The host terminates TLS at its own proxy, so without this every request carries the
    // proxy's address and the rate limiter would count all clients as one. One hop only:
    // trusting the whole chain would let a caller spoof its address with X-Forwarded-For.
    app.set('trust proxy', 1);
  }

  // Sending JSON to a different origin is the whole job here, so the resource policy has
  // to allow it. Everything else helmet sets by default is left alone.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors(corsOptions()));
  app.use(express.json());

  app.use('/api', createLimiter(), apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
