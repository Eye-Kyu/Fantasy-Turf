/**
 * Notices shown after a form action. Actions redirect with a short code in the URL
 * (`?error=...` / `?saved=...`); only codes listed here are ever displayed, so the URL
 * can never inject text into the page.
 */
const ERRORS = {
  invalid: "Please check the form and try again.",
  credentials: "Those details don't match an account.",
  locked: "Too many failed attempts. Please wait 15 minutes and try again.",
  "email-taken": "An account with that email already exists.",
  "phone-taken": "An account with that phone number already exists.",
  "phone-invalid": "Please enter a valid phone number, e.g. 0712 345 678.",
  "invite-invalid": "This invite link is invalid, expired or already used.",
  forbidden: "You aren't allowed to do that.",
  "rsvp-closed": "RSVPs closed 3 hours before kick-off. Ask an organizer if you need to change yours.",
  "teams-locked": "Teams are locked (3 hours before kick-off), so they can no longer be changed.",
  "not-going": "Only players who RSVP'd Going can be put on a team.",
  "score-not-open": "Scoring opens when teams lock, 3 hours before kick-off.",
  "score-playing": "You play in this match, so you can't score or reconcile it.",
  "score-not-scorer": "You are not the live scorer for this match.",
  "score-scorer-taken": "Someone else is already scoring this match.",
  "score-locked": "This gameweek is locked. Only organizers can change it.",
  "score-invalid-event": "That change isn't valid for this match.",
  "score-not-reconciled": "Every match must be reconciled before the gameweek can be locked.",
  "fine-invalid": "That fine isn't valid: the violation is no longer in use, or the match is from another gameweek.",
  "violation-exists": "A violation with that name already exists.",
  "season-exists": "A season with that name already exists.",
  "fantasy-squad-exists": "You already have a squad this season.",
  "fantasy-squad-invalid": "That squad or lineup isn't valid: pick 6 different players, 4 starters, 2 bench players and a starting captain.",
  "fantasy-over-budget": "That's over your budget.",
  "fantasy-lineup-locked": "This gameweek has locked, so the lineup can no longer change.",
  "fantasy-no-gameweek": "There is no upcoming gameweek yet.",
  "fantasy-transfer-used": "You've already used your transfer for this gameweek.",
  "fantasy-no-squad": "Pick your squad first.",
  "trait-exists": "A trait with that name already exists.",
} as const;

const NOTICES = {
  profile: "Profile saved.",
  traits: "Traits saved.",
  "trait-created": "Trait added.",
  rsvp: "RSVP saved.",
  "fine-issued": "Fine issued.",
  "fine-voided": "Fine voided.",
  "violation-saved": "Violation saved.",
  "violations-seeded": "Standard violations loaded.",
  scoring: "You are now the live scorer.",
  released: "Scoring released.",
  event: "Event updated.",
  reconciled: "Match reconciled.",
  "gameweek-locked": "Gameweek locked.",
  teams: "Teams updated.",
  attendance: "Attendance saved.",
  "season-created": "Season created.",
  "squad-created": "Squad created.",
  lineup: "Lineup saved.",
  transfer: "Transfer made.",
  "gameweek-created": "Gameweek added.",
} as const;

/** The error text for a URL code, or null if the code is unknown. */
export function errorMessage(code: string | undefined): string | null {
  return code && code in ERRORS ? ERRORS[code as keyof typeof ERRORS] : null;
}

/** The confirmation text for a URL code, or null if the code is unknown. */
export function noticeMessage(code: string | undefined): string | null {
  return code && code in NOTICES ? NOTICES[code as keyof typeof NOTICES] : null;
}
