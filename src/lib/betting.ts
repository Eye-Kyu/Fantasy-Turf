/** Pure betting rules: pooled payouts and wallet balance. Points only, never money. */
import { BETTING } from "./constants";

export interface PoolBet {
  id: string;
  stake: number;
  /** Player or team id the bet backs. */
  pick: string;
}

export interface Settlement {
  id: string;
  status: "WON" | "LOST" | "VOID";
  payout: number;
}

/**
 * Settles all bets of one kind on one match as a pool. Winners share every stake in
 * proportion to their own. If nobody won, or nobody lost, or there was no result
 * (winning set empty), every stake is refunded.
 */
export function settlePool(bets: readonly PoolBet[], winningPicks: ReadonlySet<string>): Settlement[] {
  const winners = bets.filter((b) => winningPicks.has(b.pick));
  const pool = bets.reduce((sum, b) => sum + b.stake, 0);
  const winnerStake = winners.reduce((sum, b) => sum + b.stake, 0);
  if (winners.length === 0 || winners.length === bets.length) {
    return bets.map((b) => ({ id: b.id, status: "VOID", payout: b.stake }));
  }
  return bets.map((b) =>
    winningPicks.has(b.pick)
      ? { id: b.id, status: "WON", payout: Math.floor((b.stake * pool) / winnerStake) }
      : { id: b.id, status: "LOST", payout: 0 },
  );
}

/** Points available: start + allowance for locked gameweeks + returns - stakes placed. */
export function walletBalance(input: { lockedGameweeks: number; bets: readonly { stake: number; payout: number | null }[] }): number {
  const staked = input.bets.reduce((sum, b) => sum + b.stake, 0);
  const returned = input.bets.reduce((sum, b) => sum + (b.payout ?? 0), 0);
  return BETTING.START + BETTING.ALLOWANCE * input.lockedGameweeks - staked + returned;
}
