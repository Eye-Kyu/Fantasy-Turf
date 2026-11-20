import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { areRsvpsOpen, teamsLockAt } from "@/lib/gameweek";
import { formatKickoff } from "@/lib/time";
import { getGameweek, getOwnRsvp, listAttendance } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { Notices } from "../../components";
import { attendanceAction, rsvpAction } from "../actions";

const RSVP_LABEL = { GOING: "Going", NOT_GOING: "Not going", NO_RESPONSE: "No response" } as const;

export default async function GameweekPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { error, saved } = await searchParams;

  const db = getDb();
  const gameweek = await getGameweek(db, id);
  if (!gameweek) notFound();

  const now = new Date();
  const open = areRsvpsOpen(gameweek.kickoffAt, now);
  const mine = await getOwnRsvp(db, user.userId, id);
  const attendance = await listAttendance(db, id);
  const isOrganizer = can(user.role, "confirmAttendance");
  const going = attendance.filter((p) => p.rsvp === "GOING").length;

  return (
    <main>
      <h1>Gameweek {gameweek.number} · {gameweek.seasonName}</h1>
      <p className="muted">
        Kick-off {formatKickoff(gameweek.kickoffAt)}. {open ? `RSVPs close ${formatKickoff(teamsLockAt(gameweek.kickoffAt))}.` : "RSVPs are closed."}
      </p>
      <Notices error={error} saved={saved} />

      {user.playerId && (
        <section className="card">
          <h2>Are you playing?</h2>
          <p className="muted">Your answer: {RSVP_LABEL[mine]}</p>
          {open ? (
            <div className="row-actions">
              {(["GOING", "NOT_GOING"] as const).map((status) => (
                <form key={status} action={rsvpAction}>
                  <input type="hidden" name="gameweekId" value={id} />
                  <input type="hidden" name="status" value={status} />
                  <button type="submit" className={mine === status ? "" : "ghost"}>{RSVP_LABEL[status]}</button>
                </form>
              ))}
            </div>
          ) : (
            <p className="muted">Need to change it? Ask an organizer.</p>
          )}
        </section>
      )}

      <section className="card">
        <h2>Players · {going} going</h2>
        <ul className="plain">
          {attendance.map((player) => (
            <li key={player.playerId}>
              <span>
                {player.displayName} <span className="muted">· {RSVP_LABEL[player.rsvp]}{player.attended ? " · attended" : ""}</span>
              </span>
              {isOrganizer && (
                <span className="row-actions">
                  {(["GOING", "NOT_GOING"] as const).map((status) => (
                    <form key={status} action={rsvpAction}>
                      <input type="hidden" name="gameweekId" value={id} />
                      <input type="hidden" name="playerId" value={player.playerId} />
                      <input type="hidden" name="status" value={status} />
                      <button type="submit" className={`small ${player.rsvp === status ? "" : "ghost"}`}>{RSVP_LABEL[status]}</button>
                    </form>
                  ))}
                  <form action={attendanceAction}>
                    <input type="hidden" name="gameweekId" value={id} />
                    <input type="hidden" name="playerId" value={player.playerId} />
                    <input type="hidden" name="attended" value={String(!player.attended)} />
                    <button type="submit" className={`small ${player.attended ? "" : "ghost"}`}>
                      {player.attended ? "Here ✓" : "Mark here"}
                    </button>
                  </form>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
