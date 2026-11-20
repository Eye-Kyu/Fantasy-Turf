import Link from "next/link";
import { errorMessage, noticeMessage } from "./messages";

/** The error / confirmation banner for the `?error=` and `?saved=` URL codes. */
export function Notices({ error, saved }: { error?: string; saved?: string }) {
  const errorText = errorMessage(error);
  const savedText = noticeMessage(saved);
  return (
    <>
      {errorText && <p className="notice error" role="alert">{errorText}</p>}
      {savedText && <p className="notice ok" role="status">{savedText}</p>}
    </>
  );
}

interface PointsRow {
  playerId: string;
  displayName: string;
  matchesPlayed: number;
  goals: number;
  assists: number;
  bonusPoints: number;
  finePoints: number;
  dropoutPoints: number;
  total: number;
}

/** Points table shared by the gameweek and season pages. */
export function PointsTable({ rows }: { rows: PointsRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th title="Position">Pos</th><th>Player</th><th title="Matches played">MP</th><th title="Goals">G</th><th title="Assists">A</th><th title="Team bonus">Bonus</th><th title="Fines and late drop-outs">Deductions</th><th>Pts</th></tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.playerId}>
              <td className="rank">{i + 1}</td>
              <td><a href={`/players/${row.playerId}`}>{row.displayName}</a></td>
              <td>{row.matchesPlayed}</td><td>{row.goals}</td><td>{row.assists}</td>
              <td>{row.bonusPoints}</td><td title={row.dropoutPoints > 0 ? `includes ${row.dropoutPoints} for a late drop-out` : undefined}>{row.finePoints + row.dropoutPoints > 0 ? `−${row.finePoints + row.dropoutPoints}` : 0}</td>
              <td className="total">{row.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface FineRow {
  id: string;
  playerId: string;
  playerName: string;
  gameweekId: string;
  gameweekNumber: number;
  violation: string;
  points: number;
  note: string | null;
  issuedBy: string | null;
  voidedAt: Date | null;
}

/** Fines newest first; voided ones are struck through. Pass `voidAction` to show Void buttons. */
export function FineList({ fines, voidAction }: { fines: FineRow[]; voidAction?: (formData: FormData) => Promise<void> }) {
  if (fines.length === 0) return <div className="empty"><p>No fines.</p></div>;
  return (
    <ul className="plain card">
      {fines.map((fine) => (
        <li key={fine.id} className={fine.voidedAt ? "voided" : ""}>
          <span className="row-main">
            <span className="row-title"><a href={`/players/${fine.playerId}`}>{fine.playerName}</a>, {fine.violation}</span>
            <span className="meta">
              GW{fine.gameweekNumber}
              {fine.note ? `, ${fine.note}` : ""}
              {fine.issuedBy ? `. Issued by ${fine.issuedBy}` : ""}
              {fine.voidedAt ? ". Voided" : ""}
            </span>
          </span>
          <span className="row-actions">
            <strong className="row-figure">−{fine.points}</strong>
            {voidAction && !fine.voidedAt && (
              <form action={voidAction}>
                <input type="hidden" name="gameweekId" value={fine.gameweekId} />
                <input type="hidden" name="fineId" value={fine.id} />
                <button type="submit" className="small ghost">Void</button>
              </form>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

const GAMEWEEK_PAGES = [
  { path: "", label: "Overview" },
  { path: "/teams", label: "Teams" },
  { path: "/points", label: "Points" },
  { path: "/fines", label: "Fines" },
] as const;

/** The tab row shared by a gameweek's overview, teams, points and fines pages. */
export function GameweekNav({ gameweekId, current }: { gameweekId: string; current: (typeof GAMEWEEK_PAGES)[number]["path"] }) {
  return (
    <nav className="segmented" aria-label="Gameweek pages">
      {GAMEWEEK_PAGES.map((page) => (
        <Link key={page.path} href={`/gameweeks/${gameweekId}${page.path}`} aria-current={page.path === current ? "page" : undefined}>
          {page.label}
        </Link>
      ))}
    </nav>
  );
}

/** The match score in a fixture band: home name, the two scores, away name. */
export function Scoreboard({ teams, score }: { teams: { id: string; name: string }[]; score: Record<string, number | undefined> }) {
  const [home, away] = teams;
  if (teams.length !== 2 || !home || !away) {
    return (
      <section className="scoreboard" aria-label="Score">
        {teams.map((team) => (
          <div key={team.id}>
            <div className="team-name">{team.name}</div>
            <div className="goals">{score[team.id] ?? 0}</div>
          </div>
        ))}
      </section>
    );
  }
  return (
    <section className="scoreboard" aria-label={`Score: ${home.name} ${score[home.id] ?? 0}, ${away.name} ${score[away.id] ?? 0}`}>
      <div className="team-name">{home.name}</div>
      <div aria-hidden="true">
        <div className="goals">{score[home.id] ?? 0}<span className="versus" />{score[away.id] ?? 0}</div>
      </div>
      <div className="team-name">{away.name}</div>
    </section>
  );
}

/** A football shirt icon for the pitch view; decorative, the name plate carries the meaning. */
export function Shirt() {
  return (
    <svg className="shirt" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M22 6h20l4 3 14 9-6 13-7-4v31H17V27l-7 4-6-13 14-9z" />
      <path className="trim" fill="currentColor" d="M25 6h14c0 4-3 7-7 7s-7-3-7-7z" />
    </svg>
  );
}
