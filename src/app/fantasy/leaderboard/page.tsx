import { getDb } from "@/db/client";
import { requireUser } from "@/server/current-user";
import { getCurrentSeason } from "@/server/fantasy";
import { getFantasyLeaderboard } from "@/server/fantasy-points";

export default async function FantasyLeaderboardPage() {
  const user = await requireUser();
  const db = getDb();
  const season = await getCurrentSeason(db);
  const rows = season ? await getFantasyLeaderboard(db, season.id) : [];

  return (
    <main>
      <h1>Fantasy leaderboard{season ? ` · ${season.name}` : ""}</h1>
      <p className="muted">Counts locked gameweeks only.</p>
      {rows.length === 0 ? (
        <p className="muted">No squads have scored yet.</p>
      ) : (
        <table>
          <thead><tr><th>#</th><th>Manager</th><th>Last gameweek</th><th>Total</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.squadId} className={r.userId === user.userId ? "me" : undefined}>
                <td>{i + 1}</td><td>{r.manager}</td><td>{r.lastGameweek ?? "–"}</td><td>{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
