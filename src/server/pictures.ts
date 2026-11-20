/**
 * Profile pictures, stored in the database. Every upload is decoded, rotated by its
 * EXIF orientation, cropped to a square, shrunk and re-encoded as WebP, which both keeps
 * rows small (a few KB) and strips metadata (such as GPS) and anything that is not
 * really an image.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import type { DbExecutor } from "@/db/client";
import { playerPictures, players } from "@/db/schema";
import type { Actor } from "./actor";
import { PictureError } from "./errors";

export const MAX_PICTURE_UPLOAD_BYTES = 2 * 1024 * 1024;
const PICTURE_SIZE = 256;

/** Saves a picture for the actor's own player profile. */
export async function setOwnPicture(db: DbExecutor, actor: Actor, playerId: string, upload: Buffer, now = new Date()): Promise<void> {
  const [player] = await db.select({ userId: players.userId }).from(players).where(eq(players.id, playerId));
  if (!player || player.userId !== actor.userId) throw new PictureError("not-yours");
  if (upload.length > MAX_PICTURE_UPLOAD_BYTES) throw new PictureError("too-large");

  let data: Buffer;
  try {
    data = await sharp(upload, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(PICTURE_SIZE, PICTURE_SIZE, { fit: "cover" })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    throw new PictureError("invalid");
  }
  await db
    .insert(playerPictures)
    .values({ playerId, contentType: "image/webp", data, updatedAt: now })
    .onConflictDoUpdate({ target: playerPictures.playerId, set: { contentType: "image/webp", data, updatedAt: now } });
}

export async function removeOwnPicture(db: DbExecutor, actor: Actor, playerId: string): Promise<void> {
  const [player] = await db.select({ userId: players.userId }).from(players).where(eq(players.id, playerId));
  if (!player || player.userId !== actor.userId) throw new PictureError("not-yours");
  await db.delete(playerPictures).where(eq(playerPictures.playerId, playerId));
}

export async function getPicture(db: DbExecutor, playerId: string) {
  const [row] = await db.select().from(playerPictures).where(eq(playerPictures.playerId, playerId));
  return row ?? null;
}

/** When a player's picture last changed, or null if they have none (used to bust caches). */
export async function getPictureVersion(db: DbExecutor, playerId: string): Promise<number | null> {
  const [row] = await db.select({ updatedAt: playerPictures.updatedAt }).from(playerPictures).where(eq(playerPictures.playerId, playerId));
  return row ? row.updatedAt.getTime() : null;
}
