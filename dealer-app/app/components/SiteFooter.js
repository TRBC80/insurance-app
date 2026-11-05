import LogoMark from "./LogoMark";
import { SITE } from "../site";

export default function SiteFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <LogoMark small />
            <span>{SITE.name}</span>
          </div>
          <nav className="footer-links" aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/refunds">Refunds</a>
            <a href={`mailto:${SITE.contactEmail}`}>Contact</a>
          </nav>
        </div>
        <p>
          {SITE.name} gives plain-language summaries of vehicle sale, finance
          and lease documents for general information only. It is not legal,
          financial or credit advice, and it is not affiliated with any
          dealership, manufacturer or lender. Always read the full contract
          and confirm anything important with the dealer, your lender, or your
          provincial motor vehicle regulator before you sign.
        </p>
        <p className="footer-copy">
          © {new Date().getFullYear()} {SITE.legalName} · Made in Canada · Prices in CAD
        </p>
      </div>
    </footer>
  );
}
