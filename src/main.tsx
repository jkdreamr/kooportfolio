import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { App, normalizePath } from "./site/App";
import { isPlayPath } from "./stage/peephole/policy";
import "./style.css";

/**
 * Portfolio routes arrive prerendered (scripts/prerender.mjs) and are
 * hydrated in place: no second layout, no shift. /play has nothing to adopt
 * and mounts fresh.
 */
const play = isPlayPath(location.pathname);
const container = document.getElementById("root")!;
const app = (
  <React.StrictMode>
    <App path={normalizePath(location.pathname)} play={play} />
  </React.StrictMode>
);
if (!play && container.firstElementChild) hydrateRoot(container, app);
else {
  container.textContent = "";
  createRoot(container).render(app);
}
