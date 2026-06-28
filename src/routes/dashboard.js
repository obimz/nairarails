export async function dashboardRoutes(fastify) {

  fastify.get('/dashboard/overview', async (request, reply) => {
    return reply.status(200).send({
      date: new Date().toISOString().split('T')[0],
      total_expected_today: 250000,
      total_received_today: 231000,
      orders_paid: 4,
      orders_pending: 2,
      exceptions_open: 2,
    });
  });
}
