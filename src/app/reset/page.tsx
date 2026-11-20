import { getDb } from "@/db/client";
import { isResetUsable } from "@/server/password-reset";
import { Notices } from "../components";
import { resetPasswordAction } from "./actions";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ error?: string; token?: string }> }) {
  const { error, token } = await searchParams;
  const usable = token ? await isResetUsable(getDb(), token) : false;

  if (!usable) {
    return (
      <main className="narrow">
        <h1>Reset your password</h1>
        <Notices error={error ?? "reset-invalid"} />
        <p className="muted">Ask an organizer for a new reset link.</p>
      </main>
    );
  }
  return (
    <main className="narrow">
      <h1>Choose a new password</h1>
      <Notices error={error} />
      <form action={resetPasswordAction} className="card">
        <input type="hidden" name="token" value={token} />
        <label>New password<input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
        <button type="submit">Change password</button>
      </form>
    </main>
  );
}
