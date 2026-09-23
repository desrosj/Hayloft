import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { loadEnv } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { migrate } from "../db/migrate.js";
import { authRoutes } from "./routes/auth.jsx";
import { dashboardRoutes } from "./routes/dashboard.jsx";
import { projectsRoutes } from "./routes/projects.jsx";
import { peopleRoutes } from "./routes/people.jsx";
import { clientsRoutes } from "./routes/clients.jsx";
import { timeRoutes } from "./routes/time.jsx";
import { invoicesRoutes } from "./routes/invoices.jsx";
import { expensesRoutes } from "./routes/expenses.jsx";
import { searchRoutes } from "./routes/search.jsx";
import { adminRoutes } from "./routes/admin.jsx";
import { requireAuth } from "./middleware/auth.js";

const env = loadEnv({ requireWeb: true });
await migrate();

const app = new Hono();

app.use("/styles.css", serveStatic({ root: "./public" }));
app.use("/assets/*", serveStatic({ root: "./public" }));

app.get("/health", (c) => c.text("ok"));

app.route("/", authRoutes);

const protectedApp = new Hono();
protectedApp.use("*", requireAuth);
protectedApp.route("/", dashboardRoutes);
protectedApp.route("/", projectsRoutes);
protectedApp.route("/", peopleRoutes);
protectedApp.route("/", clientsRoutes);
protectedApp.route("/", timeRoutes);
protectedApp.route("/", invoicesRoutes);
protectedApp.route("/", expensesRoutes);
protectedApp.route("/", searchRoutes);
protectedApp.route("/", adminRoutes);

app.route("/", protectedApp);

app.notFound((c) => c.text("Not found", 404));
app.onError((err, c) => {
  logger.error({ err: err.message, stack: err.stack }, "request error");
  return c.text("Server error", 500);
});

serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    console.log(`\n  hayloft · listening on http://localhost:${info.port}\n`);
  },
);
