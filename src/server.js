import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rawBody from 'fastify-raw-body';

import { webhookRoutes } from './routes/webhooks.js';
import { orderRoutes } from './routes/orders.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { exceptionRoutes } from './routes/exceptions.js';
import { healthRoutes } from './routes/health.js';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty' }
        : undefined,
  },
});

// ─── Plugins ─────────────────────────────────────────────────────────────────
await fastify.register(rawBody, { global: false }); // opt-in per route via config.rawBody
await fastify.register(helmet);
await fastify.register(cors, {
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
});

// ─── Routes ──────────────────────────────────────────────────────────────────
await fastify.register(healthRoutes);
await fastify.register(webhookRoutes, { prefix: '/api/v1' });
await fastify.register(orderRoutes,   { prefix: '/api/v1' });
await fastify.register(dashboardRoutes, { prefix: '/api/v1' });
await fastify.register(exceptionRoutes, { prefix: '/api/v1' });

// ─── Global error handler ────────────────────────────────────────────────────
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  const statusCode = error.statusCode || 500;
  return reply.status(statusCode).send({
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'An unexpected error occurred',
    },
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
fastify.setNotFoundHandler((request, reply) => {
  return reply.status(404).send({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    },
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3000');
    const host = '0.0.0.0'; // must be 0.0.0.0 for Railway/Render deployment

    await fastify.listen({ port, host });
    fastify.log.info(`NairaRails running on port ${port} [${process.env.NODE_ENV}]`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
