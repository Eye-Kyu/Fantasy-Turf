/**
 * Plain-text match summaries for sharing to the WhatsApp group. No integration is
 * needed: the page offers a wa.me link that opens WhatsApp with the text filled in.
 */
export interface SummaryTeam {
  name: string;
  goals: number;
}
export interface SummaryScorer {
  name: string;
  goals: number;
  assists: number;
}

export function matchSummaryText(input: {
  gameweekNumber: number;
  matchNumber: number;
  teams: readonly SummaryTeam[];
  scorers: readonly SummaryScorer[];
  url?: string;
}): string {
  const [a, b] = input.teams;
  const score = a && b ? `${a.name} ${a.goals} - ${b.goals} ${b.name}` : "No score";
  const lines = [`⚽ Gameweek ${input.gameweekNumber}, match ${input.matchNumber}`, score];
  const involved = input.scorers.filter((s) => s.goals > 0 || s.assists > 0);
  if (involved.length > 0) {
    lines.push("");
    for (const s of involved) {
      const parts = [s.goals > 0 ? `${s.goals} goal${s.goals > 1 ? "s" : ""}` : "", s.assists > 0 ? `${s.assists} assist${s.assists > 1 ? "s" : ""}` : ""];
      lines.push(`• ${s.name}: ${parts.filter(Boolean).join(", ")}`);
    }
  }
  if (input.url) lines.push("", input.url);
  return lines.join("\n");
}

export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
