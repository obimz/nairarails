import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    service: "NairaRails API",
    status: "alive",
    timestamp: new Date().toISOString(),
  });
});

router.get("/health", (_req, res) => {
  res.status(200).json({
    service: "NairaRails API",
    status: "healthy",
    version: "1.0.0",
    environment: process.env["NODE_ENV"] ?? "development",
    timestamp: new Date().toISOString(),
    endpoints: {
      webhook:      "POST /api/v1/webhooks/nomba",
      createOrder:  "POST /api/v1/orders",
      listOrders:   "GET  /api/v1/orders",
      reconcile:    "GET  /api/v1/orders/:order_ref/reconciliation",
      exceptions:   "GET  /api/v1/exceptions",
      refundExcess: "POST /api/v1/exceptions/:order_ref/refund-excess",
      overview:     "GET  /api/v1/dashboard/overview",
    },
  });
});

export { router as healthRouter };
