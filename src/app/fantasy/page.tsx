import Link from "next/link";
import { getDb } from "@/db/client";
import { FANTASY_BUDGET, SQUAD } from "@/lib/constants";
import { teamsLockAt } from "@/lib/gameweek";
import { formatKickoff } from "@/lib/time";
import { requireUser } from "@/server/current-user";
import { getCurrentSeason, getLineupForDisplay, getOpenGameweek, getSquad, hasTransferFor, listMarket } from "@/server/fantasy";
import { getSquadScores } from "@/server/fantasy-points";
import { Notices, Shirt } from "../components";
import { createSquadAction, setLineupAction, transferAction } from "./actions";

const money = (value: number) => `${value.toFixed(1)}M`;

/** Pitch rows for the starters: a 1-2-1 diamond for four, otherwise rows of up to three. */
function formation<T>(starters: T[]): T[][] {
  if (starters.length === 4) return [starters.slice(0, 1), starters.slice(1, 3), starters.slice(3)];
  const rows: T[][] = [];
  for (let i = 0; i < starters.length; i += 3) rows.push(starters.slice(i, i + 3));
  return rows;
}

export default async function FantasyPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { error, saved } = await searchParams;
  const db = getDb();
  const season = await getCurrentSeason(db);
  if (!season) {
    return (
      <main>
        <h1>Fantasy</h1>
        <div className="empty"><p>There is no season yet.</p></div>
      </main>
    );
  }

  const squad = await getSquad(db, user.userId, season.id);
  const market = await listMarket(db);

  if (!squad) {
    return (
      <main>
        <header className="page-head">
          <h1>Pick your squad</h1>
          <p>
            Choose {SQUAD.STARTERS + SQUAD.BENCH} players ({SQUAD.STARTERS} start, {SQUAD.BENCH} on the bench) within a budget of {money(FANTASY_BUDGET)}.
          </p>
        </header>
        <Notices error={error} saved={saved} />
        <form action={createSquadAction} className="stack">
          <input type="hidden" name="seasonId" value={season.id} />
          <ul className="market">
            {market.map((p) => (
              <li key={p.id}>
                <label>
                  <input type="checkbox" name="playerIds" value={p.id} />
                  <span className="row-main">
                    <span className="row-title">{p.displayName}</span>
                    <span className="meta">Rating {p.rating}</span>
                  </span>
                  <span className="row-figure">{money(p.price)}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="submit" className="sticky-submit">Create squad</button>
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

  const starters = squad.players.filter((p) => slotOf(p.id) === "starter");
  const bench = squad.players.filter((p) => slotOf(p.id) !== "starter").sort((a, b) => slotOf(a.id).localeCompare(slotOf(b.id)));

  const card = (p: (typeof squad.players)[number], onBench: boolean) => (
    <div key={p.id} className={`shirt-card${onBench ? " bench-card" : ""}`}>
      <Shirt />
      <label className="cap-toggle">
        <input type="radio" name="captainId" value={p.id} defaultChecked={p.id === captainId} aria-label={`Captain ${p.displayName}`} />
        <span aria-hidden="true">C</span>
      </label>
      <span className="plate">
        <span className="plate-name">{p.displayName}</span>
        <span className="plate-meta">{money(p.price)}</span>
      </span>
      <select name={`slot_${p.id}`} defaultValue={slotOf(p.id)} aria-label={`Slot for ${p.displayName}`}>
        <option value="starter">Starts</option>
        <option value="bench1">Sub 1</option>
        <option value="bench2">Sub 2</option>
      </select>
    </div>
  );

  return (
    <main>
      <section className="band">
        <div className="section-head">
          <h1>My squad</h1>
          <Link href="/fantasy/leaderboard">Fantasy leaderboard</Link>
        </div>
        <dl className="band-figures">
          {latest && (
            <div><dt>{latest.gameweekName} points</dt><dd className="lead">{latest.total}</dd></div>
          )}
          <div><dt>Squad value</dt><dd>{money(value)}</dd></div>
          <div><dt>In the bank</dt><dd>{money(squad.bank)}</dd></div>
        </dl>
      </section>
      <Notices error={error} saved={saved} />

      {open ? (
        <>
          <p className="deadline">
            <span>Gameweek {open.number} deadline</span>
            <strong>{formatKickoff(teamsLockAt(open.kickoffAt))}</strong>
            <span>Lineups and transfers close then.</span>
          </p>

          <div className="split">
            <form action={setLineupAction} className="stack" aria-labelledby="lineup-head">
              <div className="section-head">
                <h2 id="lineup-head">Lineup</h2>
                <span className="meta">Tap C to pick your captain (scores double).</span>
              </div>
              <input type="hidden" name="gameweekId" value={open.id} />
              <div className="pitch">
                <span className="pitch-lines" aria-hidden="true" />
                {formation(starters).map((row, i) => (
                  <div key={i} className="pitch-row">{row.map((p) => card(p, false))}</div>
                ))}
              </div>
              {bench.length > 0 && (
                <div className="bench">
                  <h3>Bench</h3>
                  <div className="pitch-row">{bench.map((p) => card(p, true))}</div>
                </div>
              )}
              <div className="lineup-save">
                <button type="submit">Save lineup</button>
              </div>
            </form>

            <div className="stack">
              <form action={transferAction} className="card">
                <h2>Transfer</h2>
                {transferUsed ? (
                  <p className="muted">You’ve used this gameweek’s transfer.</p>
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
                    <button type="submit" className="ghost">Make transfer</button>
                  </>
                )}
              </form>
              {latest && <LatestPoints latest={latest} />}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="empty"><p>No upcoming gameweek is open for changes.</p></div>
          {latest && <LatestPoints latest={latest} />}
        </>
      )}
    </main>
  );
}

type SquadScore = Awaited<ReturnType<typeof getSquadScores>>[number];

/** The last locked gameweek's points, player by player. */
function LatestPoints({ latest }: { latest: SquadScore }) {
  return (
    <section className="card">
      <h2>{latest.gameweekName}: {latest.total} points</h2>
      <ul className="plain">
        {latest.players.map((p) => (
          <li key={p.playerId}>
            <span className="row-main">
              <span className="row-title">{p.displayName}{p.captain ? " (C)" : ""}</span>
              {p.role !== "starter" && <span className="meta">{p.role === "substitute" ? "Came on" : "Bench"}</span>}
            </span>
            <span className="row-figure">{p.points}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
