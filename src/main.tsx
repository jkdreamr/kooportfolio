import React, { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { Portfolio } from "./site/Portfolio";
import "./style.css";
import "./site/glass.css";
const Game = lazy(() => import("./game/Game"));
function App() {
  return location.pathname.startsWith("/play") ? (
    <Suspense
      fallback={
        <div className="loading-world">
          <p>Loading village…</p>
          <a href="/">Back to the portfolio</a>
        </div>
      }
    >
      <Game />
    </Suspense>
  ) : (
    <Portfolio />
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
