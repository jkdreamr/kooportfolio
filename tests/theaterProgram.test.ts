import { describe, expect, it } from "vitest";
import {
  KOREA_THEATER_PROGRAM,
  OFFICIAL_CHANNELS,
  SHARD_CHANNELS,
  THEATER_PROGRAM,
  type TheaterFilm,
} from "../src/game/core/theater/catalogue";

/**
 * Catalog size each theater must reach. The data shards are still being
 * filled, so this fails until they land; lower it only on purpose.
 */
const MIN_FILMS_PER_THEATER = 150;

const KINDS: readonly TheaterFilm["kind"][] = [
  "Full episode",
  "Full movie",
  "Short film",
  "Trailer",
];

const PROGRAMS = {
  home: THEATER_PROGRAM,
  korea: KOREA_THEATER_PROGRAM,
} as const;

describe.each(Object.entries(PROGRAMS))("%s theater program", (_, program) => {
  it("uses well-formed YouTube video IDs", () => {
    const bad = program.filter((film) => !/^[\w-]{11}$/.test(film.id));
    expect(bad).toEqual([]);
  });

  it("lists every video once", () => {
    const ids = program.map((film) => film.id);
    const dupes = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(dupes).toEqual([]);
  });

  it("names every film's channel in OFFICIAL_CHANNELS", () => {
    const unknown = program
      .filter((film) => !Object.hasOwn(OFFICIAL_CHANNELS, film.channel))
      .map((film) => `${film.id} ${film.channel}`);
    expect(unknown).toEqual([]);
  });

  it("has a title, an episode and a known kind for every film", () => {
    const bad = program.filter(
      (film) =>
        !film.title.trim() ||
        !film.episode.trim() ||
        !film.channel.trim() ||
        !KINDS.includes(film.kind),
    );
    expect(bad).toEqual([]);
  });

  it("never repeats a (title, episode) pair", () => {
    const keys = program.map((film) => `${film.title}\u0000${film.episode}`);
    const dupes = keys.filter((key, index) => keys.indexOf(key) !== index);
    expect(dupes.map((key) => key.replace("\u0000", " · "))).toEqual([]);
  });

  it(`has at least ${MIN_FILMS_PER_THEATER} films`, () => {
    expect(program.length).toBeGreaterThanOrEqual(MIN_FILMS_PER_THEATER);
  });
});

describe("theater catalogs", () => {
  it("never share a video between the two theaters", () => {
    const home = new Set(THEATER_PROGRAM.map((film) => film.id));
    const shared = KOREA_THEATER_PROGRAM.filter((film) => home.has(film.id));
    expect(shared.map((film) => film.id)).toEqual([]);
  });

  it("maps every official channel to a channel ID", () => {
    const bad = Object.entries(OFFICIAL_CHANNELS).filter(
      ([name, id]) => !name.trim() || !/^UC[\w-]{22}$/.test(id),
    );
    expect(bad).toEqual([]);
  });

  it("gives a channel name the same ID in every shard", () => {
    const conflicts = Object.entries(SHARD_CHANNELS).flatMap(([shard, map]) =>
      Object.entries(map)
        .filter(([name, id]) => OFFICIAL_CHANNELS[name] !== id)
        .map(([name, id]) => `${shard}: ${name} ${id} ≠ ${OFFICIAL_CHANNELS[name]}`),
    );
    expect(conflicts).toEqual([]);
  });
});
