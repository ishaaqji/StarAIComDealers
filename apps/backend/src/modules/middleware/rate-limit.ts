import { Request, Response, NextFunction } from 'express';

// Simple in-memory rate limiter: per-IP (+ per-dealer when authenticated).
// Suitable for V1 single-node deploys; swap for Redis-backed BullMQ limiter in prod.
const hits = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 900_000; // 15 min
const MAX = Number(process.env.RATE_LIMIT_MAX) || 100;

function keyFor(req: Request): string {
  const dealerId = (req as any).dealer_id;
  return `ip:${req.ip}${dealerId ? `|dealer:${dealerId}` : ''}`;
}

export function apiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const k = keyFor(req);
  const now = Date.now();
  const entry = hits.get(k);
  if (!entry || now > entry.resetAt) {
    hits.set(k, { count: 1, resetAt: now + WINDOW_MS });
    res.setHeader('RatELimit-Limit', String(MAX));
    res.setHeader('RatELimit-Remaining', String(MAX - 1));
    next();
    return;
  }
  entry.count++;
  const remaining = Math.max(0, MAX - entry.count);
  res.setHeader('RatELimit-Limit', String(MAX));
  res.setHeader('RatELimit-Remaining', String(remaining));
  if (entry.count > MAX) {
    res.status(429).json({ error: 'rate_limited' });
    return;
  }
  next();
}

export function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  // stricter limit on auth endpoints
  apiRateLimit(req, res, next);
}
