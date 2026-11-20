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
          <tr><th>Player</th><th title="Matches played">MP</th><th title="Goals">G</th><th title="Assists">A</th><th title="Team bonus">Bonus</th><th title="Fines and late drop-outs">Deductions</th><th>Pts</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId}>
              <td><a href={`/players/${row.playerId}`}>{row.displayName}</a></td>
              <td>{row.matchesPlayed}</td><td>{row.goals}</td><td>{row.assists}</td>
              <td>{row.bonusPoints}</td><td title={row.dropoutPoints > 0 ? `includes ${row.dropoutPoints} for a late drop-out` : undefined}>{row.finePoints + row.dropoutPoints > 0 ? `−${row.finePoints + row.dropoutPoints}` : 0}</td>
              <td><strong>{row.total}</strong></td>
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
  if (fines.length === 0) return <p className="muted">No fines.</p>;
  return (
    <ul className="plain card">
      {fines.map((fine) => (
        <li key={fine.id} className={fine.voidedAt ? "voided" : ""}>
          <span>
            <a href={`/players/${fine.playerId}`}>{fine.playerName}</a> · {fine.violation} <strong>−{fine.points}</strong>
            <span className="muted"> · GW{fine.gameweekNumber}{fine.note ? ` · ${fine.note}` : ""}{fine.issuedBy ? ` · by ${fine.issuedBy}` : ""}{fine.voidedAt ? " · voided" : ""}</span>
          </span>
          {voidAction && !fine.voidedAt && (
            <form action={voidAction}>
              <input type="hidden" name="gameweekId" value={fine.gameweekId} />
              <input type="hidden" name="fineId" value={fine.id} />
              <button type="submit" className="small ghost">Void</button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
