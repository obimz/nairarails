import crypto from 'crypto';

export async function webhookRoutes(fastify) {
  fastify.post('/webhooks/nomba', {
    // rawBody needed later for HMAC signature verification
    config: { rawBody: true },
  }, async (request, reply) => {
    fastify.log.info({
      msg: 'Nomba webhook received',
      headers: request.headers,
      body: request.body,
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('NOMBA WEBHOOK RECEIVED');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('HEADERS:', JSON.stringify(request.headers, null, 2));
      console.log('BODY:', JSON.stringify(request.body, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    const eventType = request.body?.event_type;
    const transactionId = request.body?.data?.transaction?.transactionId;
    const accountNumber = request.body?.data?.transaction?.aliasAccountNumber;
    const amount = request.body?.data?.transaction?.transactionAmount;

    fastify.log.info({ msg: 'Webhook parsed', eventType, transactionId, accountNumber, amount });

    return reply.status(200).send({
      status: 'received',
      transactionId: transactionId || null,
      timestamp: new Date().toISOString(),
    });
  });
}

// Nomba signs a colon-joined string of specific fields — field order is fixed by their spec.
export function verifyNombaSignature(payload, timestamp, signatureHeader, secret) {
  try {
    const txn = payload.data.transaction;
    const merchant = payload.data.merchant;

    const message = [
      payload.event_type,
      payload.requestId,
      merchant.userId,
      merchant.walletId,
      txn.transactionId,
      txn.type,
      txn.time,
      txn.responseCode || '',
      timestamp,
    ].join(':');

    const computed = crypto.createHmac('sha256', secret).update(message).digest('base64');

    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
