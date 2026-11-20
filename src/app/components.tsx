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
  total: number;
}

/** Points table shared by the gameweek and season pages. */
export function PointsTable({ rows }: { rows: PointsRow[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Player</th><th title="Matches played">MP</th><th title="Goals">G</th><th title="Assists">A</th><th title="Team bonus">Bonus</th><th title="Fines">Fines</th><th>Pts</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId}>
              <td><a href={`/players/${row.playerId}`}>{row.displayName}</a></td>
              <td>{row.matchesPlayed}</td><td>{row.goals}</td><td>{row.assists}</td>
              <td>{row.bonusPoints}</td><td>{row.finePoints > 0 ? `−${row.finePoints}` : 0}</td>
              <td><strong>{row.total}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
