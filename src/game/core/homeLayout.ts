// Home's outer destinations move into the village; shells and rooms keep their
// normal dimensions. Other islands intentionally keep their authored placement.
export const HOME_DESTINATION_CENTERS: Readonly<
  Record<string, readonly [number, number]>
> = {
  theater: [-24, -25],
  writing: [0, -34],
  stadium: [14, -23],
  go: [-20, 12],
};
