export const THEATER_SEAT_X = 4.1;
export const THEATER_SEAT_Z = 5.6;
export const THEATER_EYE: [number, number, number] = [
  THEATER_SEAT_X, 1.95, THEATER_SEAT_Z,
];
export const THEATER_SCREEN: [number, number, number] = [0, 3.65, -10.24];
export const THEATER_PLAYER_WIDTH = 960;
export const THEATER_PLAYER_HEIGHT = 540;
export const THEATER_SCREEN_WIDTH = 10.4;
export const THEATER_SCREEN_HEIGHT =
  THEATER_SCREEN_WIDTH * THEATER_PLAYER_HEIGHT / THEATER_PLAYER_WIDTH;

export function theaterFov(aspect: number, height: number) {
  const vertical = Math.tan(33 * Math.PI / 360);
  const toolbarClearance = 80;
  const roomBelowCenter = Math.max(0.1, 1 - 2 * toolbarClearance / height);
  const fitAboveToolbar = 0.20 / roomBelowCenter;
  return Math.atan(Math.max(vertical, 0.39 / aspect, fitAboveToolbar)) * 360 / Math.PI;
}
