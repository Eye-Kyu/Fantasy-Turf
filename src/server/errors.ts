/** Errors the UI turns into messages; anything else is an unexpected failure. */

export class ForbiddenError extends Error {
  constructor(action: string) {
    super(`Not allowed to ${action}`);
    this.name = "ForbiddenError";
  }
}

export class EmailTakenError extends Error {
  constructor() {
    super("An account with that email already exists");
    this.name = "EmailTakenError";
  }
}

export class PhoneTakenError extends Error {
  constructor() {
    super("An account with that phone number already exists");
    this.name = "PhoneTakenError";
  }
}

export class InvalidInviteError extends Error {
  constructor() {
    super("This invite is invalid, expired or already used");
    this.name = "InvalidInviteError";
  }
}

export class TooManyAttemptsError extends Error {
  constructor() {
    super("Too many failed sign-in attempts");
    this.name = "TooManyAttemptsError";
  }
}

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

export class TraitExistsError extends Error {
  constructor(name: string) {
    super(`A trait named "${name}" already exists`);
    this.name = "TraitExistsError";
  }
}

export class RsvpClosedError extends Error {
  constructor() {
    super("RSVPs for this gameweek are closed");
    this.name = "RsvpClosedError";
  }
}

export class SeasonExistsError extends Error {
  constructor(name: string) {
    super(`A season named "${name}" already exists`);
    this.name = "SeasonExistsError";
  }
}

export class TeamsLockedError extends Error {
  constructor() {
    super("Teams are locked for this gameweek");
    this.name = "TeamsLockedError";
  }
}

export class PlayerNotGoingError extends Error {
  constructor() {
    super("Only players who RSVP'd Going can be put on a team");
    this.name = "PlayerNotGoingError";
  }
}

/** Why a scoring or reconciliation action was refused; the code picks the message shown. */
export type ScoringErrorCode =
  | "not-open" // teams are not locked yet, so the match cannot be scored
  | "playing" // the user plays in this match
  | "not-scorer" // someone else is the live scorer
  | "scorer-taken"
  | "locked" // the gameweek is locked and the user is not an organizer
  | "invalid-event"
  | "not-reconciled";

export class ScoringError extends Error {
  constructor(
    readonly code: ScoringErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScoringError";
  }
}
