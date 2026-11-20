/**
 * Default catalog of fineable violations. Used to seed the `ViolationType` table;
 * organizers can edit it afterwards, so this file is only the starting point.
 *
 * TODO: the deductions below are suggested tiers, not agreed values (see "Open items"
 * in CLAUDE.md). Confirm or change them before the first fine is issued.
 */
export interface ViolationDefinition {
  name: string;
  description: string;
  /** Points deducted by default (positive number). */
  defaultPoints: number;
}

const MINOR = 1;
const MAJOR = 2;
const SERIOUS = 3;

export const DEFAULT_VIOLATIONS: readonly ViolationDefinition[] = [
  // Minor: breaks a house rule or slows the game.
  {
    name: "Entering the D",
    description:
      "Entering the D, attacking or defending, outside the start of your team's possession.",
    defaultPoints: MINOR,
  },
  {
    name: "Deliberate handball",
    description: "Handling the ball on purpose.",
    defaultPoints: MINOR,
  },
  {
    name: "Time wasting",
    description: "Delaying a restart, e.g. kicking the ball away or walking slowly to retrieve it.",
    defaultPoints: MINOR,
  },
  {
    name: "Dissent",
    description: "Arguing with or disrespecting the organizer, scorer or another player's call.",
    defaultPoints: MINOR,
  },
  {
    name: "Late arrival",
    description: "Arriving after kick-off without telling the organizer.",
    defaultPoints: MINOR,
  },

  // Major: affects other players or the organisation of the game day.
  {
    name: "No-show after confirming",
    description: "Confirmed attendance (RSVP going) but did not turn up and did not give notice.",
    defaultPoints: MAJOR,
  },
  {
    name: "Reckless challenge",
    description: "A dangerous or careless tackle that risks injuring another player.",
    defaultPoints: MAJOR,
  },
  {
    name: "Abusive language",
    description: "Insulting or abusive language towards a player, the organizer or spectators.",
    defaultPoints: MAJOR,
  },
  {
    name: "Tactical foul",
    description: "Fouling deliberately to stop a promising attack.",
    defaultPoints: MAJOR,
  },
  {
    name: "Playing for the wrong team",
    description: "Switching teams, or playing for a team you were not assigned to, after teams lock.",
    defaultPoints: MAJOR,
  },
  {
    name: "Leaving the pitch unannounced",
    description: "Leaving the match without telling the organizer, leaving your team short.",
    defaultPoints: MAJOR,
  },

  // Serious: violence, abandoning a match, or damaging the integrity of the records.
  {
    name: "Violent conduct",
    description: "Fighting, or deliberately hurting another player.",
    defaultPoints: SERIOUS,
  },
  {
    name: "Threats or harassment",
    description: "Threatening or harassing a player, the organizer or the scorer.",
    defaultPoints: SERIOUS,
  },
  {
    name: "Abandoning the match",
    description: "Walking off, or pulling a team off, before the match ends.",
    defaultPoints: SERIOUS,
  },
  {
    name: "Tampering with match records",
    description: "Falsifying or pressuring the scorer to change events, scores or attendance.",
    defaultPoints: SERIOUS,
  },
];
