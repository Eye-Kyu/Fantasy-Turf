import { loginAction } from "../auth-actions";
import { Notices } from "../components";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;

  return (
    <main className="narrow auth">
      <header className="page-head">
        <h1>Sign in</h1>
        <p>Back for matchday. Your squad is waiting.</p>
      </header>
      <Notices error={error} saved={saved} />
      <form action={loginAction} className="card">
        <label>Email or phone number<input type="text" name="identifier" autoComplete="username" required /></label>
        <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
        <button type="submit">Sign in</button>
      </form>
      <p className="muted">Joining is by invite only. Ask an organizer for your invite link.</p>
    </main>
  );
}
