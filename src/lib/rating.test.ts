import { describe, expect, it } from "vitest";
import { RATING } from "./constants";
import { applyRatingDelta, fromTenths, priceFromRating, ratingDelta, toTenths } from "./rating";

const quiet = { goals: 0, assists: 0, played: true, streakBefore: 0, rsvpGoing: true, finePoints: 0 };

describe("ratingDelta", () => {
  it("rewards turning up, goals and assists", () => {
    expect(ratingDelta(quiet)).toBe(RATING.PLAYED);
    expect(ratingDelta({ ...quiet, goals: 2, assists: 1 })).toBe(RATING.PLAYED + 2 * RATING.GOAL + RATING.ASSIST);
  });

  it("rewards consistency up to a cap", () => {
    expect(ratingDelta({ ...quiet, streakBefore: 1 })).toBe(RATING.PLAYED + RATING.STREAK_PER_GAMEWEEK);
    expect(ratingDelta({ ...quiet, streakBefore: 99 })).toBe(RATING.PLAYED + RATING.STREAK_CAP);
  });

  it("punishes a no-show more than a quiet absence", () => {
    expect(ratingDelta({ ...quiet, played: false, rsvpGoing: true })).toBe(RATING.NO_SHOW_AFTER_GOING);
    expect(ratingDelta({ ...quiet, played: false, rsvpGoing: false })).toBe(RATING.ABSENT);
    expect(RATING.NO_SHOW_AFTER_GOING).toBeLessThan(RATING.ABSENT);
  });

  it("subtracts fines, even from a good game", () => {
    expect(ratingDelta({ ...quiet, goals: 1, finePoints: 2 })).toBe(RATING.PLAYED + RATING.GOAL + 2 * RATING.PER_FINE_POINT);
  });
});

describe("applyRatingDelta", () => {
  it("stays within the rating limits", () => {
    expect(applyRatingDelta(RATING.MAX - 1, 50)).toBe(RATING.MAX);
    expect(applyRatingDelta(RATING.MIN + 1, -50)).toBe(RATING.MIN);
    expect(applyRatingDelta(1000, 10)).toBe(1010);
  });
});

describe("priceFromRating", () => {
  it("is the base price at the base rating, rises with rating, and is clamped", () => {
    expect(priceFromRating(1000)).toBe(8);
    expect(priceFromRating(1100)).toBe(10);
    expect(priceFromRating(1010)).toBe(8.2);
    expect(priceFromRating(RATING.MAX)).toBe(15);
    expect(priceFromRating(RATING.MIN)).toBe(4);
  });
});

describe("money in tenths", () => {
  it("converts both ways without float drift", () => {
    expect(toTenths("8.1") + toTenths("0.2")).toBe(83);
    expect(fromTenths(83)).toBe(8.3);
  });
});
