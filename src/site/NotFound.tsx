/**
 * The 404 page (public 404.html, written by scripts/prerender.mjs). Static:
 * it ships the portfolio stylesheet and no script, so a mistyped link costs a
 * few kilobytes and never boots the game.
 */
export function NotFound() {
  return (
    <div className="portfolio not-found">
      <header className="site-header">
        <a href="/" className="wordmark">
          JOSHUA KOO
        </a>
      </header>
      <main className="editorial">
        <h1>Nothing here.</h1>
        <p className="bio">That page does not exist, or it moved.</p>
        <nav className="portfolio-nav" aria-label="Portfolio">
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/work">Work</a>
          <a href="/contact">Contact</a>
        </nav>
      </main>
    </div>
  );
}
