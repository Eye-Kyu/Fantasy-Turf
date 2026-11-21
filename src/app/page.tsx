import Link from "next/link";
import { getDb } from "@/db/client";
import { teamsLockAt } from "@/lib/gameweek";
import { formatKickoff } from "@/lib/time";
import { getNextGameweek, listSeasons } from "@/server/calendar";
import { getCurrentUser } from "@/server/current-user";
import { getSeasonTotals } from "@/server/points";
import { Shirt } from "./components";

/** The programme cover's pitch: the 1-2-1 diamond a four-a-side squad lines up in. */
function CoverPitch() {
  return (
    <div className="cover-pitch" aria-hidden="true">
      <span className="pitch-lines" />
      <div className="pitch-row"><Shirt /></div>
      <div className="pitch-row"><Shirt /><Shirt /></div>
      <div className="pitch-row"><Shirt /></div>
    </div>
  );
}

export default async function HomePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <main className="home">
        <section className="cover">
          <div className="cover-copy">
            <h1>Turf Gong</h1>
            <p>Weekly street football in Nairobi, with fantasy squads on top.</p>
            <div className="band-actions">
              <Link href="/register" className="button">Join the league</Link>
              <Link href="/login" className="button ghost">Sign in</Link>
            </div>
          </div>
          <CoverPitch />
        </section>
      </main>
    );
  }

  const db = getDb();
  const [season] = await listSeasons(db);
  const next = await getNextGameweek(db);
  const table = season ? (await getSeasonTotals(db, season.id)).slice(0, 5) : [];

  return (
    <main className="home">
      <section className="cover">
        <div className="cover-copy">
          {season && <p className="cover-issue">{season.name}</p>}
          <h1>Turf Gong</h1>
          <p>Weekly street football in Nairobi, with fantasy squads on top.</p>
          <div className="band-actions">
            <Link href="/fantasy" className="button">Pick your team</Link>
            {user.playerId && <Link href={`/players/${user.playerId}`} className="button ghost">Go to your profile</Link>}
          </div>
        </div>
        {next ? (
          <Link href={`/gameweeks/${next.id}`} className="ticket ticket-cover">
            <span className="ticket-stub">
              <span className="ticket-label">Gameweek</span>
              <span className="ticket-number">{next.number}</span>
            </span>
            <span className="ticket-body">
              <span className="ticket-label">Next kickoff</span>
              <strong>{formatKickoff(next.kickoffAt)}</strong>
              <span className="ticket-label">Teams lock</span>
              <span>{formatKickoff(teamsLockAt(next.kickoffAt))}</span>
            </span>
          </Link>
        ) : (
          <CoverPitch />
        )}
      </section>

      <section className="section" aria-labelledby="table-head">
        <div className="section-head">
          <h2 id="table-head">Top of the table</h2>
          <Link href="/leaderboard">Full leaderboard</Link>
        </div>
        {table.length === 0 ? (
          <div className="empty"><p>No points yet.</p></div>
        ) : (
          <ol className="podium">
            {table.map((row, i) => (
              <li key={row.playerId} className={row.playerId === user.playerId ? "me" : undefined}>
                <span className="podium-rank">{i + 1}</span>
                <a href={`/players/${row.playerId}`} className="podium-name">{row.displayName}</a>
                <span className="podium-pts"><strong>{row.total}</strong> pts</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
