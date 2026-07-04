import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { ensureBucket } from './lib/minio';
import { db } from './lib/db';
import authRouter from './routes/auth';
import membersRouter from './routes/members';
import categoriesRouter from './routes/categories';
import expensesRouter from './routes/expenses';
import receiptsRouter from './routes/receipts';

const app = express();
const PORT = parseInt(process.env.PORT || '3001');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));

// Health check — must be before auth middleware
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Simple in-memory rate limiter for auth endpoints (10 req / 60 s per IP)
const _attempts = new Map<string, { count: number; resetAt: number }>();
function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  const key = (req.ip ?? req.socket.remoteAddress) ?? 'unknown';
  const now = Date.now();
  const entry = _attempts.get(key);
  if (!entry || now > entry.resetAt) {
    _attempts.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  if (entry.count >= 10) {
    res.status(429).json({ error: 'Too many attempts, please try again later' });
    return;
  }
  entry.count++;
  next();
}

app.use('/api/auth', authRateLimit, authRouter);
app.use('/api/members', membersRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/receipts', receiptsRouter);

// Serve built frontend in production
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.sendFile(path.join(publicPath, 'index.html'));
});

async function start() {
  try {
    await ensureBucket();
    const server = app.listen(PORT, () => {
      console.log(`HSA Tracker running on http://localhost:${PORT}`);
    });

    const shutdown = () => {
      console.log('Shutting down gracefully...');
      server.close(async () => {
        await db.$disconnect();
        process.exit(0);
      });
      // Force exit if connections don't drain within 10 s
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
