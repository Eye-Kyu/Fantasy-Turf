/** Serves a player's profile picture to signed-in users. The URL carries `?v=` so browsers can cache it. */
import { z } from "zod";
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/current-user";
import { getPicture } from "@/server/pictures";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  const picture = await getPicture(getDb(), id);
  if (!picture) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(picture.data), {
    headers: {
      "Content-Type": picture.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
