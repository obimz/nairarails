import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";

import { healthRouter }    from "./routes/health.js";
import { webhookRouter }   from "./routes/webhooks.js";
import { orderRouter }     from "./routes/orders.js";
import { exceptionRouter } from "./routes/exceptions.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { adminRouter }     from "./routes/admin.js";
import { merchantRouter }  from "./routes/merchants.js";
import { authRouter }      from "./routes/auth.js";
import { keysRouter }      from "./routes/keys.js";
import { errorHandler }    from "./middleware/errorHandler.js";
import { authLimiter, apiLimiter, globalLimiter } from "./middleware/rateLimiter.js";
import { logger }          from "./lib/logger.js";

const app: Express = express();

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env["FRONTEND_URL"] ?? "*",
    methods: ["GET", "POST", "PATCH", "DELETE"],
  })
);

// ─── Body parsing ─────────────────────────────────────────────────────────────
// IMPORTANT: The webhook route needs the RAW body buffer for HMAC verification.
// We mount express.raw() for that specific path BEFORE the global JSON parser,
// so Nomba's signed bytes are never touched by JSON.stringify/parse.
app.use(
  "/api/v1/webhooks/nomba",
  express.raw({ type: "*/*" })
);

// All other routes get the normal JSON parser.
app.use(express.json());

// ─── Incoming request logger ─────────────────────────────────────────────────
// Logs every request that reaches the server — useful to confirm external
// callers (e.g. Nomba sandbox) are actually hitting the process.
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, "→ incoming request");
  next();
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Apply rate limiters before routes. Order matters: more specific limits first.

// Auth routes: strict limit to prevent credential stuffing
app.use("/api/v1/auth/register", authLimiter);
app.use("/api/v1/auth/login", authLimiter);

// API routes: per-key limits on authenticated endpoints
app.use("/api/v1/orders", apiLimiter);
app.use("/api/v1/exceptions", apiLimiter);
app.use("/api/v1/dashboard", apiLimiter);
app.use("/api/v1/merchants/keys", apiLimiter);

// Global limit for everything else
app.use(globalLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/", healthRouter);
app.use("/api/v1", authRouter);
app.use("/api/v1", keysRouter);
app.use("/api/v1", webhookRouter);
app.use("/api/v1", merchantRouter);

// Admin routes use x-admin-secret — must be mounted BEFORE the routers that
// apply router.use(authAny), because those routers match /api/v1/* broadly
// and will intercept /api/v1/admin/* with an API-key 401 before the admin
// router is ever reached.
app.use("/api/v1/admin", adminRouter);

// Merchant-scoped routes — all protected by authAny (x-api-key or Bearer JWT)
app.use("/api/v1", orderRouter);
app.use("/api/v1", exceptionRouter);
app.use("/api/v1", dashboardRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Route ${req.method} ${req.url} not found`,
    },
  });
});

// ─── Central error handler (must be last) ────────────────────────────────────
app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env["PORT"] ?? "3000", 10);
const HOST = "0.0.0.0"; // required for Railway / Render

app.listen(PORT, HOST, () => {
  logger.info(
    { port: PORT, env: process.env["NODE_ENV"] ?? "development" },
    "NairaRails API started"
  );
});

export default app;
