import { Portfolio } from "./Portfolio";
import { Stage } from "../stage/Stage";
import { BUILD_YEAR } from "./buildInfo";

/**
 * One document for the whole session. The portfolio is real DOM on top; the
 * game's canvas lives in a persistent stage behind it on every route, so
 * "/" → "/play" is a pushState and a camera move, never a reload.
 *
 * Rendered to HTML at build time (scripts/prerender.mjs) and hydrated on the
 * client, so this first render must not read anything the server cannot
 * know: the route and the year come in as props.
 */
export function App({ path, play }: { path: string; play: boolean }) {
  return (
    <>
      {!play && <Portfolio path={path} year={BUILD_YEAR} />}
      <Stage play={play} />
    </>
  );
}

/** "/about/" → "/about"; "" → "/". */
export function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, "") || "/";
}
