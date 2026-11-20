import { can, type Action } from "@/lib/auth/permissions";
import type { UserRole } from "@/lib/auth/roles";
import { ForbiddenError } from "./errors";

/** The signed-in user performing an operation. */
export interface Actor {
  userId: string;
  role: UserRole;
}

/** Throws ForbiddenError unless the actor's role allows the action. */
export function assertCan(actor: Actor, action: Action): void {
  if (!can(actor.role, action)) throw new ForbiddenError(action);
}
