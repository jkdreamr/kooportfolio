import { create } from "zustand";

/** The short card a readable prop shows (frames, notebooks, drawers). */
export type LifeCard = { room: string; id: string; title: string; text: string };

export const useRoomLife = create<{ card: LifeCard | null }>(() => ({ card: null }));

export const showCard = (card: LifeCard) => useRoomLife.setState({ card });
export function closeCard(match?: { room: string; id: string }) {
  const { card } = useRoomLife.getState();
  if (!card) return;
  if (match && (card.room !== match.room || card.id !== match.id)) return;
  useRoomLife.setState({ card: null });
}
