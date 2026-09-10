import crypto from 'crypto';

export const config = { api: { bodyParser: { sizeLimit: '2kb' } } };

export default function handler(req, res) {
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

  if (crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(razorpay_signature, 'hex'))) {
    res.json({ valid: true });
  } else {
    res.status(400).json({ valid: false, error: 'Signature mismatch' });
  }
}
