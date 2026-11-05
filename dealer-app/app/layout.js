import "./globals.css";

// This app is fully interactive (uploads, payment, AI) with nothing that needs
// to be generated ahead of time, so render pages on demand instead of trying to
// pre-build them. This avoids build-time prerender errors.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Car Deal in English — Know what you're signing at the dealership",
  description:
    "Snap photos of your car purchase, finance or lease contract before you sign. Get a plain-English breakdown of the real price, the fees, the add-ons, and the red flags.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#1f7a6d" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700&family=Inter:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
