/**
 * Build-time renderer for the portfolio routes (scripts/prerender.mjs loads
 * this through Vite's SSR module loader). The markup is exactly what the
 * client's first render produces, so `hydrateRoot` adopts it without a
 * layout shift.
 */
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { App } from "./App";
import { NotFound } from "./NotFound";

export function renderRoute(path: string) {
  return renderToString(
    <StrictMode>
      <App path={path} play={false} />
    </StrictMode>,
  );
}

export function renderNotFound() {
  return renderToString(
    <StrictMode>
      <NotFound />
    </StrictMode>,
  );
}
