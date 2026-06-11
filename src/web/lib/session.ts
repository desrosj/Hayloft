import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { loadEnv } from "../../config/env.js";

const COOKIE = "ha_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

interface SessionPayload {
  uid: string;
  iat: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function makeSession(c: Context) {
  const env = loadEnv({ requireWeb: true });
  const payload: SessionPayload = { uid: "team", iat: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = sign(body, env.SESSION_SECRET!);
  setCookie(c, COOKIE, `${body}.${mac}`, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "Strict",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export function readSession(c: Context): SessionPayload | null {
  const env = loadEnv({ requireWeb: true });
  const raw = getCookie(c, COOKIE);
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = sign(body, env.SESSION_SECRET!);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
}

export function clearSession(c: Context) {
  deleteCookie(c, COOKIE, { path: "/" });
}
