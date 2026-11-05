import LogoMark from "./LogoMark";
import SiteFooter from "./SiteFooter";
import { SITE } from "../site";

export default function LegalPage({ title, children }) {
  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <a className="brand" href="/" aria-label={`${SITE.name} — home`}>
            <LogoMark />
            <span className="wordmark">
              Insurance in <span className="en">English</span>
            </span>
          </a>
          <a className="header-link" href="/">
            Get your report
          </a>
        </div>
      </header>
      <main className="wrap narrow">
        <article className="card legal">
          <h1>{title}</h1>
          <p className="legal-updated">Last updated: {SITE.legalUpdated}</p>
          {children}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
