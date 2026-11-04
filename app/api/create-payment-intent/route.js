import Stripe from "stripe";

export async function POST() {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2900, // $29.00 in cents
      currency: "cad",
      automatic_payment_methods: { enabled: true },
      description: "Insurance in English — policy report",
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
