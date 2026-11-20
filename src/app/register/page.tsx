import { getDb } from "@/db/client";
import { isInviteUsable } from "@/server/invites";
import { registerAction } from "../auth-actions";
import { Notices } from "../components";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error, invite } = await searchParams;
  const usable = invite ? await isInviteUsable(getDb(), invite) : false;

  if (!usable) {
    return (
      <main className="narrow">
        <h1>Join the league</h1>
        <Notices error={error ?? "invite-invalid"} />
        <p className="muted">Joining is by invite only. Ask an organizer for a new invite link.</p>
      </main>
    );
  }

  return (
    <main className="narrow">
      <h1>Join the league</h1>
      <Notices error={error} />
      <form action={registerAction} className="card">
        <input type="hidden" name="inviteToken" value={invite} />
        <label>Name<input type="text" name="displayName" autoComplete="name" minLength={2} maxLength={40} required /></label>
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <label>Phone number<input type="tel" name="phone" autoComplete="tel" placeholder="0712 345 678" required /></label>
        <label>Password<input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
        <button type="submit">Create account</button>
      </form>
    </main>
  );
}
