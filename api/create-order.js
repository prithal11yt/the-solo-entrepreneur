export const config = { api: { bodyParser: { sizeLimit: '8kb' } } };

// Plans and coupons live here, on the server, so the browser can never decide
// what a customer pays. Previously the client POSTed `amount` and this handler
// trusted it, which meant anyone could buy a 9,999 membership for 1 rupee.
const PLANS = {
  // Cohort 2 list prices (Oct 2026). Code DIWALI (20%) brings them back to the
  // founding ₹5,999 / ₹9,999.
  starter: { id: 'fw-membership-starter', name: 'Founders Wing — Starter (6 Months)', amount: 749900 },
  annual:  { id: 'fw-membership-annual',  name: 'Founders Wing — Annual (12 Months)', amount: 1249900 },

  // The Solo Entrepreneur products page. Each id must match the product id that
  // products.html sends and account.html unlocks downloads by, and each amount
  // must match the price shown on the page. Every product sold there needs an
  // entry here, or its checkout fails with "Invalid plan".
  pdf:       { id: 'pdf',       name: '100 Business Ideas PDF',               amount: 49900 },
  templates: { id: 'templates', name: 'Automation Templates Pack',            amount: 49900 },
  combo:     { id: 'combo',     name: 'Combo Deal — PDF + Templates',         amount: 79900 },
  consult30: { id: 'consult30', name: '1:1 Consultation — 30 Minutes',        amount: 99900 },
  consult60: { id: 'consult60', name: '1:1 Consultation — 1 Hour Deep Dive',  amount: 199900 },
};

// The products page and older cached copies of the membership checkout send
// product_id instead of plan.
const PLAN_BY_PRODUCT_ID = Object.fromEntries(
  Object.entries(PLANS).map(([key, p]) => [p.id, key])
);

// Coupon code -> discount, applied here by creating the order at the reduced
// price. The code is only a lookup key, so it can't be used to invent a price.
// This used to be a forced Razorpay offer, but that offer wasn't enabled for
// UPI, so checkout hid UPI whenever the code was applied.
const COUPONS = {
  DIWALI: {
    percentOff: 20,
    label: '20% off',
    plans: ['starter', 'annual'],
    endsOn: '2026-11-15', // last day, IST
  },
};

const todayIST = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

function resolveCoupon(rawCode, planKey) {
  if (!rawCode || typeof rawCode !== 'string') return null;
  const code = rawCode.trim().toUpperCase();
  const coupon = Object.hasOwn(COUPONS, code) ? COUPONS[code] : null;
  if (!coupon) return null;
  if (!coupon.plans.includes(planKey)) return null;
  if (coupon.endsOn && todayIST() > coupon.endsOn) return null;
  return coupon;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Invalid request' });
  }
  const { plan, product_id, coupon, name, email, phone } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 120 ||
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (phone != null && (typeof phone !== 'string' || phone.length > 30)) ||
      (coupon != null && (typeof coupon !== 'string' || coupon.length > 64)) ||
      (plan != null && typeof plan !== 'string') ||
      (product_id != null && typeof product_id !== 'string')) {
    return res.status(400).json({ error: 'Invalid checkout details' });
  }
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Checkout is temporarily unavailable' });
  }

  const planKey = Object.hasOwn(PLANS, plan) ? plan : (Object.hasOwn(PLAN_BY_PRODUCT_ID, product_id) ? PLAN_BY_PRODUCT_ID[product_id] : null);
  const selectedPlan = PLANS[planKey];
  if (!selectedPlan) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const appliedCoupon = resolveCoupon(coupon, planKey);
  const amount = appliedCoupon
    ? Math.round(selectedPlan.amount * (100 - appliedCoupon.percentOff) / 100)
    : selectedPlan.amount;

  const credentials = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString('base64');

  try {
    const orderPayload = {
      amount,
      currency: 'INR',
      payment_capture: 1,
      // Store everything the webhook needs to record the purchase in the DB
      notes: {
        product_id: selectedPlan.id,
        product_name: selectedPlan.name,
        name, email,
        phone: phone || '',
        // Guest checkout: never trust a caller-supplied account ID.
        // claim_my_orders must bind this email to a verified account in the DB.
        user_id: '',
        coupon: appliedCoupon ? coupon.trim().toUpperCase() : '',
      },
    };

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    const order = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Failed to create order',
      });
    }

    res.json({
      orderId: order.id,
      amount,
      productName: selectedPlan.name,
      couponApplied: Boolean(appliedCoupon),
      couponLabel: appliedCoupon?.label || '',
      couponError: coupon && !appliedCoupon ? 'That code isn\'t valid for this plan.' : '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not create order. Please try again.' });
  }
}
