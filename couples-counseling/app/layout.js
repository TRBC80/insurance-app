import "./globals.css";

export const metadata = {
  title: "Couples Counseling Prototype",
  description: "Each partner talks privately with an AI counseling guide, shares what they choose, and passes the turn.",
  robots: { index: false, follow: false },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Figtree:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
