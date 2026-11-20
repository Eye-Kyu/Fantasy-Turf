import { describe, expect, it } from "vitest";
import { can, type Action } from "./permissions";
import { USER_ROLES } from "./roles";

const organizerActions: Action[] = ["sortTeams", "confirmAttendance", "issueFines", "reconcileMatches", "inviteUsers"];
const superAdminOnly: Action[] = ["setTraits", "manageUsers"];

describe("can", () => {
  it("gives managers no role-based powers", () => {
    for (const action of [...organizerActions, ...superAdminOnly]) {
      expect(can("MANAGER", action)).toBe(false);
    }
  });

  it("lets organizers run game day but not set traits or manage users", () => {
    for (const action of organizerActions) expect(can("ORGANIZER", action)).toBe(true);
    for (const action of superAdminOnly) expect(can("ORGANIZER", action)).toBe(false);
  });

  it("lets only the super admin set traits and manage users, plus everything an organizer can", () => {
    for (const action of [...organizerActions, ...superAdminOnly]) {
      expect(can("SUPER_ADMIN", action)).toBe(true);
    }
  });

  it("covers every role in the permissions table", () => {
    for (const role of USER_ROLES) expect(() => can(role, "setTraits")).not.toThrow();
  });
});
