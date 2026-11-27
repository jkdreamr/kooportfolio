import { directJourney, WORLD_NAMES, type TravelWorld } from "../core/travel";
import "./travel-map.css";

/**
 * How long each ride takes, as shown on the cards. These are the travel
 * timeline's lengths (world workstream, B7: plane 18 s, train 14 s; 6 s
 * with reduced motion); keep them in step if the timeline changes.
 */
export const RIDE_SECONDS = { plane: 18, train: 14 } as const;
export const REDUCED_RIDE_SECONDS = 6;
export function rideLabel(mode: "plane" | "train", reducedMotion = false) {
  const seconds = reducedMotion ? REDUCED_RIDE_SECONDS : RIDE_SECONDS[mode];
  return `${mode === "plane" ? "Fly" : "Train"} · ${seconds} s`;
}
const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Island({ world }: { world: TravelWorld }) {
  return (
    <svg viewBox="0 0 120 100" aria-hidden="true">
      <ellipse cx="60" cy="76" rx="49" ry="15" fill="#7c9d9f" opacity=".2" />
      <path d="M14 61Q20 48 57 48T108 61L102 74Q60 94 20 74Z" fill="#af9876" />
      <ellipse cx="61" cy="60" rx="47" ry="17" fill="#97b472" />
      <path
        d="M30 66Q60 47 90 65"
        fill="none"
        stroke="#e4d4a7"
        strokeWidth="6"
      />
      <g fill="#4b7755">
        <circle cx="29" cy="51" r="10" />
        <circle cx="93" cy="48" r="12" />
        <circle cx="84" cy="37" r="8" />
      </g>
      {world === "home" ? (
        <g>
          <path d="M44 43V65H76V43L60 32Z" fill="#f0d8ae" />
          <path d="m39 44 21-18 22 18-5 5-17-14-16 14Z" fill="#ad654c" />
          <path d="M57 51h8v14h-8Z" fill="#4c6665" />
        </g>
      ) : world === "stanford" ? (
        <g>
          <path d="M49 25h23v40H49Z" fill="#ddc69e" />
          <path d="M47 25h27l-4-9H51Z" fill="#ad654c" />
          <path d="M57 32h7v15h-7Z" fill="#6c705b" />
          <path d="M43 59h35v7H43Z" fill="#e9d9b7" />
        </g>
      ) : (
        <g>
          <path d="M58 32h6l3 34H55Z" fill="#eee4cc" />
          <path d="M47 27h28v9H47Z" fill="#4c6665" />
          <ellipse cx="61" cy="26" rx="16" ry="5" fill="#e3d8bc" />
          <path d="M61 24V7" stroke="#4c6665" strokeWidth="2" />
        </g>
      )}
    </svg>
  );
}

export function TravelMap({
  world,
  onChoose,
}: {
  world: TravelWorld;
  onChoose: (destination: TravelWorld) => void;
}) {
  return (
    <nav
      className="island-map"
      aria-label="Choose an island"
      onKeyDown={(event) => {
        if (event.key === " ") event.stopPropagation();
      }}
    >
      <svg
        className="island-map-routes"
        viewBox="0 0 400 350"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M110 105Q100 220 195 260T300 110Q200 12 110 105" />
      </svg>
      {(["home", "stanford", "korea"] as const).map((destination) => {
        const route = directJourney(world, destination);
        return (
          <button
            key={destination}
            className={`island-map-stop island-map-stop--${destination}`}
            disabled={!route}
            aria-current={!route ? "location" : undefined}
            aria-label={
              route
                ? `Travel to ${WORLD_NAMES[destination]}, ${rideLabel(route.mode, prefersReducedMotion()).replace(" · ", ", ").replace(" s", " seconds")}`
                : `${WORLD_NAMES[destination]}, you are here`
            }
            onClick={() => onChoose(destination)}
          >
            <Island world={destination} />
            <strong>{WORLD_NAMES[destination]}</strong>
            <span>
              {!route
                ? "You are here"
                : rideLabel(route.mode, prefersReducedMotion())}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
