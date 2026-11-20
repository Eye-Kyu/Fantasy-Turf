import { getDb } from "@/db/client";
import { listSeasons } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { getSeasonTotals } from "@/server/points";
import { PointsTable } from "../components";

export default async function LeaderboardPage() {
  await requireUser();
  const db = getDb();
  const [season] = await listSeasons(db);
  const rows = season ? await getSeasonTotals(db, season.id) : [];

  return (
    <main>
      <h1>Leaderboard{season ? ` · ${season.name}` : ""}</h1>
      <p className="muted">Real match points for every player. Fantasy squad standings come later.</p>
      {rows.length === 0 ? <p className="muted">No points yet.</p> : <PointsTable rows={rows} />}
    </main>
  );
}
