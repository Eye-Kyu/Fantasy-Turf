import Link from "next/link";
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
      <header className="page-head">
        <Link href="/fantasy" className="crumb">My squad</Link>
        <h1>Fantasy leaderboard</h1>
        {season && <p>{season.name}</p>}
        <p>Counts locked gameweeks only.</p>
      </header>
      {rows.length === 0 ? (
        <div className="empty"><p>No squads have scored yet.</p></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Manager</th><th>Last gameweek</th><th>Total</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.squadId} className={r.userId === user.userId ? "me" : undefined}>
                  <td className="rank">{i + 1}</td><td className="wrap"><strong>{r.manager}</strong></td><td>{r.lastGameweek ?? "–"}</td><td className="total">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
