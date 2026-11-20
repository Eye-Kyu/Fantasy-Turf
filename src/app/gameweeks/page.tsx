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

  return (
    <main>
      <h1>Games{season ? ` · ${season.name}` : ""}</h1>
      <Notices error={error} />
      {weeks.length === 0 ? (
        <p className="muted">No gameweeks scheduled yet.</p>
      ) : (
        <ul className="plain card">
          {weeks.map((week) => (
            <li key={week.id}>
              <Link href={`/gameweeks/${week.id}`}>Gameweek {week.number}</Link>
              <span className="muted">
                {formatKickoff(week.kickoffAt)}
                {week.kickoffAt < now ? " · played" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
