import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { getPicture, removeOwnPicture, setOwnPicture } from "./pictures";
import { makeUser, withRollback } from "./test-utils";

const png = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: "#3a7" } }).png().toBuffer();

describe("profile pictures", () => {
  it("stores a resized WebP and replaces it on a second upload", () =>
    withRollback(async (db) => {
      const user = await makeUser(db, "Pic", "MANAGER");
      await setOwnPicture(db, user.actor, user.playerId, await png(800, 400));
      const stored = (await getPicture(db, user.playerId))!;
      expect(stored.contentType).toBe("image/webp");
      const meta = await sharp(stored.data).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([256, 256, "webp"]);

      await setOwnPicture(db, user.actor, user.playerId, await png(300, 300));
      expect((await getPicture(db, user.playerId))!.updatedAt.getTime()).toBeGreaterThanOrEqual(stored.updatedAt.getTime());
      await removeOwnPicture(db, user.actor, user.playerId);
      expect(await getPicture(db, user.playerId)).toBeNull();
    }));

  it("rejects non-images, huge files and other people's profiles", () =>
    withRollback(async (db) => {
      const user = await makeUser(db, "Pic", "MANAGER");
      const other = await makeUser(db, "Other", "MANAGER");
      await expect(setOwnPicture(db, user.actor, user.playerId, Buffer.from("<script>alert(1)</script>"))).rejects.toMatchObject({ code: "invalid" });
      await expect(setOwnPicture(db, user.actor, user.playerId, Buffer.alloc(3 * 1024 * 1024))).rejects.toMatchObject({ code: "too-large" });
      await expect(setOwnPicture(db, user.actor, other.playerId, await png(10, 10))).rejects.toMatchObject({ code: "not-yours" });
      await expect(removeOwnPicture(db, user.actor, other.playerId)).rejects.toMatchObject({ code: "not-yours" });
    }));
});
