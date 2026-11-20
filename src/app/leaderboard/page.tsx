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
      <header className="page-head">
        <h1>Leaderboard</h1>
        {season && <p>{season.name}</p>}
        <p>Real match points for every player. Fantasy squad standings come later.</p>
      </header>
      {rows.length === 0 ? <div className="empty"><p>No points yet.</p></div> : <PointsTable rows={rows} />}
    </main>
  );
}
