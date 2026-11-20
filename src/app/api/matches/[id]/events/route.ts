/**
 * Receives a phone's queued scoring operations. A route handler (not a server action)
 * because the offline queue sends JSON from a background sync, and the response carries
 * the match's current events so the phone can refresh what it shows.
 */
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { scoringOpsSchema } from "@/lib/schemas";
import { getCurrentUser, toActor } from "@/server/current-user";
import { NotFoundError } from "@/server/errors";
import { applyScoringOps, getMatchView } from "@/server/scoring";
import { z } from "zod";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // The session cookie is SameSite=Lax, which already stops cross-site POSTs; this also
  // rejects a request whose Origin is a different site.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await params;
  const body = scoringOpsSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  try {
    const db = getDb();
    const results = await applyScoringOps(db, toActor(user), id, body.data.ops);
    const { events } = await getMatchView(db, id);
    return NextResponse.json({ results, events });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: "not-found" }, { status: 404 });
    throw error;
  }
}
