import { Hono } from "hono";
import bcrypt from "bcryptjs";
import { loadEnv } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import {
  makeSession,
  clearSession,
  readSession,
} from "../lib/session.js";
import {
  checkLoginRate,
  recordLoginFailure,
  recordLoginSuccess,
} from "../middleware/auth.js";
import { Login } from "../views/login.js";

export const authRoutes = new Hono();

authRoutes.get("/login", (c) => {
  if (readSession(c)) return c.redirect("/", 302);
  const next = c.req.query("next");
  return c.html(<Login next={next} />);
});

authRoutes.post("/login", async (c) => {
  const env = loadEnv({ requireWeb: true });
  const ip = c.req.header("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const rate = checkLoginRate(ip);

  if (!rate.allowed) {
    return c.html(
      <Login
        error={`Too many attempts. Try again in ${Math.ceil(rate.resetIn / 60)} minutes.`}
      />,
      429,
    );
  }

  const form = await c.req.formData();
  const password = form.get("password");
  const next = form.get("next");

  if (typeof password !== "string" || !password) {
    return c.html(<Login error="Password required." />, 400);
  }

  const ok = bcrypt.compareSync(password, env.APP_PASSWORD_HASH!);
  if (!ok) {
    recordLoginFailure(ip);
    logger.warn({ ip }, "failed login attempt");
    return c.html(
      <Login error={`Incorrect password. ${rate.remaining - 1} attempts remaining.`} />,
      401,
    );
  }

  recordLoginSuccess(ip);
  makeSession(c);
  const dest = typeof next === "string" && next.startsWith("/") ? next : "/";
  return c.redirect(dest, 302);
});

authRoutes.post("/logout", (c) => {
  clearSession(c);
  return c.redirect("/login", 302);
});
