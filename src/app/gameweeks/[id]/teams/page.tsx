import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { areTeamsLocked, teamsLockAt } from "@/lib/gameweek";
import { formatKickoff } from "@/lib/time";
import { getGameweek } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { getGameweekTeams } from "@/server/teams";
import { Notices } from "../../../components";
import { addMatchAction, assignPlayerAction, deleteMatchAction, unassignPlayerAction } from "./actions";

/** A one-button form posting hidden fields to a server action. */
function ActionButton({
  action,
  fields,
  label,
  ghost = true,
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  ghost?: boolean;
}) {
  return (
    <form action={action}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={`small ${ghost ? "ghost" : ""}`}>{label}</button>
    </form>
  );
}

export default async function TeamsPage({
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
  const matches = await getGameweekTeams(db, id);

  const locked = areTeamsLocked(gameweek.kickoffAt, new Date());
  // Editing controls only for people who may sort, and only while teams are open.
  const canEdit = can(user.role, "sortTeams") && !locked;

  return (
    <main>
      <h1>Teams · Gameweek {gameweek.number}</h1>
      <p className="muted">
        <Link href={`/gameweeks/${id}`}>← Gameweek {gameweek.number}</Link> · Kick-off {formatKickoff(gameweek.kickoffAt)}.{" "}
        {locked ? "Teams are locked." : `Teams lock ${formatKickoff(teamsLockAt(gameweek.kickoffAt))}.`}
      </p>
      <Notices error={error} saved={saved} />

      {matches.length === 0 && <p className="muted">No matches set up yet.</p>}

      {matches.map((match) => (
        <section key={match.id} className="card">
          <h2>Match {match.number}</h2>
          <div className="teams">
            {match.teams.map((team) => (
              <div key={team.id}>
                <h3>{team.name} <span className="muted">({team.players.length})</span></h3>
                <ul className="plain">
                  {team.players.length === 0 && <li className="muted">No players yet</li>}
                  {team.players.map((player) => (
                    <li key={player.playerId}>
                      <span>{player.displayName}</span>
                      {canEdit && (
                        <span className="row-actions">
                          {match.teams
                            .filter((other) => other.id !== team.id)
                            .map((other) => (
                              <ActionButton
                                key={other.id}
                                action={assignPlayerAction}
                                fields={{ gameweekId: id, teamId: other.id, playerId: player.playerId }}
                                label={`→ ${other.name}`}
                              />
                            ))}
                          <ActionButton
                            action={unassignPlayerAction}
                            fields={{ gameweekId: id, matchId: match.id, playerId: player.playerId }}
                            label="Remove"
                          />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <h3>Going, not on a team yet <span className="muted">({match.unassigned.length})</span></h3>
          <ul className="plain">
            {match.unassigned.length === 0 && <li className="muted">Everyone who is going has a team.</li>}
            {match.unassigned.map((player) => (
              <li key={player.playerId}>
                <span>{player.displayName}</span>
                {canEdit && (
                  <span className="row-actions">
                    {match.teams.map((team) => (
                      <ActionButton
                        key={team.id}
                        action={assignPlayerAction}
                        fields={{ gameweekId: id, teamId: team.id, playerId: player.playerId }}
                        label={`→ ${team.name}`}
                        ghost={false}
                      />
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {canEdit && (
            <div className="row-actions">
              <ActionButton action={deleteMatchAction} fields={{ gameweekId: id, matchId: match.id }} label="Delete match" />
            </div>
          )}
        </section>
      ))}

      {canEdit && (
        <ActionButton action={addMatchAction} fields={{ gameweekId: id }} label="Add match" ghost={false} />
      )}
    </main>
  );
}
