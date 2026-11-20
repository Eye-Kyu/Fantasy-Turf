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
  "season-exists": "A season with that name already exists.",
  "trait-exists": "A trait with that name already exists.",
} as const;

const NOTICES = {
  profile: "Profile saved.",
  traits: "Traits saved.",
  "trait-created": "Trait added.",
  rsvp: "RSVP saved.",
  teams: "Teams updated.",
  attendance: "Attendance saved.",
  "season-created": "Season created.",
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
