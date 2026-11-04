import "./globals.css";

// This app is fully interactive (uploads, payment, AI) with nothing that needs
// to be generated ahead of time, so render pages on demand instead of trying to
// pre-build them. This avoids build-time prerender errors.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Insurance in English — Know what your policy actually covers",
  description:
    "Upload your insurance policy and get a plain-English breakdown of what's covered, what isn't, and what to watch for.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
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
