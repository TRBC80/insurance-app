# Don't Sign Yet

At the dealership and about to sign? Take photos of the bill of sale, finance
contract or lease, pay, and get a plain-English review from Claude: the real
numbers, whether the math adds up, which fees and add-ons are optional, red
flags in the fine print, and what to ask before signing.

This is a sister app to Insurance in English (the repo root). It's a
**separate, standalone Next.js app** in this `dealer-app/` folder, so it
deploys as its own Vercel project and its own domain.

## What's different from Insurance in English

- **Camera-first upload.** The main button opens the phone's rear camera
  (`capture="environment"`). Each "Next page" tile takes another photo.
  PDFs and saved photos still work through the link underneath.
- **Dealer-contract review prompt.** See `SYSTEM_PROMPT` in
  `app/api/analyze/route.js`. Sections: bottom line, deal in numbers,
  *does the math add up?* (it recomputes the amount financed and payments),
  add-ons & fees, red flags, and questions to ask before signing.
  Canadian context: all-in pricing rules, provincial regulators
  (AMVIC / OMVIC / VSA BC), no cooling-off period, cost-of-borrowing disclosure.
- **Model:** `claude-opus-5-5`, streamed so long contracts don't time out,
  with server-side refusal fallbacks turned on (`fallbacks: "default"`).
  For cheaper reports, switch to `claude-sonnet-5-5`.
- **Example report** on the site uses a made-up deal and is labelled that way.

## Deploying (Vercel)

1. Vercel → **Add New → Project** → import this same GitHub repo.
2. Set **Root Directory** to `dealer-app`.
3. Add the same three environment variables as the insurance site:
   `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
4. Deploy, then add your domain under **Settings → Domains**.

## Before going live

- Confirm dontsignyet.com is yours and the name is clear of trademarks, then check `app/site.js`, the wordmark in
  `app/components/Wordmark.js` and the metadata in `app/layout.js`.
- Make sure the contact inbox in `app/site.js` exists.
- Get the Terms and Privacy pages reviewed. The disclaimer framing is "not
  legal or financial advice" rather than insurance advice.
- Price: `amount` in `app/api/create-payment-intent/route.js` (cents) and
  `PRICE_LABEL` in `app/page.js`. It's currently $29 CAD.

## Running locally

```bash
cd dealer-app
npm install
npm run dev     # http://localhost:3000
```
