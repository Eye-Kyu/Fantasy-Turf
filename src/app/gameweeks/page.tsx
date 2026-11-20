import Link from "next/link";
import { getDb } from "@/db/client";
import { formatKickoff } from "@/lib/time";
import { listGameweeks, listSeasons } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { Notices } from "../components";

export default async function GameweeksPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser();
  const { error } = await searchParams;
  const db = getDb();
  const [season] = await listSeasons(db);
  const weeks = season ? await listGameweeks(db, season.id) : [];
  const now = new Date();
  // The first gameweek still to kick off is the one people are looking for.
  const nextId = weeks.filter((w) => w.kickoffAt >= now).sort((a, b) => +a.kickoffAt - +b.kickoffAt)[0]?.id;

  return (
    <main>
      <header className="page-head">
        <h1>Games</h1>
        {season && <p>{season.name}</p>}
      </header>
      <Notices error={error} />
      {weeks.length === 0 ? (
        <div className="empty"><p>No gameweeks scheduled yet.</p></div>
      ) : (
        <ul className="tickets">
          {weeks.map((week) => (
            <li key={week.id}>
              <Link href={`/gameweeks/${week.id}`} className={`ticket${week.id === nextId ? " ticket-next" : ""}${week.kickoffAt < now ? " ticket-played" : ""}`}>
                <span className="ticket-stub">
                  <span className="ticket-label">GW</span>
                  <span className="ticket-number">{week.number}</span>
                </span>
                <span className="ticket-body">
                  <span className="row-title">Gameweek {week.number}</span>
                  <span className="meta">{formatKickoff(week.kickoffAt)}</span>
                </span>
                {week.kickoffAt < now ? (
                  <span className="status done">Played</span>
                ) : (
                  <span className={`status${week.id === nextId ? " live" : ""}`}>{week.id === nextId ? "Next up" : "Upcoming"}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
