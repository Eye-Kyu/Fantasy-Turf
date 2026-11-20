import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getGameweek } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { getGameweekPoints } from "@/server/points";
import { GameweekNav, PointsTable } from "../../../components";

export default async function GameweekPointsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const db = getDb();
  const gameweek = await getGameweek(db, id);
  if (!gameweek) notFound();
  const { final, rows } = await getGameweekPoints(db, id);

  return (
    <main>
      <header className="page-head">
        <Link href={`/gameweeks/${id}`} className="crumb">Gameweek {gameweek.number}</Link>
        <h1>Points</h1>
        <p>{final ? "Final" : "Provisional: can still change until the gameweek is locked"}</p>
      </header>
      <GameweekNav gameweekId={id} current="/points" />
      {rows.length === 0 ? <div className="empty"><p>No points yet.</p></div> : <PointsTable rows={rows} />}
      <p className="muted">Goal 2, assist 1, +1 to everyone on a team that led by 2 at any point. Fines are deducted.</p>
    </main>
  );
}
