import { getDb } from "@/db/client";
import { listSeasons } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { getPartnerships, getSeasonAwards } from "@/server/stats";

export default async function AwardsPage() {
  await requireUser();
  const db = getDb();
  const [season] = await listSeasons(db);
  if (!season) return <main><h1>Awards</h1><p className="muted">There is no season yet.</p></main>;
  const awards = await getSeasonAwards(db, season.id);
  const pairs = await getPartnerships(db, { seasonId: season.id, limit: 10 });

  const rows: [string, string | null][] = [
    ["Golden boot", awards.goldenBoot && `${awards.goldenBoot.names.join(", ")} · ${awards.goldenBoot.value} goals`],
    ["Top assister", awards.topAssister && `${awards.topAssister.names.join(", ")} · ${awards.topAssister.value} assists`],
    ["Best partnership", awards.bestPartnership && `${awards.bestPartnership.pairs.join(", ")} · ${awards.bestPartnership.goals} goals`],
    ["Longest streak", awards.longestStreak && `${awards.longestStreak.names.join(", ")} · ${awards.longestStreak.value} gameweeks`],
    ["Player of the month", awards.playerOfTheMonth && `${awards.playerOfTheMonth.names.join(", ")} · ${awards.playerOfTheMonth.points} pts (${awards.playerOfTheMonth.month})`],
  ];

  return (
    <main>
      <h1>Awards · {season.name}</h1>
      <p className="muted">{awards.final ? "Final." : "Provisional until every gameweek is locked."}</p>
      <table>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}><th scope="row">{label}</th><td>{value ?? "–"}</td></tr>
          ))}
        </tbody>
      </table>
      <h2>Top partnerships</h2>
      {pairs.length === 0 ? (
        <p className="muted">No assisted goals yet.</p>
      ) : (
        <ol>
          {pairs.map((p) => <li key={`${p.assisterId}-${p.scorerId}`}>{p.assisterName} → {p.scorerName} · {p.goals}</li>)}
        </ol>
      )}
    </main>
  );
}
