import { useEffect, useMemo, useRef } from "react";
import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { create } from "zustand";
import { Box, Cylinder, Sign } from "../world/Models";
import { runtime, useGame } from "../core/store";
import { THEATER_PROGRAM, youtubeEmbedUrl } from "../core/theaterProgram";
import { GameControls } from "./InteriorProps";
import "./movie-theater.css";

type TheaterState = {
  seated: boolean;
  filmId: string | null;
  sit: () => void;
  stand: () => void;
};
export const useTheater = create<TheaterState>((set) => ({
  seated: false,
  filmId: null,
  sit: () => {
    runtime.target = null;
    runtime.path = [];
    runtime.moving = false;
    set({ seated: true, filmId: null });
  },
  stand: () => set({ seated: false, filmId: null }),
}));

export function MovieTheaterBuilding({
  p = [-38, 0, -39],
}: {
  p?: [number, number, number];
}) {
  return (
    <group position={p}>
      <Box p={[0, 0.35, 0]} s={[10.4, 0.7, 8.4]} c="#afa184" />
      <Box p={[0, 2.8, 0]} s={[9.4, 5, 7.5]} c="#bca888" />
      <Box p={[0, 5.2, 0]} s={[10.2, 0.6, 8.1]} c="#77443d" />
      <Box p={[0, 5.75, -0.6]} s={[8, 0.7, 5.5]} c="#974a3e" />
      <Box p={[0, 6.3, -0.6]} s={[5.7, 0.45, 4.7]} c="#b26045" />
      {[-4.35, 4.35].map((x) => (
        <group key={x}>
          <Box p={[x, 2.8, 3.8]} s={[0.72, 5.2, 0.6]} c="#d8c5a1" />
          <Box p={[x, 5.5, 3.8]} s={[1, 0.35, 0.85]} c="#ead8ae" />
        </group>
      ))}
      <Box p={[0, 1.8, 3.8]} s={[2.8, 3, 0.16]} c="#3c3540" />
      {[-0.72, 0.72].map((x) => (
        <Box key={x} p={[x, 1.9, 3.91]} s={[1.2, 2.4, 0.08]} c="#71443c" />
      ))}
      <Box p={[0, 1.9, 4]} s={[0.12, 2.6, 0.1]} c="#d6af5e" />
      <Box p={[0, 3.8, 4.15]} s={[7.8, 0.8, 1.8]} c="#985441" />
      <Box p={[0, 4.22, 4.15]} s={[8.2, 0.16, 2]} c="#d1ac62" />
      <Sign text="THE PICTURE HOUSE" p={[0, 3.85, 5.08]} size={[6.8, 0.6]} />
      {[-3.4, -2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55, 3.4].map((x) => (
        <mesh key={x} position={[x, 3.32, 4.75]}>
          <sphereGeometry args={[0.1, 6, 4]} />
          <meshBasicMaterial color="#ffe9a0" />
        </mesh>
      ))}
      {[-3.1, 3.1].map((x) => (
        <group key={x}>
          <Box p={[x, 1.9, 3.88]} s={[1.3, 2.1, 0.15]} c="#b89959" />
          <Box p={[x, 1.9, 3.98]} s={[1.1, 1.85, 0.08]} c="#314b55" />
          <Cylinder
            p={[x, 2.1, 4.05]}
            s={[0.35, 0.04, 0.35]}
            r={[Math.PI / 2, 0, 0]}
            c="#d4b879"
          />
        </group>
      ))}
      <Box p={[0, 0.35, 4.7]} s={[3.6, 0.36, 1.4]} c="#cbbb9a" />
    </group>
  );
}

function TheaterSeat({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <Box p={[0, 0.3, 0]} s={[0.75, 0.6, 0.7]} c="#4b3431" />
      <Box p={[0, 0.68, 0]} s={[0.85, 0.28, 0.8]} c="#9b433d" />
      <Box
        p={[0, 1.13, 0.35]}
        s={[0.9, 1, 0.3]}
        c="#893a37"
        r={[-0.09, 0, 0]}
      />
      {[-0.52, 0.52].map((dx) => (
        <Box key={dx} p={[dx, 0.88, 0.06]} s={[0.16, 0.18, 0.95]} c="#b49458" />
      ))}
    </group>
  );
}

function TheaterViewer() {
  const filmId = useTheater((s) => s.filmId);
  const hidden = useGame((s) => s.paused || s.build || s.panel !== "none");
  const selected = THEATER_PROGRAM.find((film) => film.id === filmId);
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const gl = useThree((s) => s.gl);
  const portal = useMemo(
    () => ({ current: gl.domElement.parentElement! }),
    [gl],
  );
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        useTheater.getState().stand();
      }
      if (event.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>(
          "button,a[href],iframe",
        );
        if (!controls?.length) return;
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          last.focus();
          event.preventDefault();
        }
        if (!event.shiftKey && document.activeElement === last) {
          first.focus();
          event.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", keydown, true);
    return () => {
      window.removeEventListener("keydown", keydown, true);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <Html fullscreen portal={portal} zIndexRange={[80, 0]}>
      <section
        ref={dialog}
        className="cinema-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="Picture house"
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <header>
          <h2>The picture house</h2>
          <button ref={close} onClick={() => useTheater.getState().stand()}>
            Leave seat
          </button>
        </header>
        {selected && !hidden ? (
          <div className="cinema-screen">
            <iframe
              key={selected.id}
              title={`${selected.title} — ${selected.episode}`}
              src={youtubeEmbedUrl(selected.id)}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="cinema-idle">
            <span aria-hidden="true">▶</span>
            <p>{hidden ? "Screen paused" : "Choose something to watch"}</p>
          </div>
        )}
        {selected && (
          <div className="cinema-now">
            <span>
              <strong>{selected.title}</strong> · {selected.episode}
            </span>
            <a
              href={`https://www.youtube.com/watch?v=${selected.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open on YouTube ↗
            </a>
            <button onClick={() => useTheater.setState({ filmId: null })}>
              Stop
            </button>
          </div>
        )}
        <div className="cinema-program" aria-label="Program">
          {THEATER_PROGRAM.length === 0 && (
            <p>The program is being prepared.</p>
          )}
          {THEATER_PROGRAM.map((film) => (
            <button
              key={film.id}
              aria-pressed={filmId === film.id}
              onClick={() => useTheater.setState({ filmId: film.id })}
            >
              <small>
                {film.kind} · {film.channel}
              </small>
              <strong>{film.title}</strong>
              <span>{film.episode}</span>
            </button>
          ))}
        </div>
      </section>
    </Html>
  );
}

export function MovieTheaterInterior() {
  const seated = useTheater((s) => s.seated);
  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.hidden) useTheater.setState({ filmId: null });
    };
    const unsubscribe = useGame.subscribe((state) => {
      if (state.paused || state.panel !== "none" || state.build)
        useTheater.setState({ filmId: null });
    });
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", stopWhenHidden);
      useTheater.getState().stand();
    };
  }, []);
  return (
    <group name="picture-house-interior">
      <Box p={[0, 0.06, -1]} s={[20.8, 0.1, 23.5]} c="#473638" />
      <Box p={[0, 0.15, -0.5]} s={[2.5, 0.08, 22]} c="#9b4942" />
      <Box p={[0, 3, -12.35]} s={[21, 5.8, 0.25]} c="#543936" />
      <Box p={[0, 2.5, -10.7]} s={[15.8, 4.8, 0.5]} c="#b39a61" />
      <Box p={[0, 2.5, -10.36]} s={[14.9, 4.05, 0.2]} c="#e8dfc8" />
      <Box p={[0, 0.3, -9.7]} s={[19.5, 0.5, 3.3]} c="#795b49" />
      {[-1, 1].flatMap((side) =>
        [0, 1, 2].map((i) => (
          <Cylinder
            key={`${side}:${i}`}
            p={[side * (8.5 + i * 0.55), 2.9, -10.25]}
            s={[0.42, 5.5, 0.42]}
            c={i % 2 ? "#853b36" : "#a24b3f"}
          />
        )),
      )}
      <Sign text="THE PICTURE HOUSE" p={[0, 5.25, -10.3]} size={[6.5, 0.6]} />
      {[-5.2, -1.6, 2, 5.6].flatMap((z) =>
        [-7.5, -5.8, -4.1, 4.1, 5.8, 7.5].map((x) => (
          <TheaterSeat key={`${x}:${z}`} x={x} z={z} />
        )),
      )}
      {[-9.8, 9.8].flatMap((x) =>
        [-7, 0, 7].map((z) => (
          <group key={`${x}:${z}`}>
            <Box p={[x, 2.4, z]} s={[0.3, 0.9, 0.55]} c="#b59b5d" />
            <Box p={[x * 0.98, 2.4, z]} s={[0.35, 0.55, 0.33]} c="#f3d997" />
          </group>
        )),
      )}
      <Sign text="EXIT ↓" p={[0, 3, 10.6]} size={[2, 0.55]} />
      {!seated && (
        <GameControls name="Picture house seating" position={[0, 1, 7]}>
          <h2>The picture house</h2>
          <button onClick={() => useTheater.getState().sit()}>
            Take a seat
          </button>
        </GameControls>
      )}
      {seated && <TheaterViewer />}
    </group>
  );
}
