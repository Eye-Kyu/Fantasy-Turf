import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { areTeamsLocked } from "@/lib/gameweek";
import { requireUser } from "@/server/current-user";
import { NotFoundError } from "@/server/errors";
import { getMatchView } from "@/server/scoring";
import { ScoringApp } from "./scoring-app";

export default async function ScorePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  let view;
  try {
    view = await getMatchView(getDb(), id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const { match, gameweek, teams, events, userIdsPlaying } = view;

  const allowed =
    areTeamsLocked(gameweek.kickoffAt, new Date()) &&
    !userIdsPlaying.has(user.userId) &&
    (can(user.role, "reconcileMatches") || (match.liveScorerId === user.userId && !gameweek.lockedAt));

  if (!allowed) {
    return (
      <main>
        <h1>Live scoring</h1>
        <p className="muted">You can't score this match right now.</p>
        <Link href={`/matches/${id}`}>Back to the match</Link>
      </main>
    );
  }

  return <ScoringApp matchId={id} matchNumber={match.number} teams={teams} initialEvents={events} />;
}
