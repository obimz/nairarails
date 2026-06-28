export async function healthRoutes(fastify) {
  fastify.get('/', async (request, reply) => {
    return reply.status(200).send({
      service: 'NairaRails API',
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  fastify.get('/health', async (request, reply) => {
    return reply.status(200).send({
      service: 'NairaRails API',
      status: 'healthy',
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      endpoints: {
        webhook: 'POST /api/v1/webhooks/nomba',
        orders: 'POST /api/v1/orders',
        ordersList: 'GET /api/v1/orders',
        exceptions: 'GET /api/v1/exceptions',
        overview: 'GET /api/v1/dashboard/overview',
      },
    });
  });
}
