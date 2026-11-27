// Theater catalog access. The five catalogue shards (≈170 KB of source) are
// loaded with a dynamic import when the visitor nears or enters a cinema, so
// they are not part of the engine chunk everyone downloads.
// No thumbnail, oEmbed or player requests run while browsing the catalog.
import type { TheaterFilm } from "./theater/types";

export type { TheaterFilm };
export type TheaterKind = "home" | "korea";

type Catalogue = typeof import("./theater/catalogue");
let catalogue: Promise<Catalogue> | null = null;

/** Starts (or reuses) the catalogue download. Safe to call often. */
export function warmTheaterProgram(): Promise<Catalogue> {
  catalogue ??= import("./theater/catalogue").catch((error) => {
    catalogue = null; // A later visit tries again.
    throw error;
  });
  return catalogue;
}

/** The programme for a cinema; rejects only if the chunk cannot load. */
export async function loadTheaterProgram(kind: TheaterKind): Promise<readonly TheaterFilm[]> {
  const c = await warmTheaterProgram();
  return kind === "korea" ? c.KOREA_THEATER_PROGRAM : c.THEATER_PROGRAM;
}

export function youtubeEmbedUrl(id: string) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}
