/**
 * User roles, shared by permission logic and the database. The `user_role` enum in
 * src/db/schema/enums.ts is built from this list, so they cannot drift apart.
 */
export const USER_ROLES = ["MANAGER", "ORGANIZER", "SUPER_ADMIN"] as const;

export type UserRole = (typeof USER_ROLES)[number];
