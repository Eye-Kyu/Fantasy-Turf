import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { areTeamsLocked, teamsLockAt } from "@/lib/gameweek";
import { teamsAnnouncementText, whatsappShareUrl } from "@/lib/share";
import { formatKickoff } from "@/lib/time";
import { getGameweek } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { getGameweekTeams } from "@/server/teams";
import { GameweekNav, Notices } from "../../../components";
import { CopyButton } from "./copy-button";
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

  const announcement = teamsAnnouncementText({
    gameweekNumber: gameweek.number,
    kickoff: formatKickoff(gameweek.kickoffAt),
    matches: matches.map((m) => ({ number: m.number, teams: m.teams.map((t) => ({ name: t.name, players: t.players.map((p) => p.displayName) })) })),
  });
  const anyoneSorted = matches.some((m) => m.teams.some((t) => t.players.length > 0));

  return (
    <main>
      <header className="page-head">
        <Link href={`/gameweeks/${id}`} className="crumb">Gameweek {gameweek.number}</Link>
        <h1>Teams</h1>
        <p>
          Kick-off {formatKickoff(gameweek.kickoffAt)}.{" "}
          {locked ? "Teams are locked." : `Teams lock ${formatKickoff(teamsLockAt(gameweek.kickoffAt))}.`}
        </p>
      </header>
      <GameweekNav gameweekId={id} current="/teams" />
      <Notices error={error} saved={saved} />

      {matches.length === 0 && <div className="empty"><p>No matches set up yet.</p></div>}

      {matches.map((match) => (
        <section key={match.id} className="card">
          <div className="section-head">
            <h2>Match {match.number}</h2>
            <Link href={`/matches/${match.id}`} className="button small ghost">Score &amp; events</Link>
          </div>
          <div className="teams">
            {match.teams.map((team) => (
              <div key={team.id} className="team-col">
                <h3>{team.name} <span className="meta">{team.players.length} players</span></h3>
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
                                label={`Move to ${other.name}`}
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

          <h3>Going, not on a team yet <span className="meta">{match.unassigned.length}</span></h3>
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
                        label={`Add to ${team.name}`}
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

      {can(user.role, "sortTeams") && anyoneSorted && (
        <section className="card">
          <h2>Tell the group</h2>
          <p className="muted">Copy this and paste it into the WhatsApp group, or open WhatsApp with it filled in.</p>
          <textarea readOnly rows={Math.min(14, announcement.split("\n").length + 1)} value={announcement} aria-label="Teams message" />
          <div className="row-actions">
            <CopyButton text={announcement} />
            <a href={whatsappShareUrl(announcement)} target="_blank" rel="noopener noreferrer">Open in WhatsApp</a>
          </div>
        </section>
      )}

      {canEdit && (
        <ActionButton action={addMatchAction} fields={{ gameweekId: id }} label="Add match" ghost={false} />
      )}
    </main>
  );
}
