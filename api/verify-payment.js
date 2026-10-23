import crypto from 'crypto';

export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };

// Download links for a genuinely paid order. The product comes from the order
// we created server-side (Razorpay notes), never from the browser, and the
// links come from Supabase, so they never have to sit in page source.
async function downloadsForOrder(orderId) {
  const credentials = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString('base64');
  const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!orderRes.ok) throw new Error('order lookup failed');
  const productId = (await orderRes.json())?.notes?.product_id;
  if (typeof productId !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(productId)) return [];

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const linksRes = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/downloads_for_product`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({ p_product_id: productId }),
  });
  if (!linksRes.ok) throw new Error('download lookup failed');
  const rows = await linksRes.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .filter(r => typeof r?.url === 'string' && r.url.startsWith('https://'))
    .map(r => ({ label: String(r.label || 'Download'), url: r.url }));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};

  if (typeof razorpay_order_id !== 'string' || !/^order_[A-Za-z0-9]{1,64}$/.test(razorpay_order_id) ||
      typeof razorpay_payment_id !== 'string' || !/^pay_[A-Za-z0-9]{1,64}$/.test(razorpay_payment_id) ||
      typeof razorpay_signature !== 'string' || !/^[a-f0-9]{64}$/i.test(razorpay_signature)) {
    return res.status(400).json({ valid: false, error: 'Missing parameters' });
  }

  if (!process.env.RAZORPAY_KEY_SECRET) return res.status(503).json({ valid: false, error: 'Verification is temporarily unavailable' });

  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(razorpay_signature, 'hex'))) {
    return res.status(400).json({ valid: false, error: 'Signature mismatch' });
  }

  // The payment is genuine from here on. A failed link lookup must not turn a
  // successful payment into an error: the page sends the buyer to /account,
  // where the links load once the webhook has recorded the order.
  let links = [];
  let deliveryError = false;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try { links = await downloadsForOrder(razorpay_order_id); }
    catch { deliveryError = true; }
  } else {
    deliveryError = true;
  }
  return res.json({ valid: true, links, deliveryError });
}
