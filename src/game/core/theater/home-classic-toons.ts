import type { TheaterFilm } from "./types";

// Shard Home-C: classic slapstick cartoons on their rights holders' own
// channels (Pink Panther, Popeye, Woody Woodpecker, Oggy, Shaun the Sheep…).
// Official rights-holder channels only, allowlisted by channel ID.
export const CHANNELS: Record<string, string> = {
  "Official Pink Panther": "UCFeUyPY6W8qX8w2o6oSiRmw",
};

type Row = readonly [id: string, episode: string];

const show = (
  title: string,
  channel: string,
  kind: TheaterFilm["kind"],
  rows: readonly Row[],
): TheaterFilm[] =>
  rows.map(([id, episode]) => ({ id, title, episode, channel, kind }));

export const FILMS: readonly TheaterFilm[] = [
  // Theatrical shorts (1964–1980), each a single complete cartoon.
  ...show("The Pink Panther", "Official Pink Panther", "Short film", [
    ["41aGCrXM20E", "The Pink Phink"],
    ["QsAtPfjl9tI", "The Pink Flea"],
    ["kOnlduSDrfs", "Doctor Pink"],
    ["FCuRs91niXU", "A Fly in the Pink"],
    ["16YG9qZQIJE", "Put-Put, Pink"],
    ["fyLsEcRhyVo", "Little Beaux Pink"],
    ["OIiMtPzIpiQ", "Trail of the Lonesome Pink"],
    ["nB2Hsh1XqyA", "Supermarket Pink"],
    ["xF6RcZBsFwA", "String Along in Pink"],
    ["o53xMlpIhbg", "Psst Pink"],
    ["vLpEK9hV0-I", "Pink Quackers"],
    ["NQJ8sD9BGS8", "Pink Pull"],
    ["W-qZA4FhHLs", "Keep Our Forests Pink"],
    ["h7AP55CA1KA", "Pink Streaker"],
    ["JxsxzZeSQUc", "Pink Pranks"],
    ["mj6toTRtw2Y", "Tickled Pink"],
    ["M9P-eDS3oMc", "Twinkle, Twinkle, Little Pink"],
    ["r5VSo5hgQRQ", "The Pink Quarterback"],
    ["bZsqdTrr1eM", "The Pink Pill"],
    ["FWbLhPYKhiw", "The Pink Package Plot"],
    ["mhP0tPObClY", "The Hand Is Pinker than the Eye"],
    ["c2XIdNzoW3o", "Sky Blue Pink"],
    ["7y4WhR3W2Nc", "Psychedelic Pink"],
    ["Io5oqdC_1co", "Prehistoric Pink"],
    ["HQBia-CfqbE", "Prefabricated Pink"],
    ["N9irl60bduk", "Pinto Pink"],
    ["DHkS8Y5pQcs", "Pinkadilly Circus"],
    ["T0QktZ0yuqY", "Pink Valiant"],
    ["iubDWBhPwvg", "Pink Sphinx"],
    ["9FCKKBVmfEI", "Pink Paradise"],
  ]),
];
