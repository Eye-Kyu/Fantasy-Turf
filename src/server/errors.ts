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
