"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  /** A shorter label for the phone tab bar, where six tabs share the width. */
  short?: string;
}

/** True when `pathname` is the tab's page or one of its sub-pages. */
function isCurrent(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Line icons for the phone tab bar, keyed by section; decorative, the label carries the meaning. */
const ICONS: Record<string, string> = {
  "/gameweeks": "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5",
  "/fantasy": "M8 4h8l5 4-3 4-2-1.5V20H8v-9.5L6 12 3 8z",
  "/leaderboard": "M4 20V12h5v8M9 20V6h6v14M15 20v-5h5v5",
  "/awards": "M8 4h8v5a4 4 0 0 1-8 0zM12 13v4M8 20h8M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4",
  "/bets": "M5 4h14v16H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01",
  "/players": "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2 .7 3 2.8 3 6",
};

function TabIcon({ href }: { href: string }) {
  const d = ICONS[href];
  if (!d) return null;
  return (
    <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The masthead's tab row; on phones the sections move to a bottom tab bar, as match apps do.
 * A client component only so it can mark the current tab; the list of links (including admin ones) is decided on the server.
 */
export function NavTabs({ items, admin }: { items: NavItem[]; admin: NavItem[] }) {
  const pathname = usePathname();
  // /fantasy/leaderboard belongs to Fantasy, not Leaderboard, so pick the longest match.
  const all = [...items, ...admin];
  const current = all
    .filter((item) => isCurrent(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      <div className="tabs tabs-sections" role="navigation" aria-label="Sections">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="tab" aria-current={item.href === current ? "page" : undefined}>
            <TabIcon href={item.href} />
            <span className={item.short ? "tab-long" : undefined}>{item.label}</span>
            {item.short && <span className="tab-short">{item.short}</span>}
          </Link>
        ))}
      </div>
      {admin.length > 0 && (
        <div className="tabs tabs-admin" role="navigation" aria-label="Admin">
          {admin.map((item) => (
            <Link key={item.href} href={item.href} className="tab tab-admin" aria-current={item.href === current ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
