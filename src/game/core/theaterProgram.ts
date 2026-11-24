export type TheaterFilm = {
  id: string;
  title: string;
  episode: string;
  channel: string;
  kind: "Full episode" | "Short film" | "Trailer";
};

// Add only owner-approved, official uploads whose embeds have been checked.
// No thumbnail, oEmbed or player requests run while browsing this catalog.
export const THEATER_PROGRAM: readonly TheaterFilm[] = [];

export function youtubeEmbedUrl(id: string) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("Invalid YouTube video ID");
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}
