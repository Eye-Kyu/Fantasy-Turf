import Link from "next/link";
import { getCurrentUser } from "@/server/current-user";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main>
      <h1>Street Football Fantasy League</h1>
      <p className="muted">Weekly street football in Nairobi, with fantasy squads on top.</p>
      {user?.playerId ? (
        <p><Link href={`/players/${user.playerId}`}>Go to your profile</Link></p>
      ) : (
        <p><Link href="/register">Join the league</Link> or <Link href="/login">sign in</Link>.</p>
      )}
    </main>
  );
}
