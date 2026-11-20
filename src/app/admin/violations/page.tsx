import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { MAX_FINE_POINTS } from "@/lib/constants";
import { requireUser } from "@/server/current-user";
import { listViolations } from "@/server/fines";
import { Notices } from "../../components";
import { createViolationAction, seedViolationsAction, updateViolationAction } from "./actions";

export default async function ViolationsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "manageViolations")) notFound();
  const { error, saved } = await searchParams;
  const violations = await listViolations(getDb());

  return (
    <main>
      <h1>Violations</h1>
      <p className="muted">
        What organizers can fine for, and the usual deduction in points. Changing an amount never changes fines already issued.
      </p>
      <Notices error={error} saved={saved} />

      <form action={seedViolationsAction} className="card">
        <p className="muted">Add the standard list (minor 1, major 2, serious 3). Anything already here is left alone.</p>
        <button type="submit" className="small">Load standard violations</button>
      </form>

      <ul className="plain card">
        {violations.length === 0 && <li className="muted">No violations yet.</li>}
        {violations.map((v) => (
          <li key={v.id} className={v.isActive ? "" : "voided"}>
            <span className="row-main"><span className="row-title">{v.name}</span>{v.description && <span className="meta">{v.description}</span>}</span>
            <form action={updateViolationAction} className="row-actions">
              <input type="hidden" name="violationTypeId" value={v.id} />
              <input type="number" name="defaultPoints" defaultValue={v.defaultPoints} min={1} max={MAX_FINE_POINTS} aria-label="Points" className="points" />
              <label className="check"><input type="checkbox" name="isActive" defaultChecked={v.isActive} /> In use</label>
              <button type="submit" className="small ghost">Save</button>
            </form>
          </li>
        ))}
      </ul>

      <form action={createViolationAction} className="card stack">
        <h2>Add a violation</h2>
        <label>Name<input type="text" name="name" minLength={2} maxLength={60} required /></label>
        <label>Description (optional)<input type="text" name="description" maxLength={200} /></label>
        <label>Points<input type="number" name="defaultPoints" min={1} max={MAX_FINE_POINTS} defaultValue={1} required /></label>
        <button type="submit">Add violation</button>
      </form>
    </main>
  );
}
