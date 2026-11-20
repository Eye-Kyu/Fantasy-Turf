import type { ReactNode } from "react";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/server/current-user";
import { logoutAction } from "./auth-actions";
import "./globals.css";

export const metadata = { title: "Street Football Fantasy League", manifest: "/manifest.webmanifest" };
export const viewport = { themeColor: "#1f7a4d" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <nav>
            <Link href="/" className="brand">Street Football Fantasy</Link>
            <Link href="/gameweeks">Games</Link>
            <Link href="/fantasy">Fantasy</Link>
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/awards">Awards</Link>
            <Link href="/bets">Bets</Link>
            <Link href="/players">Players</Link>
            {user && can(user.role, "manageCalendar") && <Link href="/admin/calendar">Calendar</Link>}
            {user && can(user.role, "manageViolations") && <Link href="/admin/violations">Violations</Link>}
            {user && can(user.role, "inviteUsers") && <Link href="/admin/invites">Invites</Link>}
            {user && can(user.role, "resetPasswords") && <Link href="/admin/resets">Resets</Link>}
            {user && can(user.role, "setTraits") && <Link href="/admin/traits">Traits</Link>}
            {user ? (
              <>
                {user.playerId && <Link href={`/players/${user.playerId}`}>My profile</Link>}
                <form action={logoutAction}>
                  <button type="submit" className="link">Sign out</button>
                </form>
              </>
            ) : (
              <Link href="/login">Sign in</Link>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
