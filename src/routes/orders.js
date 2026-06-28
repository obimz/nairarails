export async function orderRoutes(fastify) {

  fastify.post('/orders', {
    schema: {
      body: {
        type: 'object',
        required: ['order_ref', 'customer_name', 'expected_amount', 'splits'],
        properties: {
          order_ref:       { type: 'string' },
          customer_name:   { type: 'string' },
          expected_amount: { type: 'number' },
          currency:        { type: 'string', default: 'NGN' },
          splits: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['party', 'account_number', 'bank_code', 'percentage'],
              properties: {
                party:          { type: 'string' },
                account_number: { type: 'string' },
                bank_code:      { type: 'string' },
                percentage:     { type: 'number' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { order_ref, customer_name, expected_amount, currency = 'NGN', splits } = request.body;

    const total = splits.reduce((sum, s) => sum + s.percentage, 0);
    if (Math.round(total) !== 100) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: `splits[].percentage must sum to 100, got ${total}`,
          field: 'splits',
        },
      });
    }

    fastify.log.info({ msg: 'Order created (stub)', order_ref, customer_name });

    return reply.status(201).send({
      order_ref,
      virtual_account_number: '9900012345',
      bank_name: 'Nomba',
      bank_code: '000026',
      expected_amount,
      currency,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  });


  fastify.get('/orders', async (request, reply) => {
    const { page = 1, page_size = 20 } = request.query;

    return reply.status(200).send({
      results: [
        {
          order_ref: 'ORD-9821',
          customer_name: 'Chisom Traders',
          expected_amount: 50000,
          received_amount: 48000,
          status: 'underpayment',
          virtual_account_number: '9900012345',
          created_at: '2026-06-28T09:00:00Z',
        },
        {
          order_ref: 'ORD-1144',
          customer_name: 'Emeka Okafor',
          expected_amount: 50000,
          received_amount: 53000,
          status: 'overpayment',
          virtual_account_number: '9900054321',
          created_at: '2026-06-28T10:00:00Z',
        },
        {
          order_ref: 'ORD-0077',
          customer_name: 'Adaeze Foods',
          expected_amount: 5000,
          received_amount: 5000,
          status: 'paid',
          virtual_account_number: '9900099999',
          created_at: '2026-06-28T11:00:00Z',
        },
      ],
      page: parseInt(page),
      page_size: parseInt(page_size),
      total_count: 3,
    });
  });


  fastify.get('/orders/:order_ref/reconciliation', async (request, reply) => {
    const { order_ref } = request.params;

    return reply.status(200).send({
      order_ref,
      virtual_account_number: '9900012345',
      expected_amount: 50000,
      received_amount: 48000,
      status: 'underpayment',
      shortfall: 2000,
      excess: 0,
      splits_executed: false,
      splits: [
        { party: 'seller',   percentage: 85, amount_paid: null, status: 'blocked' },
        { party: 'platform', percentage: 10, amount_paid: null, status: 'blocked' },
        { party: 'rider',    percentage: 5,  amount_paid: null, status: 'blocked' },
      ],
      audit_trail: [
        { event: 'va_created',        timestamp: '2026-06-28T09:00:00Z' },
        { event: 'payment_received',  amount: 48000, timestamp: '2026-06-28T14:32:11Z' },
        { event: 'classified',        status: 'underpayment', timestamp: '2026-06-28T14:32:11Z' },
        { event: 'notification_sent', channel: 'dashboard', timestamp: '2026-06-28T14:32:12Z' },
      ],
    });
  });
}
