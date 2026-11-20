import { loginAction } from "../auth-actions";
import { Notices } from "../components";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Sign in</h1>
      <Notices error={error} />
      <form action={loginAction} className="card stack">
        <label>Email or phone number<input type="text" name="identifier" autoComplete="username" required /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <button type="submit">Sign in</button>
      </form>
      <p className="muted">Joining is by invite only. Ask an organizer for your invite link.</p>
    </main>
  );
}
