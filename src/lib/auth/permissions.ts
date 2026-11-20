/**
 * Role permissions: the single place that says who may do what (see "Roles and
 * permissions" in CLAUDE.md). Every server action checks `can()` before acting; the UI
 * only uses it to hide controls, never as the enforcement.
 *
 * Ownership rules ("a manager edits their own squad/profile") are not roles and are
 * checked where the data is loaded.
 */
import type { UserRole } from "@/lib/auth/roles";

export type Action =
  | "sortTeams"
  | "confirmAttendance"
  | "issueFines"
  | "reconcileMatches"
  | "inviteUsers"
  | "manageCalendar"
  | "setTraits"
  | "manageUsers";

const ORGANIZER_ACTIONS: readonly Action[] = [
  "sortTeams",
  "confirmAttendance",
  "issueFines",
  "reconcileMatches",
  "inviteUsers",
  "manageCalendar",
];

/** Actions only a super admin may do, on top of everything an organizer can. */
const SUPER_ADMIN_ONLY_ACTIONS: readonly Action[] = ["setTraits", "manageUsers"];

const ALLOWED: Record<UserRole, readonly Action[]> = {
  MANAGER: [],
  ORGANIZER: ORGANIZER_ACTIONS,
  SUPER_ADMIN: [...ORGANIZER_ACTIONS, ...SUPER_ADMIN_ONLY_ACTIONS],
};

/** Whether a user with this role may perform the action. */
export function can(role: UserRole, action: Action): boolean {
  return ALLOWED[role].includes(action);
}
