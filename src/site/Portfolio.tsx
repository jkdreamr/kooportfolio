import { useEffect, useRef } from "react";
import { profile } from "../content/profile";
import { peephole, usePeephole } from "../stage/peephole/controller";

/** The owner's own Buy Me a Coffee page (his site: src/os/data.ts `links.coffee`). */
const COFFEE_URL = "https://buymeacoffee.com/joshuakoo";

/**
 * The portfolio. Quiet on purpose: the only secret is the first "o" of
 * "koo", which is a real <button> in the heading. Its counter is a window onto
 * the world beneath the page once that world is warm; pull it far enough and
 * the page tears open (see src/stage/peephole).
 */
export function Portfolio({ path, year }: { path: string; year: number }) {
  const root = useRef<HTMLDivElement>(null);
  const letter = useRef<HTMLButtonElement>(null);
  const armed = usePeephole((s) => s.armed);
  const playLabel = usePeephole((s) => s.playLabel);

  useEffect(() => {
    if (!root.current || !letter.current) return;
    peephole.attach(root.current, letter.current);
    return () => peephole.detach();
  }, []);

  return (
    <div ref={root} className="portfolio" data-armed={armed ? "true" : "false"}>
      <header className="site-header">
        <a href="/" className="wordmark">
          JOSHUA KOO
        </a>
        <a href={`mailto:${profile.email}`} className="availability">
          <i /> Say hello ↗
        </a>
      </header>
      <main className="editorial">
        <h1 aria-label="joshua koo">
          <span aria-hidden="true">joshua k</span>
          <button
            ref={letter}
            type="button"
            className="loose-letter"
            data-paper-skip=""
            aria-label="The letter o. Hold Enter or drag it to open the page."
            aria-describedby="peephole-hint"
          >
            o
          </button>
          <span aria-hidden="true">
            o<span className="name-period">.</span>
          </span>
        </h1>
        <p id="peephole-hint" className="sr-only">
          Something lives under this page. Arrow keys nudge the letter, holding
          Enter or Space pulls it until the page tears, and Escape lets go.
        </p>
        <p className="bio">{profile.bio}</p>
        <nav className="portfolio-nav" aria-label="Portfolio">
          <a href="/about" className={path === "/about" ? "active" : ""} aria-current={path === "/about" ? "page" : undefined}>
            About
          </a>
          <a href="/work" className={path === "/work" ? "active" : ""} aria-current={path === "/work" ? "page" : undefined}>
            Work
          </a>
          <a href="/contact" className={path === "/contact" ? "active" : ""} aria-current={path === "/contact" ? "page" : undefined}>
            Contact
          </a>
          <a
            href="/play"
            onPointerEnter={() => peephole.intent()}
            onFocus={() => peephole.intent()}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              if (peephole.playLink()) e.preventDefault();
            }}
          >
            {/* Fixed width: "Play" → "Continue" after hydration never moves the nav. */}
            <span className="play-label">{playLabel}</span>
          </a>
        </nav>
        {path === "/about" && (
          <section className="editorial-content">
            <h2>A little about me.</h2>
            <p>
              I’m Joshua. I study CS + math at Stanford, cox, and am an
              investment intern at CRV.
            </p>
            <p>
              This is my personal corner of the internet. You can also explore
              an original little game world — no account needed.
            </p>
          </section>
        )}
        {path === "/work" && (
          <section className="editorial-content">
            <div className="eyebrow">SELECTED WORK</div>
            <h2>Things in motion.</h2>
            <a className="work-row" href="https://github.com/jkdreamr" target="_blank" rel="noreferrer">
              <span>
                <b>Code & experiments</b>
                <small>Public projects on GitHub</small>
              </span>
              <span>↗</span>
            </a>
            <a className="work-row" href="https://soundcloud.com/atkelix" target="_blank" rel="noreferrer">
              <span>
                <b>Music & sounds</b>
                <small>Listen on SoundCloud</small>
              </span>
              <span>↗</span>
            </a>
            <a className="work-row" href="/play">
              <span>
                <b>JOSHUA.EXE</b>
                <small>A very unserious, playable small world</small>
              </span>
              <span>↗</span>
            </a>
          </section>
        )}
        {path === "/contact" && (
          <section className="editorial-content">
            <div className="eyebrow">OPEN A CONVERSATION</div>
            <h2>Good things start with hello.</h2>
            <a className="email-link" href={`mailto:${profile.email}`}>
              {profile.email} ↗
            </a>
            <p className="social-links">
              {profile.socials.map(([name, url]) => (
                <a key={name} href={url} target="_blank" rel="noreferrer">
                  {name} ↗
                </a>
              ))}
            </p>
            <p className="support-link">
              <a href={COFFEE_URL} target="_blank" rel="noreferrer">
                Buy me a coffee ↗
              </a>
            </p>
          </section>
        )}
      </main>
      <footer className="site-footer">
        <span>{`© ${year} JOSHUA KOO`}</span>
      </footer>
    </div>
  );
}
