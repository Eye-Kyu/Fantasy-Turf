/**
 * Password hashing with scrypt from Node's standard library (no extra dependency).
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>`. The cost parameters are
 * stored with each hash, so they can be raised later without invalidating old hashes.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Tunable cost parameters for NEW hashes (N is a power of two).
const COST = { N: 32768, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** scrypt needs about 128 * N * r bytes; allow double that as headroom. */
const maxMemory = (N: number, r: number) => 256 * N * r;

function deriveKey(
  password: string,
  salt: Buffer,
  { N, r, p }: { N: number; r: number; p: number },
): Promise<Buffer> {
  const options: ScryptOptions = { N, r, p, maxmem: maxMemory(N, r) };
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Hashes a password with a fresh random salt. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, COST);
  return ["scrypt", COST.N, COST.r, COST.p, salt.toString("base64"), key.toString("base64")].join("$");
}

/**
 * Checks a password against a stored hash in constant time.
 * Returns false (never throws) for a malformed stored hash.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !n || !r || !p || !salt || !hash) return false;

  const expected = Buffer.from(hash, "base64");
  const actual = await deriveKey(password, Buffer.from(salt, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
