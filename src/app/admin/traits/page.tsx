import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/server/current-user";
import { listTraits } from "@/server/players";
import { Notices } from "../../components";
import { createTraitAction } from "./actions";

export default async function TraitsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  // Hide the page entirely from anyone who may not use it.
  if (!can(user.role, "setTraits")) notFound();
  const { error, saved } = await searchParams;
  const traits = await listTraits(getDb());

  return (
    <main>
      <h1>Traits</h1>
      <p className="muted">Traits describe players (scorer, talisman, ...). They don't affect team sorting for now.</p>
      <Notices error={error} saved={saved} />

      <form action={createTraitAction} className="card stack">
        <label>Name<input type="text" name="name" minLength={2} maxLength={30} required /></label>
        <label>Category<input type="text" name="category" minLength={2} maxLength={30} required /></label>
        <button type="submit">Add trait</button>
      </form>

      <ul className="plain card">
        {traits.length === 0 && <li className="muted">No traits yet.</li>}
        {traits.map((trait) => (
          <li key={trait.id}>{trait.name}<span className="muted">{trait.category}</span></li>
        ))}
      </ul>
    </main>
  );
}
