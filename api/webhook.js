import crypto from 'crypto';

// Disable Vercel's automatic body parsing so we can read the raw body
// (required for Razorpay webhook signature verification)
export const config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Read raw body before any parsing
  const rawBody = await getRawBody(req);
  const signature = req.headers['x-razorpay-signature'];

  // 2. Verify the webhook signature
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature !== signature) {
    console.warn('[webhook] Invalid signature — possible spoofed request');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // 3. Parse event
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // 4. Only handle payment.captured (ignore other event types)
  if (event.event !== 'payment.captured') {
    return res.status(200).json({ received: true, skipped: event.event });
  }

  const payment   = event.payload.payment.entity;
  const orderId   = payment.order_id;
  const paymentId = payment.id;
  const amountPaise = payment.amount;

  // 5. Fetch the Razorpay order to read the notes we stored at order-creation time
  let notes = {};
  try {
    const credentials = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
      headers: { Authorization: `Basic ${credentials}` },
    });
    const order = await orderRes.json();
    notes = order.notes || {};
  } catch (err) {
    console.error('[webhook] Failed to fetch order notes:', err.message);
    // Return 200 so Razorpay doesn't keep retrying; we'll handle manually
    return res.status(200).json({ received: true, warning: 'Could not fetch order' });
  }

  const productId   = notes.product_id   || '';
  const productName = notes.product_name || '';
  const userName    = notes.name         || '';
  const userEmail   = notes.email        || '';
  const userPhone   = notes.phone        || '';
  const userId      = notes.user_id      || null;

  if (!productId || !userEmail) {
    console.error('[webhook] Missing product_id or email in order notes for', orderId, '— notes:', JSON.stringify(notes));
    // Still 200: this can happen for old orders created before this change
    return res.status(200).json({ received: true, warning: 'Missing product/user info in notes' });
  }

  // 6. Call Supabase record_purchase RPC via REST (no npm dependency needed)
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let rpcRes;
  try {
    rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/record_purchase`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        p_name:                userName,
        p_email:               userEmail,
        p_phone:               userPhone,
        p_product_id:          productId,
        p_product_name:        productName,
        p_amount_paise:        amountPaise,
        p_razorpay_payment_id: paymentId,
        p_user_id:             userId,
      }),
    });
  } catch (err) {
    console.error('[webhook] Supabase RPC fetch failed:', err.message);
    // 200 to avoid Razorpay retries
    return res.status(200).json({ received: true, warning: 'DB request failed' });
  }

  if (!rpcRes.ok) {
    const errText = await rpcRes.text();
    console.error('[webhook] record_purchase error:', errText);
    // 200 to avoid Razorpay retries — investigate logs manually
    return res.status(200).json({ received: true, warning: 'DB write failed' });
  }

  console.log(`[webhook] ✓ Recorded purchase: ${paymentId} → ${productId} for ${userEmail}`);

  // 7. Founders Wing membership purchases also get a record in FW's own Supabase project
  if (productId.startsWith('fw-membership-')) {
    const fwSupabaseUrl  = process.env.FW_SUPABASE_URL;
    const fwServiceKey   = process.env.FW_SUPABASE_SERVICE_ROLE_KEY;
    const plan           = productId === 'fw-membership-annual' ? 'annual' : 'starter';

    try {
      const fwRes = await fetch(`${fwSupabaseUrl}/rest/v1/fw_memberships?on_conflict=razorpay_payment_id`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        fwServiceKey,
          'Authorization': `Bearer ${fwServiceKey}`,
          'Prefer':        'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify({
          full_name:           userName,
          email:               userEmail,
          whatsapp:            userPhone,
          plan,
          amount_paise:        amountPaise,
          razorpay_payment_id: paymentId,
          razorpay_order_id:   orderId,
        }),
      });

      if (!fwRes.ok) {
        const errText = await fwRes.text();
        console.error('[webhook] fw_memberships insert error:', errText);
      } else {
        console.log(`[webhook] ✓ Recorded Founders Wing membership: ${paymentId} → ${plan} for ${userEmail}`);
      }
    } catch (err) {
      console.error('[webhook] fw_memberships insert failed:', err.message);
    }
  }

  return res.status(200).json({ received: true, success: true });
}
