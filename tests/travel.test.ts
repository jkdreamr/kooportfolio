import { describe, expect, it } from "vitest";
import {
  canTravel,
  directJourney,
  travelOptions,
  type TravelMode,
  type TravelWorld,
} from "../src/game/core/travel";

describe("regional transport", () => {
  it("offers a valid direct map journey between every distinct pair", () => {
    const worlds: TravelWorld[] = ["home", "stanford", "korea"];
    for (const from of worlds)
      for (const to of worlds) {
        const route = directJourney(from, to);
        if (from === to) expect(route).toBe(null);
        else {
          expect(route).not.toBe(null);
          expect(canTravel(from, route!.destination, route!.mode)).toBe(true);
        }
      }
  });
  it("allows cars and trains only between home and Stanford, with no domestic station in Korea", () => {
    expect(travelOptions("korea", "station")).toEqual([]);
    for (const mode of ["car", "train"] as const) {
      expect(canTravel("home", "stanford", mode)).toBe(true);
      expect(canTravel("stanford", "home", mode)).toBe(true);
      expect(canTravel("korea", "home", mode)).toBe(false);
      expect(canTravel("stanford", "korea", mode)).toBe(false);
    }
  });
  it("requires a plane for either direction across Korea's border, never for domestic routes or the same world", () => {
    const worlds: TravelWorld[] = ["home", "stanford", "korea"];
    for (const from of worlds)
      for (const to of worlds) {
        expect(canTravel(from, to, "plane")).toBe(
          from !== to && (from === "korea" || to === "korea"),
        );
        if (from === to)
          for (const mode of ["car", "train", "plane"] as TravelMode[])
            expect(canTravel(from, to, mode)).toBe(false);
      }
  });
});
