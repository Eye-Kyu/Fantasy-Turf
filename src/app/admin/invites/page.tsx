import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { INVITE_TTL_DAYS } from "@/lib/auth/policy";
import { requireUser } from "@/server/current-user";
import { Notices } from "../../components";
import { createInviteAction } from "./actions";

export default async function InvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "inviteUsers")) notFound();
  const { error, token } = await searchParams;

  // Build the full link from the host the organizer is using right now.
  const host = (await headers()).get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const link = token && host ? `${protocol}://${host}/register?invite=${encodeURIComponent(token)}` : null;

  return (
    <main>
      <h1>Invites</h1>
      <p className="muted">
        Each link works once and expires after {INVITE_TTL_DAYS} days. Send it to the player on WhatsApp.
      </p>
      <Notices error={error} />

      {link && (
        <div className="card stack">
          <p>Share this link now. It is shown only once.</p>
          <input type="text" readOnly value={link} aria-label="Invite link" />
        </div>
      )}

      <form action={createInviteAction}>
        <button type="submit">Create invite link</button>
      </form>
    </main>
  );
}
