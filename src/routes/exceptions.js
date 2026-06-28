export async function exceptionRoutes(fastify) {

  fastify.get('/exceptions', async (request, reply) => {
    const { type } = request.query;

    return reply.status(200).send({
      results: [
        {
          order_ref: 'ORD-1144',
          type: 'overpayment',
          expected_amount: 50000,
          received_amount: 53000,
          excess: 3000,
          raised_at: '2026-06-28T11:02:00Z',
          resolved: false,
        },
        {
          order_ref: 'ORD-9821',
          type: 'underpayment',
          expected_amount: 50000,
          received_amount: 48000,
          shortfall: 2000,
          raised_at: '2026-06-28T14:32:11Z',
          resolved: false,
        },
      ],
      total_count: 2,
    });
  });


  fastify.post('/exceptions/:order_ref/refund-excess', async (request, reply) => {
    const { order_ref } = request.params;

    fastify.log.info({ msg: 'Refund excess triggered (stub)', order_ref });

    return reply.status(200).send({
      order_ref,
      refunded_amount: 3000,
      status: 'resolved',
      nomba_transfer_id: 'API-P2P-STUB-123',
    });
  });
}
