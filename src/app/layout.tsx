import type { ReactNode } from "react";
import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/server/current-user";
import { logoutAction } from "./auth-actions";
import { NavTabs, type NavItem } from "./nav-tabs";
import "./globals.css";

export const metadata = {
  title: "Turf Gong",
  description: "Weekly street football in Nairobi, with fantasy squads on top.",
  manifest: "/manifest.webmanifest",
};
export const viewport = { themeColor: "#2a0a2e" };

const SECTIONS: NavItem[] = [
  { href: "/gameweeks", label: "Games" },
  { href: "/fantasy", label: "Fantasy" },
  { href: "/leaderboard", label: "Leaderboard", short: "Table" },
  { href: "/awards", label: "Awards" },
  { href: "/bets", label: "Bets" },
  { href: "/players", label: "Players" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const admin: NavItem[] = [];
  if (user && can(user.role, "manageCalendar")) admin.push({ href: "/admin/calendar", label: "Calendar" });
  if (user && can(user.role, "manageViolations")) admin.push({ href: "/admin/violations", label: "Violations" });
  if (user && can(user.role, "inviteUsers")) admin.push({ href: "/admin/invites", label: "Invites" });
  if (user && can(user.role, "resetPasswords")) admin.push({ href: "/admin/resets", label: "Resets" });
  if (user && can(user.role, "setTraits")) admin.push({ href: "/admin/traits", label: "Traits" });

  return (
    <html lang="en">
      <body>
        <header className="masthead">
          <nav className="masthead-inner">
            <div className="masthead-top">
              <Link href="/" className="brand" aria-label="Turf Gong, home">
                <span className="crest" aria-hidden="true">TG</span>
                <span>Turf Gong</span>
              </Link>
              <div className="account">
                {user ? (
                  <>
                    {user.playerId && <Link href={`/players/${user.playerId}`} className="account-link">My profile</Link>}
                    <form action={logoutAction}>
                      <button type="submit" className="link on-field">Sign out</button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="account-link">Sign in</Link>
                )}
              </div>
            </div>
            <div className="tab-row">
              <NavTabs items={SECTIONS} admin={admin} />
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
