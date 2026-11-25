export type TheaterFilm = {
  id: string;
  title: string;
  episode: string;
  channel: string;
  kind: "Full episode" | "Full movie" | "Short film" | "Trailer";
};
