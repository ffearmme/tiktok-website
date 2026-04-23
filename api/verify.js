const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_51PLACEHOLDERDONTUSE');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'No session_id provided' });

    const session = await stripe.checkout.sessions.retrieve(session_id);
    
    if (session.payment_status === 'paid') {
      // Return the metadata so the frontend can submit to Supabase as verified
      return res.status(200).json({
        verified: true,
        data: session.metadata
      });
    }

    res.status(400).json({ verified: false, status: session.payment_status });
  } catch (error) {
    console.error('Stripe Verification Error:', error);
    res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
