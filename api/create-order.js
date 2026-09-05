// Plans and coupons live here, on the server, so the browser can never decide
// what a customer pays. Previously the client POSTed `amount` and this handler
// trusted it, which meant anyone could buy a 9,999 membership for 1 rupee.
const PLANS = {
  starter: { id: 'fw-membership-starter', name: 'Founders Wing — Starter (6 Months)', amount: 599900 },
  annual:  { id: 'fw-membership-annual',  name: 'Founders Wing — Annual (12 Months)', amount: 999900 },
};

// Older cached copies of the checkout page send product_id instead of plan.
const PLAN_BY_PRODUCT_ID = Object.fromEntries(
  Object.entries(PLANS).map(([key, p]) => [p.id, key])
);

// Coupon code -> Razorpay offer. The code is just a lookup key; Razorpay owns
// the actual discount maths, so the code can't be used to invent a price.
// Create/edit the underlying offer in Razorpay Dashboard -> Offers.
const COUPONS = {
  FESTIVAL: {
    offerId: 'offer_TYJdxbaukr1WwP',
    label: '20% off',
    plans: ['starter', 'annual'],
  },
};

function resolveCoupon(rawCode, planKey) {
  if (!rawCode || typeof rawCode !== 'string') return null;
  const coupon = COUPONS[rawCode.trim().toUpperCase()];
  if (!coupon) return null;
  if (!coupon.plans.includes(planKey)) return null;
  return coupon;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { plan, product_id, coupon, name, email, phone, user_id } = req.body;

  const planKey = PLANS[plan] ? plan : PLAN_BY_PRODUCT_ID[product_id];
  const selectedPlan = PLANS[planKey];
  if (!selectedPlan) {
    return res.status(400).json({ error: 'Invalid plan' });
  }

  const appliedCoupon = resolveCoupon(coupon, planKey);

  const credentials = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString('base64');

  try {
    const orderPayload = {
      // Always the full price. Razorpay applies the offer discount at payment
      // time, so order.amount stays full while amount_paid reflects the discount.
      amount: selectedPlan.amount,
      currency: 'INR',
      payment_capture: 1,
      // Store everything the webhook needs to record the purchase in the DB
      notes: {
        product_id: selectedPlan.id,
        product_name: selectedPlan.name,
        name, email,
        phone: phone || '',
        user_id: user_id || '',
        coupon: appliedCoupon ? coupon.trim().toUpperCase() : '',
      },
    };

    if (appliedCoupon) {
      orderPayload.offers = [appliedCoupon.offerId];
      // Locks checkout to this one offer so the discount is actually applied
      // rather than being one option among several.
      orderPayload.force_offer = true;
    }

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
      // A rejected offer shouldn't block the sale — fall back to full price so
      // the customer can still pay, rather than showing a dead checkout.
      if (appliedCoupon) {
        console.error('[create-order] Offer rejected, retrying without it:', order.error?.description);
        delete orderPayload.offers;
        delete orderPayload.force_offer;
        orderPayload.notes.coupon = '';

        const retry = await fetch('https://api.razorpay.com/v1/orders', {
          method: 'POST',
          headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(orderPayload),
        });
        const retryOrder = await retry.json();
        if (retry.ok) {
          return res.json({
            orderId: retryOrder.id,
            amount: selectedPlan.amount,
            productName: selectedPlan.name,
            couponApplied: false,
            couponError: 'This code could not be applied to your order.',
          });
        }
      }
      return res.status(response.status).json({
        error: order.error?.description || 'Failed to create order',
      });
    }

    res.json({
      orderId: order.id,
      amount: selectedPlan.amount,
      productName: selectedPlan.name,
      couponApplied: Boolean(appliedCoupon),
      couponLabel: appliedCoupon?.label || '',
      // Only ever a hint for the UI; Razorpay computes the real charge.
      couponError: coupon && !appliedCoupon ? 'That code isn\'t valid for this plan.' : '',
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
