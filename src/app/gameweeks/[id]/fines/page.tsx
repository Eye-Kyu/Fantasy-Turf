import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { MAX_FINE_POINTS } from "@/lib/constants";
import { formatKickoff } from "@/lib/time";
import { getGameweek, listAttendance } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { listGameweekFines, listViolations } from "@/server/fines";
import { getGameweekTeams } from "@/server/teams";
import { FineList, GameweekNav, Notices } from "../../../components";
import { issueFineAction, voidFineAction } from "./actions";

export default async function GameweekFinesPage({
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

  const canIssue = can(user.role, "issueFines");
  const fines = await listGameweekFines(db, id);
  // Only organizers need the form's lists, so only they pay for loading them.
  const [violations, roster, matches] = canIssue
    ? await Promise.all([listViolations(db, { activeOnly: true }), listAttendance(db, id), getGameweekTeams(db, id)])
    : [[], [], []];

  return (
    <main>
      <header className="page-head">
        <Link href={`/gameweeks/${id}`} className="crumb">Gameweek {gameweek.number}</Link>
        <h1>Fines</h1>
        <p>{formatKickoff(gameweek.kickoffAt)}</p>
      </header>
      <GameweekNav gameweekId={id} current="/fines" />
      <Notices error={error} saved={saved} />

      <div className={canIssue ? "split" : "stack"}>
      <FineList fines={fines} voidAction={canIssue ? voidFineAction : undefined} />
      {canIssue && (
        <form action={issueFineAction} className="card">
          <h2>Issue a fine</h2>
          <input type="hidden" name="gameweekId" value={id} />
          <label>Player
            <select name="playerId" required defaultValue="">
              <option value="" disabled>Choose a player</option>
              {roster.map((p) => <option key={p.playerId} value={p.playerId}>{p.displayName}</option>)}
            </select>
          </label>
          <label>Violation
            <select name="violationTypeId" required defaultValue="">
              <option value="" disabled>Choose a violation</option>
              {violations.map((v) => <option key={v.id} value={v.id}>{v.name} (−{v.defaultPoints})</option>)}
            </select>
          </label>
          <label>Points (leave empty for the usual amount)
            <input type="number" name="points" min={1} max={MAX_FINE_POINTS} />
          </label>
          <label>Match (optional)
            <select name="matchId" defaultValue="">
              <option value="">Not specific to a match</option>
              {matches.map((m) => <option key={m.id} value={m.id}>Match {m.number}</option>)}
            </select>
          </label>
          <label>Note (optional)<input type="text" name="note" maxLength={200} /></label>
          <button type="submit">Issue fine</button>
          {violations.length === 0 && <p className="muted">The violation list is empty. Load it under Violations.</p>}
        </form>
      )}
      </div>
    </main>
  );
}
