import { getDb } from "@/db/client";
import { listSeasons } from "@/server/calendar";
import { requireUser } from "@/server/current-user";
import { getPartnerships, getSeasonAwards } from "@/server/stats";

export default async function AwardsPage() {
  await requireUser();
  const db = getDb();
  const [season] = await listSeasons(db);
  if (!season) {
    return (
      <main>
        <h1>Awards</h1>
        <div className="empty"><p>There is no season yet.</p></div>
      </main>
    );
  }
  const awards = await getSeasonAwards(db, season.id);
  const pairs = await getPartnerships(db, { seasonId: season.id, limit: 10 });

  // [award, who, how much]
  const rows: [string, string | null, string | null][] = [
    ["Golden boot", awards.goldenBoot && awards.goldenBoot.names.join(", "), awards.goldenBoot && `${awards.goldenBoot.value} goals`],
    ["Top assister", awards.topAssister && awards.topAssister.names.join(", "), awards.topAssister && `${awards.topAssister.value} assists`],
    ["Best partnership", awards.bestPartnership && awards.bestPartnership.pairs.join(", "), awards.bestPartnership && `${awards.bestPartnership.goals} goals`],
    ["Longest streak", awards.longestStreak && awards.longestStreak.names.join(", "), awards.longestStreak && `${awards.longestStreak.value} gameweeks`],
    [
      "Player of the month",
      awards.playerOfTheMonth && awards.playerOfTheMonth.names.join(", "),
      awards.playerOfTheMonth && `${awards.playerOfTheMonth.points} pts (${awards.playerOfTheMonth.month})`,
    ],
  ];

  return (
    <main>
      <header className="page-head">
        <h1>Awards</h1>
        <p>{season.name}. {awards.final ? "Final." : "Provisional until every gameweek is locked."}</p>
      </header>
      <ul className="awards">
        {rows.map(([label, who, value]) => (
          <li key={label} className="award">
            <span className="award-title">{label}</span>
            <span className="award-name">{who ?? "–"}</span>
            {value && <span className="award-value">{value}</span>}
          </li>
        ))}
      </ul>
      <section className="section">
        <h2>Top partnerships</h2>
        {pairs.length === 0 ? (
          <div className="empty"><p>No assisted goals yet.</p></div>
        ) : (
          <ol className="plain card">
            {pairs.map((p, i) => (
              <li key={`${p.assisterId}-${p.scorerId}`}>
                <span className="fixture">
                  <span className="gw-badge" aria-hidden="true">{i + 1}</span>
                  <span className="row-title">{p.assisterName} to {p.scorerName}</span>
                </span>
                <span className="row-figure">{p.goals}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
