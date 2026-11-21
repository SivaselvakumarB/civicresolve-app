import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { triageCivicReport } from './server/triage.ts';
import { validateReportInput } from './src/shared/civicDomain.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Lightweight in-memory rate limiter for /api/triage (30 requests / 5 minutes per IP)
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const existing = rateBuckets.get(ip);
  if (!existing || now > existing.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return false;
  }
  existing.count += 1;
  return true;
}

async function createApp() {
  const app = express();
  app.set('trust proxy', true);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.json({ limit: '512kb' }));

  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'civicresolve',
      mode: IS_PROD ? 'production' : 'development',
      timestamp: new Date().toISOString(),
    });
  });

  app.post('/api/triage', async (req, res) => {
    const clientIp = req.ip || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({
        error: 'Too many triage requests. Please wait a moment before submitting another report.',
      });
      return;
    }

    const body = req.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid JSON request payload.' });
      return;
    }

    const validation = validateReportInput({
      title: typeof body.title === 'string' ? body.title : '',
      description: typeof body.description === 'string' ? body.description : '',
      location: typeof body.location === 'string' ? body.location : '',
      selectedCategory: typeof body.selectedCategory === 'string' ? body.selectedCategory : '',
      imageDataUrl: typeof body.imageDataUrl === 'string' ? body.imageDataUrl : undefined,
    });

    if (!validation.ok || !validation.data) {
      res.status(400).json({
        error: 'Validation failed for report submission.',
        fieldErrors: validation.errors,
      });
      return;
    }

    const result = await triageCivicReport(validation.data);
    res.status(200).json({
      recommendation: result.recommendation,
      fallbackReasonCode: result.fallbackReasonCode ?? null,
    });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (IS_PROD) {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(503).send('Production build not found. Run npm run build first.');
      }
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}

createApp()
  .then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`CivicResolve server listening on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
    });
  })
  .catch((err) => {
    console.error('Failed to start CivicResolve server:', err);
    process.exit(1);
  });
