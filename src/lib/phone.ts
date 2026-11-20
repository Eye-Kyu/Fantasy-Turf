/**
 * Phone numbers are stored in international format (+254712345678) so the same number
 * typed as 0712 345 678, 712345678 or +254 712 345 678 is one login. Kenyan formats are
 * the default; other countries are accepted only with a leading "+".
 */

/** Returns the number in +E.164 form, or null if it is not a plausible phone number. */
export function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(cleaned)) return null;

  if (cleaned.startsWith("+")) {
    return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : null;
  }
  // Kenyan mobile numbers: 9 digits starting 7 or 1, written with 0, 254 or nothing.
  const national = cleaned.replace(/^(?:254|0)/, "");
  return /^[17]\d{8}$/.test(national) ? `+254${national}` : null;
}
