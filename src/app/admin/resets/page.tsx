import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { RESET_TTL_HOURS } from "@/lib/auth/policy";
import { requireUser, toActor } from "@/server/current-user";
import { listResettableUsers } from "@/server/password-reset";
import { Notices } from "../../components";
import { createResetAction } from "./actions";

export default async function ResetsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string; for?: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "resetPasswords")) notFound();
  const { error, token, for: forUser } = await searchParams;
  const people = await listResettableUsers(getDb(), toActor(user));

  const host = (await headers()).get("host");
  const protocol = host?.startsWith("localhost") ? "http" : "https";
  const link = token && host ? `${protocol}://${host}/reset?token=${encodeURIComponent(token)}` : null;
  const target = people.find((p) => p.id === forUser);

  return (
    <main>
      <h1>Password resets</h1>
      <p className="muted">
        For someone who is locked out. Create a one-time link (valid {RESET_TTL_HOURS} hours) and send it to them privately,
        e.g. on WhatsApp. Using it signs them out everywhere. Only send it to the person it is for.
      </p>
      <Notices error={error} />

      {link && (
        <div className="card stack">
          <p>Reset link for {target?.name ?? target?.email ?? "this person"}. Shown only once.</p>
          <input type="text" readOnly value={link} aria-label="Reset link" />
        </div>
      )}

      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <td>{p.name ?? "–"}</td><td>{p.email}</td><td>{p.role}</td>
              <td>
                <form action={createResetAction}>
                  <input type="hidden" name="userId" value={p.id} />
                  <button type="submit" className="small">Create link</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
