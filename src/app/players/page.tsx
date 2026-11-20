import Link from "next/link";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/current-user";
import { listPlayers } from "@/server/players";

export default async function PlayersPage() {
  await requireUser();
  const players = await listPlayers(getDb());

  return (
    <main>
      <h1>Players</h1>
      {players.length === 0 ? (
        <div className="empty"><p>No players yet.</p></div>
      ) : (
        <ul className="plain card">
          {players.map((player) => (
            <li key={player.id}>
              <Link href={`/players/${player.id}`} className="row-title">{player.displayName}</Link>
              <span className="row-figure" title="Rating">{Math.round(player.rating)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
