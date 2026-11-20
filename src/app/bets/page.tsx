import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gameweeks } from "@/db/schema";
import { BETTING } from "@/lib/constants";
import { teamsLockAt } from "@/lib/gameweek";
import { formatKickoff } from "@/lib/time";
import { getCurrentSeason } from "@/server/fantasy";
import { requireUser } from "@/server/current-user";
import { getBalance, getBettingBoard, getBettingLeaderboard, isBettingOpen, type BetType } from "@/server/betting";
import { Notices } from "../components";
import { placeBetAction } from "./actions";

const KINDS: { type: BetType; label: string }[] = [
  { type: "MATCH_WINNER", label: "Match winner (a draw refunds)" },
  { type: "TOP_SCORER", label: "Top scorer" },
  { type: "TOP_ASSISTS", label: "Top assister" },
];

export default async function BetsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireUser();
  const { error, saved } = await searchParams;
  const db = getDb();
  const season = await getCurrentSeason(db);
  if (!season) return <main><h1>Bets</h1><p className="muted">There is no season yet.</p></main>;

  const now = new Date();
  const all = await db.select().from(gameweeks).where(eq(gameweeks.seasonId, season.id)).orderBy(desc(gameweeks.kickoffAt));
  const current = all.find((g) => isBettingOpen(g, now)) ?? all.find((g) => g.kickoffAt <= now) ?? null;
  const upcoming = [...all].reverse().find((g) => g.kickoffAt > now && !isBettingOpen(g, now));
  const open = current ? isBettingOpen(current, now) : false;
  const board = current ? await getBettingBoard(db, user.userId, current.id) : [];
  const balance = await getBalance(db, user.userId, season.id);
  const table = await getBettingLeaderboard(db, season.id);

  return (
    <main>
      <h1>Bets</h1>
      <p className="muted">
        Points only, never money. You have <strong>{balance}</strong> points. Everyone starts with {BETTING.START} and gets {BETTING.ALLOWANCE} more each gameweek.
        Winners share the pool of all stakes on a bet, and bets nobody won (or everybody won) are refunded.
      </p>
      <Notices error={error} saved={saved} />
      {!open && upcoming && <p>Bets on gameweek {upcoming.number} open at {formatKickoff(teamsLockAt(upcoming.kickoffAt))}, when teams lock.</p>}

      {current && (
        <section>
          <h2>Gameweek {current.number}{open ? ` · closes at kick-off, ${formatKickoff(current.kickoffAt)}` : " · closed"}</h2>
          {board.map((match) => (
            <div key={match.matchId} className="card stack">
              <h3>Match {match.number}: {match.teams.map((t) => t.name).join(" vs ")}</h3>
              {match.mine.length > 0 && (
                <ul className="plain">
                  {match.mine.map((b) => (
                    <li key={b.type}>
                      {KINDS.find((k) => k.type === b.type)?.label}: {b.pickName}, {b.stake} points · {b.status === "OPEN" ? "pending" : `${b.status.toLowerCase()}, returned ${b.payout}`}
                    </li>
                  ))}
                </ul>
              )}
              {open && match.blocked && <p className="muted">You play in or score this match, so you can't bet on it.</p>}
              {open && !match.blocked &&
                KINDS.filter((k) => !match.mine.some((b) => b.type === k.type)).map((kind) => (
                  <form key={kind.type} action={placeBetAction} className="row">
                    <input type="hidden" name="matchId" value={match.matchId} />
                    <input type="hidden" name="type" value={kind.type} />
                    <label>{kind.label}
                      <select name="pickId" required>
                        {kind.type === "MATCH_WINNER"
                          ? match.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)
                          : match.players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </label>
                    <label>Stake<input type="number" name="stake" min={BETTING.MIN_STAKE} max={BETTING.MAX_STAKE} defaultValue={10} required /></label>
                    <button type="submit">Bet</button>
                  </form>
                ))}
            </div>
          ))}
        </section>
      )}

      <h2>Points table</h2>
      <table>
        <thead><tr><th>#</th><th>Name</th><th>Points</th></tr></thead>
        <tbody>
          {table.map((row, i) => (
            <tr key={row.userId} className={row.userId === user.userId ? "me" : undefined}><td>{i + 1}</td><td>{row.name}</td><td>{row.balance}</td></tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
