import React from "react";
import { createRoot } from "react-dom/client";
import { Portfolio } from "./site/Portfolio";
import { Stage } from "./stage/Stage";
import { isPlayPath } from "./stage/peephole/policy";
import "./style.css";
import "./site/glass.css";

/**
 * One document for the whole session. The portfolio is real DOM on top; the
 * game's canvas lives in a persistent stage behind it on every route, so
 * "/" → "/play" is a pushState and a camera move, never a reload.
 */
const startedOnPlay = isPlayPath(location.pathname);

function App() {
  return (
    <>
      {!startedOnPlay && <Portfolio />}
      <Stage play={startedOnPlay} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
