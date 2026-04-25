const Stripe = require('stripe');
// For development, we'll use a placeholder if no env var is found. In production on Vercel, this is secure.
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_51PLACEHOLDERDONTUSE');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { song, artist, requester, amount, tier } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount or free request should not hit checkout' });
    }

    // Convert amount to cents for Stripe
    const unitAmountCents = Math.round(amount * 100);

    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Song Request: ${song} by ${artist}`,
              description: `Requested by @${requester} (${tier.toUpperCase()})`
            },
            unit_amount: unitAmountCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // Pass the metadata so we know what they paid for when they return!
      metadata: {
        song,
        artist,
        requester,
        tier,
        amount: amount.toString()
      },
      success_url: `${req.headers.origin || 'http://localhost:3000'}/index.html?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin || 'http://localhost:3000'}/index.html?canceled=true`,
    });

    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Stripe Checkout Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
