/**
 * A shareable result card (PNG) for a match, for posting to the WhatsApp group.
 * Signed-in users only; the card shows the score and the goal involvements.
 */
import { ImageResponse } from "next/og";
import { z } from "zod";
import { getDb } from "@/db/client";
import { tallyScore } from "@/lib/match-events";
import { getCurrentUser } from "@/server/current-user";
import { NotFoundError } from "@/server/errors";
import { getMatchView } from "@/server/scoring";

/**
 * The card's colours. next/og renders without the stylesheet, so these mirror
 * --color-field and --color-field-ink in src/app/tokens.css; change them together.
 */
const CARD = { field: "#2a0a2e", ink: "#fbf6fb", signal: "#7cf5a2" } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });

  let view;
  try {
    view = await getMatchView(getDb(), id);
  } catch (error) {
    if (error instanceof NotFoundError) return new Response("Not found", { status: 404 });
    throw error;
  }
  const { teams, events, gameweek, match } = view;
  const score = tallyScore(events, teams.map((t) => t.id));
  const nameOf = new Map(teams.flatMap((t) => t.players.map((p) => [p.playerId, p.displayName] as const)));
  const live = events.filter((e) => !e.voided);
  const lines = live
    .filter((e) => e.type === "GOAL")
    .map((goal) => {
      const assist = live.find((e) => e.type === "ASSIST" && e.relatedClientId === goal.clientId);
      return `• ${nameOf.get(goal.playerId) ?? "?"}${assist ? ` (${nameOf.get(assist.playerId) ?? "?"})` : ""}`;
    })
    .slice(0, 8);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", background: CARD.field, color: CARD.ink, fontSize: 40 }}>
        <div style={{ fontSize: 30, opacity: 0.8 }}>{`Gameweek ${gameweek.number} · Match ${match.number}`}</div>
        <div style={{ display: "flex", alignItems: "center", marginTop: 24, fontSize: 64, fontWeight: 700, color: CARD.signal }}>
          {`${teams[0]?.name} ${score[teams[0]?.id ?? ""] ?? 0} - ${score[teams[1]?.id ?? ""] ?? 0} ${teams[1]?.name}`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 32, fontSize: 32 }}>
          {lines.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      </div>
    ),
    { width: 1080, height: 1080 },
  );
}
