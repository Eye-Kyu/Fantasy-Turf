import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/server/current-user";
import { listSeasons } from "@/server/calendar";
import { getPlayerProfile, listTraits } from "@/server/players";
import { getSeasonTotals } from "@/server/points";
import { Notices } from "../../components";
import { setTraitsAction, updateProfileAction } from "../actions";

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error, saved } = await searchParams;

  // A malformed id would make Postgres throw; treat it as "no such player".
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const profile = await getPlayerProfile(db, id);
  if (!profile) notFound();

  const isOwner = user.playerId === profile.id;
  const canSetTraits = can(user.role, "setTraits");
  const allTraits = canSetTraits ? await listTraits(db) : [];
  const [season] = await listSeasons(db);
  const seasonStats = season ? (await getSeasonTotals(db, season.id)).find((row) => row.playerId === id) : undefined;
  const ownedTraitIds = new Set(profile.traits.map((trait) => trait.id));

  return (
    <main>
      <h1>{profile.displayName}</h1>
      <Notices error={error} saved={saved} />

      <section className="card">
        <dl className="stats">
          <div><dt>Rating</dt><dd>{Math.round(profile.rating)}</dd></div>
          <div><dt>Price</dt><dd>{profile.price}</dd></div>
          <div><dt>Streak</dt><dd>{profile.currentStreak}</dd></div>
        </dl>
        {season && (
          <dl className="stats" aria-label={`${season.name} stats`}>
            <div><dt>Points</dt><dd>{seasonStats?.total ?? 0}</dd></div>
            <div><dt>Goals</dt><dd>{seasonStats?.goals ?? 0}</dd></div>
            <div><dt>Assists</dt><dd>{seasonStats?.assists ?? 0}</dd></div>
            <div><dt>Matches</dt><dd>{seasonStats?.matchesPlayed ?? 0}</dd></div>
          </dl>
        )}
        {profile.bio && <p>{profile.bio}</p>}
        <div>
          {profile.traits.length === 0 ? (
            <span className="muted">No traits yet.</span>
          ) : (
            profile.traits.map((trait) => <span key={trait.id} className="pill">{trait.name}</span>)
          )}
        </div>
      </section>

      {isOwner && (
        <section className="card">
          <h2>Edit your profile</h2>
          <form action={updateProfileAction.bind(null, profile.id)} className="stack">
            <label>Name<input type="text" name="displayName" defaultValue={profile.displayName} minLength={2} maxLength={40} required /></label>
            <label>About you<textarea name="bio" rows={3} maxLength={300} defaultValue={profile.bio ?? ""} /></label>
            <button type="submit">Save</button>
          </form>
        </section>
      )}

      {canSetTraits && (
        <section className="card">
          <h2>Traits (super admin)</h2>
          {allTraits.length === 0 ? (
            <p className="muted">No traits exist yet. Add some under Traits.</p>
          ) : (
            <form action={setTraitsAction.bind(null, profile.id)} className="stack">
              {allTraits.map((trait) => (
                <label key={trait.id} className="check">
                  <input type="checkbox" name="traitIds" value={trait.id} defaultChecked={ownedTraitIds.has(trait.id)} />
                  {trait.name} <span className="muted">({trait.category})</span>
                </label>
              ))}
              <button type="submit">Save traits</button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
