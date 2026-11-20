import Link from "next/link";
import { getDb } from "@/db/client";
import { FANTASY_BUDGET, SQUAD } from "@/lib/constants";
import { teamsLockAt } from "@/lib/gameweek";
import { formatKickoff } from "@/lib/time";
import { requireUser } from "@/server/current-user";
import { getCurrentSeason, getLineupForDisplay, getOpenGameweek, getSquad, hasTransferFor, listMarket } from "@/server/fantasy";
import { getSquadScores } from "@/server/fantasy-points";
import { Notices } from "../components";
import { createSquadAction, setLineupAction, transferAction } from "./actions";

const money = (value: number) => `${value.toFixed(1)}M`;

export default async function FantasyPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { error, saved } = await searchParams;
  const db = getDb();
  const season = await getCurrentSeason(db);
  if (!season) {
    return <main><h1>Fantasy</h1><p className="muted">There is no season yet.</p></main>;
  }

  const squad = await getSquad(db, user.userId, season.id);
  const market = await listMarket(db);

  if (!squad) {
    return (
      <main>
        <h1>Pick your squad</h1>
        <p className="muted">
          Choose {SQUAD.STARTERS + SQUAD.BENCH} players ({SQUAD.STARTERS} start, {SQUAD.BENCH} on the bench) within a budget of {money(FANTASY_BUDGET)}.
        </p>
        <Notices error={error} saved={saved} />
        <form action={createSquadAction} className="card stack">
          <input type="hidden" name="seasonId" value={season.id} />
          <ul className="plain">
            {market.map((p) => (
              <li key={p.id}>
                <label><input type="checkbox" name="playerIds" value={p.id} /> {p.displayName} · {money(p.price)} · rating {p.rating}</label>
              </li>
            ))}
          </ul>
          <button type="submit">Create squad</button>
        </form>
      </main>
    );
  }

  const open = await getOpenGameweek(db, season.id);
  const lineup = open ? await getLineupForDisplay(db, squad, open.id) : [];
  const slotOf = (id: string) => {
    const entry = lineup.find((e) => e.playerId === id);
    return entry ? (entry.slot === "STARTER" ? "starter" : `bench${entry.benchOrder}`) : "starter";
  };
  const captainId = lineup.find((e) => e.isCaptain)?.playerId ?? squad.players[0]?.id;
  const transferUsed = open ? await hasTransferFor(db, squad.id, open.id) : false;
  const value = squad.players.reduce((sum, p) => sum + p.price, 0);
  const scores = await getSquadScores(db, squad.id);
  const latest = scores.filter((s) => s.final).at(-1);
  const buyable = market.filter((m) => !squad.players.some((p) => p.id === m.id));

  return (
    <main>
      <h1>My squad</h1>
      <p className="muted">
        Squad value {money(value)} · bank {money(squad.bank)} · <Link href="/fantasy/leaderboard">Fantasy leaderboard</Link>
      </p>
      <Notices error={error} saved={saved} />

      {open ? (
        <>
          <p>Next lock: {formatKickoff(teamsLockAt(open.kickoffAt))} (gameweek {open.number}). Lineups and transfers close then.</p>
          <form action={setLineupAction} className="card stack">
            <h2>Lineup</h2>
            <input type="hidden" name="gameweekId" value={open.id} />
            <table>
              <thead><tr><th>Player</th><th>Price</th><th>Slot</th><th>Captain</th></tr></thead>
              <tbody>
                {squad.players.map((p) => (
                  <tr key={p.id}>
                    <td>{p.displayName}</td>
                    <td>{money(p.price)}</td>
                    <td>
                      <select name={`slot_${p.id}`} defaultValue={slotOf(p.id)} aria-label={`Slot for ${p.displayName}`}>
                        <option value="starter">Starts</option>
                        <option value="bench1">Sub 1</option>
                        <option value="bench2">Sub 2</option>
                      </select>
                    </td>
                    <td><input type="radio" name="captainId" value={p.id} defaultChecked={p.id === captainId} aria-label={`Captain ${p.displayName}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button type="submit">Save lineup</button>
          </form>

          <form action={transferAction} className="card stack">
            <h2>Transfer</h2>
            {transferUsed ? (
              <p className="muted">You've used this gameweek's transfer.</p>
            ) : (
              <>
                <input type="hidden" name="seasonId" value={season.id} />
                <label>Sell
                  <select name="playerOutId" required>
                    {squad.players.map((p) => <option key={p.id} value={p.id}>{p.displayName} ({money(p.price)})</option>)}
                  </select>
                </label>
                <label>Buy
                  <select name="playerInId" required>
                    {buyable.map((p) => <option key={p.id} value={p.id}>{p.displayName} ({money(p.price)})</option>)}
                  </select>
                </label>
                <button type="submit">Make transfer</button>
              </>
            )}
          </form>
        </>
      ) : (
        <p className="muted">No upcoming gameweek is open for changes.</p>
      )}

      {latest && (
        <section className="card">
          <h2>{latest.gameweekName}: {latest.total} points</h2>
          <ul className="plain">
            {latest.players.map((p) => (
              <li key={p.playerId}>
                {p.displayName}{p.captain ? " (C)" : ""} · {p.role === "substitute" ? "came on · " : p.role === "unused" ? "bench · " : ""}{p.points}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
