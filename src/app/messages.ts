/**
 * Notices shown after a form action. Actions redirect with a short code in the URL
 * (`?error=...` / `?saved=...`); only codes listed here are ever displayed, so the URL
 * can never inject text into the page.
 */
const ERRORS = {
  invalid: "Please check the form and try again.",
  credentials: "That email and password don't match.",
  "email-taken": "An account with that email already exists.",
  forbidden: "You aren't allowed to do that.",
  "trait-exists": "A trait with that name already exists.",
} as const;

const NOTICES = {
  profile: "Profile saved.",
  traits: "Traits saved.",
  "trait-created": "Trait added.",
} as const;

/** The error text for a URL code, or null if the code is unknown. */
export function errorMessage(code: string | undefined): string | null {
  return code && code in ERRORS ? ERRORS[code as keyof typeof ERRORS] : null;
}

/** The confirmation text for a URL code, or null if the code is unknown. */
export function noticeMessage(code: string | undefined): string | null {
  return code && code in NOTICES ? NOTICES[code as keyof typeof NOTICES] : null;
}
