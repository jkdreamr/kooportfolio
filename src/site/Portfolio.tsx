import { useEffect, useRef, useState } from "react";
import { profile } from "../content/profile";

export function Portfolio() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const [loose, setLoose] = useState(path === "/about");
  const [broken, setBroken] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const enter = () => {
    location.href = "/play";
  };
  const breakPage = () => {
    if (broken) return;
    setBroken(true);
    timer.current = setTimeout(
      enter,
      matchMedia("(prefers-reduced-motion: reduce)").matches ? 250 : 2600,
    );
  };
  return (
    <div
      className={`portfolio ${loose ? "loose" : ""} ${broken ? "page-breaking" : ""}`}
    >
      <header className="site-header">
        <a href="/" className="wordmark">
          JOSHUA KOO
        </a>
        <span>AN OPEN-ENDED WORK IN PROGRESS</span>
        <a href="mailto:joskoo@stanford.edu" className="availability">
          <i /> Say hello ↗
        </a>
      </header>
      <main className="editorial">
        <div className="eyebrow hero-eyebrow">
          A SMALL CORNER OF THE INTERNET
        </div>
        <h1 aria-label="joshua koo">
          joshua k
          <span className="letter-pocket">
            <button
              className="loose-letter"
              aria-label={
                loose
                  ? "Loose letter o. Drag, tap, or press Enter to break the page and enter the world."
                  : "Inspect the letter o"
              }
              style={{
                transform: `translate(${drag.x}px,${drag.y}px) rotate(${loose ? -14 + drag.x / 4 : 0}deg)`,
              }}
              onClick={() => (loose ? breakPage() : setLoose(true))}
              onPointerDown={(e) => {
                if (!loose) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                start.current = { x: e.clientX, y: e.clientY };
              }}
              onPointerMove={(e) => {
                if (start.current)
                  setDrag({
                    x: e.clientX - start.current.x,
                    y: e.clientY - start.current.y,
                  });
              }}
              onPointerUp={() => {
                if (start.current) {
                  start.current = null;
                  breakPage();
                }
              }}
              onPointerCancel={() => {
                start.current = null;
                setDrag({ x: 0, y: 0 });
              }}
            >
              o
            </button>
            {loose && (
              <span className="tiny-repairer" aria-hidden="true">
                <i />
                <b />
              </span>
            )}
          </span>
          o<span className="name-period">.</span>
        </h1>
        <p className="bio">{profile.bio}</p>
        <p className="hero-subline">
          A few things I’m working on. A little world I’m building.
        </p>
        <nav className="portfolio-nav" aria-label="Portfolio">
          <a
            href="/about"
            className={path === "/about" ? "active" : ""}
          >
            About <span>01</span>
          </a>
          <a href="/work" className={path === "/work" ? "active" : ""}>
            Work <span>02</span>
          </a>
          <a href="/contact" className={path === "/contact" ? "active" : ""}>
            Contact <span>03</span>
          </a>
          <a href="/play">
            Play <span>04</span>
          </a>
        </nav>
        <div className="paper-divider">
          <span />
        </div>
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
            <a
              className="work-row"
              href="https://github.com/jkdreamr"
              target="_blank"
              rel="noreferrer"
            >
              <span>
                <b>Code & experiments</b>
                <small>Public projects on GitHub</small>
              </span>
              <span>↗</span>
            </a>
            <a
              className="work-row"
              href="https://soundcloud.com/atkelix"
              target="_blank"
              rel="noreferrer"
            >
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
          </section>
        )}
        {loose && !broken && (
          <div className="repair-note" role="status">
            <span className="repair-face">•ᴗ•</span>
            <p>
              Oh. That’s not supposed to move.
              <small>
                Try giving the loose “o” a nudge. Or{" "}
                <a href="/about">just read about me</a>.
              </small>
            </p>
            <button onClick={breakPage}>Nudge it ↗</button>
          </div>
        )}
        {!loose && path === "/" && (
          <p className="secret-hint">
            Perfectly ordinary website. <span>Probably.</span>
          </p>
        )}
        {broken && (
          <div className="break-caption" role="status">
            <div className="eyebrow">WELL, THAT ESCALATED.</div>
            <p>There’s a little more under the surface.</p>
            <button onClick={enter}>Skip transition →</button>
          </div>
        )}
      </main>
      <footer className="site-footer">
        <span>© {new Date().getFullYear()} JOSHUA KOO</span>
      </footer>
      {broken && (
        <div className="paper-portal" aria-hidden="true">
          <span>JOSHUA.EXE</span>
          <div className="portal-light" />
        </div>
      )}
    </div>
  );
}
