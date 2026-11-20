/** Rating and price rules. Pure functions; constants are in constants.ts. */
import { PRICE, RATING } from "@/lib/constants";

export interface GameweekForm {
  goals: number;
  assists: number;
  /** Turned up and played at least one match. */
  played: boolean;
  /** Consecutive gameweeks played immediately before this one. */
  streakBefore: number;
  /** Had RSVP'd Going. */
  rsvpGoing: boolean;
  /** Points deducted by active fines this gameweek (positive). */
  finePoints: number;
}

/** How much a player's rating moves after a gameweek. */
export function ratingDelta(form: GameweekForm): number {
  let delta = form.finePoints * RATING.PER_FINE_POINT;
  if (form.played) {
    delta += RATING.PLAYED + form.goals * RATING.GOAL + form.assists * RATING.ASSIST;
    delta += Math.min(form.streakBefore * RATING.STREAK_PER_GAMEWEEK, RATING.STREAK_CAP);
  } else {
    delta += form.rsvpGoing ? RATING.NO_SHOW_AFTER_GOING : RATING.ABSENT;
  }
  return delta;
}

export function applyRatingDelta(rating: number, delta: number): number {
  return Math.min(RATING.MAX, Math.max(RATING.MIN, rating + delta));
}

/** Price in millions (one decimal) for a rating. */
export function priceFromRating(rating: number): number {
  const raw = PRICE.BASE + (rating - PRICE.BASE_RATING) / PRICE.RATING_PER_MILLION;
  return Math.round(Math.min(PRICE.MAX, Math.max(PRICE.MIN, raw)) * 10) / 10;
}

/** Money is compared in tenths of a million so decimals never cause rounding surprises. */
export const toTenths = (millions: number | string): number => Math.round(Number(millions) * 10);
export const fromTenths = (tenths: number): number => tenths / 10;
