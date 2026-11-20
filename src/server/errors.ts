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
