// Two full-size rows share a short high street. There is no lawn or ornamental
// district between one playable destination and the next.
export const HOME_DESTINATION_CENTERS: Readonly<
  Record<string, readonly [number, number]>
> = {
  theater: [-24, -25],
  music: [-11, -25],
  writing: [0, -25],
  office: [11.5, -25],
  go: [-24, -11],
  kitchen: [-11, -11],
  stadium: [4, -11],
};

// Residents use the same streets as visitors; the garden Neighbor keeps her
// authored allotment routine instead of being brought into a shop doorway.
export const HOME_NPC_WALKS: Record<string, [number, number][]> = {
  music: [
    [-14, -18],
    [-10, -18],
    [-6, -18],
    [-5, -21],
    [-18, -21],
    [-18, -18],
  ],
  writing: [
    [-1, -20],
    [2, -20],
    [7, -18],
    [1, -18],
  ],
  office: [
    [11.5, -19],
    [15, -18],
    [18, -18],
    [18, -21],
  ],
  go: [
    [-26, -5],
    [-22, -5],
    [-19, -3],
    [-24, -2],
  ],
  kitchen: [
    [-17, -5.8],
    [-5, -5.8],
    [-5, -3.2],
    [-17, -3.2],
  ],
  stadium: [
    [4, -5],
    [8.7, -5],
    [10, -3],
    [5, -3],
  ],
  gardener: [
    [-13, -4],
    [-13, 0],
    [-13, 3.5],
    [-13, 9],
    [-13, 3.5],
  ],
  reader: [
    [10, 4.4],
    [14, 8],
    [18, -3],
    [17, -18],
    [17, -25],
    [11.5, -19],
  ],
  "home-neighbor": [
    [-13, 3.5],
    [-13, 9],
    [-13, 3.5],
    [-27, 3.5],
  ],
};
