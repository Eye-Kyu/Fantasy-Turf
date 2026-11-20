import { notFound } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { requireUser } from "@/server/current-user";
import { listSeasons } from "@/server/calendar";
import { listPlayerFines } from "@/server/fines";
import { getPlayerProfile, listTraits } from "@/server/players";
import { getSeasonTotals } from "@/server/points";
import { getPictureVersion } from "@/server/pictures";
import { getPartnerships } from "@/server/stats";
import { FineList, Notices } from "../../components";
import { removePictureAction, setTraitsAction, updateProfileAction, uploadPictureAction } from "../actions";

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
  const playerFines = await listPlayerFines(db, id);
  const pictureVersion = await getPictureVersion(db, id);
  const partnerships = await getPartnerships(db, { playerId: id, limit: 5 });
  const [season] = await listSeasons(db);
  const seasonStats = season ? (await getSeasonTotals(db, season.id)).find((row) => row.playerId === id) : undefined;
  const ownedTraitIds = new Set(profile.traits.map((trait) => trait.id));

  return (
    <main>
      <section className="band">
        <div className="profile-head">
          {pictureVersion !== null ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/players/${id}/picture?v=${pictureVersion}`} alt={`${profile.displayName}’s picture`} width={96} height={96} className="avatar" />
          ) : (
            <span className="avatar-blank" aria-hidden="true">{profile.displayName.slice(0, 1).toUpperCase()}</span>
          )}
          <h1>{profile.displayName}</h1>
        </div>
        <dl className="band-figures">
          <div><dt>Rating</dt><dd className="lead">{Math.round(profile.rating)}</dd></div>
          <div><dt>Price</dt><dd>{profile.price}</dd></div>
          <div><dt>Streak</dt><dd>{profile.currentStreak}</dd></div>
        </dl>
      </section>
      <Notices error={error} saved={saved} />

      <section className="card">
        {season && (
          <>
            <h2>{season.name}</h2>
            <dl className="stats" aria-label={`${season.name} stats`}>
              <div><dt>Points</dt><dd>{seasonStats?.total ?? 0}</dd></div>
              <div><dt>Goals</dt><dd>{seasonStats?.goals ?? 0}</dd></div>
              <div><dt>Assists</dt><dd>{seasonStats?.assists ?? 0}</dd></div>
              <div><dt>Matches</dt><dd>{seasonStats?.matchesPlayed ?? 0}</dd></div>
            </dl>
          </>
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

      {partnerships.length > 0 && (
        <section className="section">
          <h2>Best partnerships</h2>
          <ul className="plain card">
            {partnerships.map((p) => (
              <li key={`${p.assisterId}-${p.scorerId}`}>
                <span className="row-title">{p.assisterName} to {p.scorerName}</span>
                <span className="row-figure">{p.goals} goal{p.goals > 1 ? "s" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {playerFines.length > 0 && (
        <section className="section">
          <h2>Fines</h2>
          <FineList fines={playerFines} />
        </section>
      )}

      {isOwner && (
        <section className="card">
          <h2>Your picture</h2>
          <form action={uploadPictureAction.bind(null, profile.id)} className="stack">
            <label>Choose a photo (JPG, PNG or WebP, up to 2 MB)<input type="file" name="picture" accept="image/jpeg,image/png,image/webp" required /></label>
            <button type="submit">Upload picture</button>
          </form>
          {pictureVersion !== null && (
            <form action={removePictureAction.bind(null, profile.id)}>
              <button type="submit" className="small ghost">Remove picture</button>
            </form>
          )}
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
