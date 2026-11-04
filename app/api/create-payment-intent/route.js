import Stripe from "stripe";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request) {
  try {
    const { email } = await request.json().catch(() => ({}));
    const cleanEmail = typeof email === "string" ? email.trim() : "";
    if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 254) {
      return Response.json(
        { error: "Please enter a valid email address." },
        { status: 400 }
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2900, // $29.00 in cents
      currency: "cad",
      automatic_payment_methods: { enabled: true },
      description: "Insurance in English — policy report",
      // Stripe emails the receipt here once payment succeeds (live mode).
      receipt_email: cleanEmail,
      metadata: { customer_email: cleanEmail },
    });

    return Response.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("create-payment-intent error:", err);
    return Response.json(
      { error: "Could not start checkout." },
      { status: 500 }
    );
  }
}
