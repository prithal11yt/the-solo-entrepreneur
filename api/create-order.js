export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { amount, product } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  const credentials = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString('base64');

  try {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        payment_capture: 1,
        notes: { product },
      }),
    });

    const order = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: order.error?.description || 'Failed to create order',
      });
    }

    res.json({ orderId: order.id });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
