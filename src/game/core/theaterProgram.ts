// Theater catalog glue. The films live in per-source shards under ./theater/,
// each verified against live YouTube with `npm run verify:theater`: official
// rights-holder uploads only, embeddable, owner channel ID allowlisted.
// No thumbnail, oEmbed or player requests run while browsing this catalog.
import * as homeDisneyWb from "./theater/home-disney-wb";
import * as homeFamilyTrailers from "./theater/home-family-trailers";
import * as homeClassicToons from "./theater/home-classic-toons";
import * as koreaIdolWeb from "./theater/korea-idol-web";
import * as koreaTvDramaFilm from "./theater/korea-tv-drama-film";
import type { TheaterFilm } from "./theater/types";

export type { TheaterFilm };

/** The home island's picture house. */
export const THEATER_PROGRAM: readonly TheaterFilm[] = [
  ...homeDisneyWb.FILMS,
  ...homeFamilyTrailers.FILMS,
  ...homeClassicToons.FILMS,
];

/** The Korea island's 서울 극장. */
export const KOREA_THEATER_PROGRAM: readonly TheaterFilm[] = [
  ...koreaIdolWeb.FILMS,
  ...koreaTvDramaFilm.FILMS,
];

/** Display channel name → official YouTube channel ID, across every shard. */
export const OFFICIAL_CHANNELS: Readonly<Record<string, string>> = {
  ...homeDisneyWb.CHANNELS,
  ...homeFamilyTrailers.CHANNELS,
  ...homeClassicToons.CHANNELS,
  ...koreaIdolWeb.CHANNELS,
  ...koreaTvDramaFilm.CHANNELS,
};

/** Each shard's own channel map, so tests can catch one name → two IDs. */
export const SHARD_CHANNELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  "home-disney-wb": homeDisneyWb.CHANNELS,
  "home-family-trailers": homeFamilyTrailers.CHANNELS,
  "home-classic-toons": homeClassicToons.CHANNELS,
  "korea-idol-web": koreaIdolWeb.CHANNELS,
  "korea-tv-drama-film": koreaTvDramaFilm.CHANNELS,
};

export function youtubeEmbedUrl(id: string) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}
