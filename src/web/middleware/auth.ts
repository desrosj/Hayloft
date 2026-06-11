import type { MiddlewareHandler } from "hono";
import { readSession } from "../lib/session.js";

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = readSession(c);
  if (!session) {
    const redirectTo = encodeURIComponent(c.req.path);
    return c.redirect(`/login?next=${redirectTo}`, 302);
  }
  await next();
};

// Simple in-memory rate limiter for the login endpoint.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

export function checkLoginRate(ip: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  const now = Date.now();
  let entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(ip, entry);
  }
  return {
    allowed: entry.count < MAX_ATTEMPTS,
    remaining: MAX_ATTEMPTS - entry.count,
    resetIn: Math.ceil((entry.resetAt - now) / 1000),
  };
}

export function recordLoginFailure(ip: string) {
  const now = Date.now();
  const entry = attempts.get(ip) ?? { count: 0, resetAt: now + WINDOW_MS };
  entry.count++;
  attempts.set(ip, entry);
}

export function recordLoginSuccess(ip: string) {
  attempts.delete(ip);
}
