import "dotenv/config";
import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";

import { healthRouter }    from "./routes/health.js";
import { webhookRouter }   from "./routes/webhooks.js";
import { orderRouter }     from "./routes/orders.js";
import { exceptionRouter } from "./routes/exceptions.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { adminRouter }     from "./routes/admin.js";
import { errorHandler }    from "./middleware/errorHandler.js";
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

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use("/", healthRouter);
app.use("/api/v1", webhookRouter);
app.use("/api/v1", orderRouter);
app.use("/api/v1", exceptionRouter);
app.use("/api/v1", dashboardRouter);
app.use("/api/v1", adminRouter);

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
