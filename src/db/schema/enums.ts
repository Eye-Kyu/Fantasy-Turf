import { pgEnum } from "drizzle-orm/pg-core";
import { USER_ROLES } from "../../lib/auth/roles";
import { EVENT_TYPES } from "../../lib/domain";

// Values come from src/lib/auth/roles.ts (see there for what each role may do).
export const userRole = pgEnum("user_role", USER_ROLES);

export const rsvpStatus = pgEnum("rsvp_status", ["GOING", "NOT_GOING", "NO_RESPONSE"]);

// Values come from src/lib/domain.ts so scoring logic and the database share one list.
export const eventType = pgEnum("event_type", EVENT_TYPES);

export const auditAction = pgEnum("audit_action", [
  "CREATE",
  "VOID",
  "EDIT",
  "OVERRIDE", // organizer change after the gameweek was locked
]);

export const lineupSlot = pgEnum("lineup_slot", ["STARTER", "BENCH"]);

export const betType = pgEnum("bet_type", ["TOP_SCORER", "TOP_ASSISTS", "MATCH_WINNER"]);

export const betStatus = pgEnum("bet_status", ["OPEN", "WON", "LOST", "VOID"]);
