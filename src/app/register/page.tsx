import { registerAction } from "../auth-actions";
import { Notices } from "../components";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;

  return (
    <main>
      <h1>Join the league</h1>
      <Notices error={error} />
      <form action={registerAction} className="card stack">
        <label>Name<input type="text" name="displayName" autoComplete="name" minLength={2} maxLength={40} required /></label>
        <label>Email<input type="email" name="email" autoComplete="email" required /></label>
        <label>Password<input type="password" name="password" autoComplete="new-password" minLength={8} required /></label>
        <button type="submit">Create account</button>
      </form>
    </main>
  );
}
