export type Card = { rank: number; suit: "♠" | "♥" | "♦" | "♣" };
export type Blackjack = {
  phase: "bet" | "player" | "dealer" | "over";
  bank: number;
  bet: number;
  stake: number;
  player: Card[];
  dealer: Card[];
  deck: Card[];
  round: number;
  result: "" | "win" | "blackjack" | "push" | "lose";
  message: string;
};
export const canDouble = (state: Blackjack) =>
  state.phase === "player" &&
  state.player.length === 2 &&
  state.bank >= state.stake &&
  state.deck.length > 0;
export const cardLabel = (card: Card) =>
  `${({ 1: "A", 11: "J", 12: "Q", 13: "K" } as Record<number, string>)[card.rank] ?? card.rank}${card.suit}`;
export function handValue(cards: readonly Card[]): number {
  let total = cards.reduce(
    (sum, card) => sum + (card.rank === 1 ? 11 : Math.min(card.rank, 10)),
    0,
  );
  let aces = cards.filter((card) => card.rank === 1).length;
  while (total > 21 && aces-- > 0) total -= 10;
  return total;
}
export function shuffledDeck(random = Math.random): Card[] {
  const cards = (["♠", "♥", "♦", "♣"] as const).flatMap((suit) =>
    Array.from({ length: 13 }, (_, i) => ({ rank: i + 1, suit })),
  );
  for (let i = cards.length - 1; i > 0; i--) {
    const other = Math.floor(random() * (i + 1));
    [cards[i], cards[other]] = [cards[other], cards[i]];
  }
  return cards;
}
export const newBlackjack = (): Blackjack => ({
  phase: "bet",
  bank: 100,
  bet: 10,
  stake: 0,
  player: [],
  dealer: [],
  deck: [],
  round: 0,
  result: "",
  message: "Dealer stands on 17.",
});
type Action =
  | { type: "wager"; amount: number }
  | { type: "deal"; deck: Card[] }
  | { type: "hit" }
  | { type: "stand" }
  | { type: "double" }
  | { type: "dealer" }
  | { type: "refill" };
function settle(state: Blackjack, result: Blackjack["result"]): Blackjack {
  const payout =
    result === "blackjack"
      ? state.stake * 2.5
      : result === "win"
        ? state.stake * 2
        : result === "push"
          ? state.stake
          : 0;
  return {
    ...state,
    phase: "over",
    result,
    bank: state.bank + payout,
    message:
      result === "blackjack"
        ? `Blackjack. +${state.stake * 1.5} chips.`
        : result === "win"
          ? `You win. +${state.stake} chips.`
          : result === "push"
            ? "Push. Bet returned."
            : handValue(state.player) > 21
              ? "Bust. Dealer wins."
              : "Dealer wins.",
  };
}
export function blackjackReducer(state: Blackjack, action: Action): Blackjack {
  if (action.type === "wager")
    return (state.phase === "bet" || state.phase === "over") &&
      [10, 20, 50].includes(action.amount) &&
      action.amount <= state.bank
      ? { ...state, bet: action.amount }
      : state;
  if (action.type === "refill")
    return state.bank < 10 && (state.phase === "bet" || state.phase === "over")
      ? { ...state, bank: 100, bet: 10, message: "100 play chips." }
      : state;
  if (action.type === "deal") {
    if (
      (state.phase !== "bet" && state.phase !== "over") ||
      state.bank < state.bet ||
      action.deck.length < 4
    )
      return state;
    const next: Blackjack = {
      ...state,
      phase: "player",
      result: "",
      bank: state.bank - state.bet,
      stake: state.bet,
      player: [action.deck[0], action.deck[2]],
      dealer: [action.deck[1], action.deck[3]],
      deck: action.deck.slice(4),
      round: state.round + 1,
      message: "Hit or stand.",
    };
    if (handValue(next.player) === 21)
      return settle(next, handValue(next.dealer) === 21 ? "push" : "blackjack");
    if (handValue(next.dealer) === 21) return settle(next, "lose");
    return next;
  }
  if (action.type === "stand")
    return state.phase === "player"
      ? { ...state, phase: "dealer", message: "Dealer’s turn." }
      : state;
  if (action.type === "double") {
    if (!canDouble(state)) return state;
    const next = {
      ...state,
      bank: state.bank - state.stake,
      stake: state.stake * 2,
      player: [...state.player, state.deck[0]],
      deck: state.deck.slice(1),
    };
    return handValue(next.player) > 21
      ? settle(next, "lose")
      : { ...next, phase: "dealer", message: "Doubled. Dealer’s turn." };
  }
  if (action.type === "hit") {
    if (state.phase !== "player" || !state.deck.length) return state;
    const next = {
      ...state,
      player: [...state.player, state.deck[0]],
      deck: state.deck.slice(1),
    };
    const total = handValue(next.player);
    return total > 21
      ? settle(next, "lose")
      : total === 21
        ? { ...next, phase: "dealer", message: "Dealer’s turn." }
        : next;
  }
  if (action.type === "dealer" && state.phase === "dealer") {
    if (handValue(state.dealer) < 17 && state.deck.length)
      return {
        ...state,
        dealer: [...state.dealer, state.deck[0]],
        deck: state.deck.slice(1),
      };
    const player = handValue(state.player),
      dealer = handValue(state.dealer);
    return settle(
      state,
      dealer > 21 || player > dealer
        ? "win"
        : player === dealer
          ? "push"
          : "lose",
    );
  }
  return state;
}
