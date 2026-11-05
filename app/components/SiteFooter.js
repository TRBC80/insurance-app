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
          {SITE.name} gives plain-language summaries of insurance documents for
          general information only. It is not insurance advice, legal advice,
          or a substitute for reading your full policy or speaking with a
          licensed broker. Always confirm coverage details with your insurer.
        </p>
        <p className="footer-copy">
          © {new Date().getFullYear()} {SITE.legalName} · Made in Canada · Prices in CAD
        </p>
      </div>
    </footer>
  );
}
