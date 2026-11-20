import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { formatKickoff } from "@/lib/time";
import { listGameweeks, listSeasons } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { Notices } from "../../components";
import { createGameweekAction, createSeasonAction } from "./actions";

export default async function CalendarAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "manageCalendar")) notFound();
  const { error, saved } = await searchParams;

  const db = getDb();
  const seasons = await listSeasons(db);
  const current = seasons[0];
  const weeks = current ? await listGameweeks(db, current.id) : [];

  return (
    <main>
      <h1>Calendar</h1>
      <Notices error={error} saved={saved} />

      <form action={createSeasonAction} className="card stack">
        <h2>New season</h2>
        <label>Name<input type="text" name="name" placeholder="Season 1" minLength={2} maxLength={40} required /></label>
        <label>Starts on<input type="date" name="startsOn" required /></label>
        <button type="submit">Create season</button>
      </form>

      {current && (
        <form action={createGameweekAction} className="card stack">
          <h2>Add gameweek to {current.name}</h2>
          <input type="hidden" name="seasonId" value={current.id} />
          <label>Kick-off (Nairobi time)<input type="datetime-local" name="kickoffAt" required /></label>
          <p className="muted">Teams lock and RSVPs close 3 hours before kick-off.</p>
          <button type="submit">Add gameweek {weeks.length + 1}</button>
        </form>
      )}

      {weeks.length > 0 && (
        <ul className="plain card">
          {weeks.map((week) => (
            <li key={week.id}>Gameweek {week.number}<span className="muted">{formatKickoff(week.kickoffAt)}</span></li>
          ))}
        </ul>
      )}
    </main>
  );
}
