# Street Football Fantasy League — Project Spec

Working spec for an FPL-style fantasy platform for a weekly informal small-sided
street football group in Nairobi. Read this before making architectural decisions.
It records what is locked, what is adopted-but-tunable, what is deferred, and what is
still open. Code-level conventions live in `CODING_STANDARDS.md` (that file wins on
process).

## Overview

Players play weekly 4–7-a-side street football on a smaller pitch under house rules
(no player may enter the D except at the start of their team's possession). Unlike
FPL, there are **no fixed real-world teams**: the organizer sorts whoever shows up
into ad hoc teams on game day. The platform supports fantasy squads, live scoring,
manual fines and stat tracking on top of that fluid weekly reality.

**Phase 1 scope: local-first, single group (Nairobi), self-hosted.** Deliberately
minimal: several rules were scoped out for now and are listed under **Deferred**.

## Vocabulary (use exactly in code)

"Team" is overloaded, so never use the bare word in code or schema:

- **game-day team** (`GameDayTeam`): ephemeral weekly grouping that generates events.
- **fantasy squad** (`FantasySquad`): a manager's persistent roster of real players.
- **manager**: a user who owns a fantasy squad. Every manager is also a **player**
  profile (same person), but the two roles are separate records.
- **gameweek** (`Gameweek`): one weekly game day, belonging to a **season**.
- **fine** (`Fine`): a manual points deduction for a violation.

## Roles and permissions

| Role | Can do |
| --- | --- |
| `SUPER_ADMIN` | Everything an organizer can, plus: **set player traits** (only this role may), manage users and roles |
| `ORGANIZER` | Sort players into game-day teams (until the lock), confirm attendance, issue and void fines, reconcile matches |
| `MANAGER` | Own a fantasy squad, RSVP, view profiles, place bets (later) |

Enforce permissions at the API boundary, never in the UI alone. The rules live in one
place, `src/lib/auth/permissions.ts` (`can(role, action)`), and every service function
checks the actor itself, so a page cannot forget the check.

Registration is **invite-only**: organizers and the super admin create single-use invite
links (`/admin/invites`, valid 7 days) and share them (e.g. on WhatsApp). Registering
always creates a `MANAGER`. Players sign in with email **or** phone number (stored in
+254… form, see `src/lib/phone.ts`). The first super admin is created on the server with
`npm run admin:create`; later role changes use `npm run admin:promote`.

Security in place: scrypt password hashes, hashed session and invite tokens, HttpOnly
SameSite cookies, sign-in lockout (5 failures per identifier per 15 minutes, in
`src/lib/auth/policy.ts`), constant-time-ish rejection of unknown accounts, and browser
security headers in `next.config.ts`. Email verification is deliberately not needed
because only invited people can register. Password reset is done by an organizer for
now (see Open items).

## Core rules

- No fixed teams; the organizer sorts the players who RSVP'd into teams.
- Games are weekly (one gameweek per match day).
- No player may enter the D, attacking or defending, except at the start of their
  team's possession. This is **not tracked as a live event**; a breach is fined
  manually (see Fines).
- Goals and assists are the primary scoring measures.

## Seasons, deadlines and attendance

- A **season** groups gameweeks; leaderboards, awards and fantasy points reset per
  season, player career stats do not.
- Each gameweek has a `kickoffAt`. **Game-day teams lock, and RSVPs close, 3 hours
  before kick-off** (`TEAM_LOCK_HOURS_BEFORE_KICKOFF`, derived with `teamsLockAt`, not
  stored). Nobody is moved after the lock.
- The **lineup deadline** (fantasy transfers, captain, bench order) **equals the team
  lock** (decided): one moment, derived with `teamsLockAt`, nothing stored. Because
  teams may be sorted before the lock, managers can sometimes see them while still
  choosing a lineup; that is accepted.
- Players RSVP weekly (`Attendance`: going / not going / no response). On game day the
  organizer confirms who actually **attended**; only attended players can score.
- A fantasy player who did not attend scores 0 from play. If a starter did not attend,
  the highest-priority bench player who attended is **auto-substituted** (bench order
  set by the manager). Auto-sub never takes a starter who attended. Fines still apply
  to a player who did not attend (e.g. a no-show after confirming).

## Sorting players into teams (current)

Manual. Between the RSVP list and the lock the organizer assigns players to game-day
teams. There is no automatic balancing and **no trait rules**: how the organizer
decides is outside the app. The app only enforces: one team per player per match
(database constraint), only RSVP'd-going players, and no changes after the lock.

Each gameweek has one or more **matches** (numbered); each match has its own two
game-day teams (default names "Team A" / "Team B"), so the same players can be regrouped
between matches. Marking a player Not going removes them from every team that week.

If someone drops out after the lock the teams are not re-sorted; they play short and
the player's attendance stays unconfirmed (see Open items).

## Traits and ratings

- **Traits** (scorer, talisman, last-man defender, ...) are descriptive attributes on
  a player, grouped by category. **Only `SUPER_ADMIN` may set them.** They do not
  affect sorting for now.
- Every player has a numeric **rating** (Elo-style), updated after each gameweek locks
  from team results and personal goal involvement; history is kept (`PlayerRating`).
  For now it drives only the starting/floating **fantasy price**.
- Rating constants (K-factor, starting rating, team aggregation) are tunable and not
  yet validated against real games.

## Fantasy squads and transfers

Fantasy squads are fully decoupled from game-day teams.

- **Squad size**: 4 starters + 2 bench (6 total). **Transfer limit**: 1 per gameweek.
- **Captain**: one starter per gameweek scores 2x (change at lineup deadline).
- **Budget 50M** per squad (`FANTASY_BUDGET`). Price = 8.0M at rating 1000, +1M per
  50 rating, clamped 4-15M; recomputed when a gameweek locks (`src/lib/rating.ts`).
  Transfers sell and buy at current prices; the squad keeps a `bank`.
- **Rating deltas per gameweek** (`RATING` in constants): goal +10, assist +6, played +4,
  attendance streak +2 per consecutive gameweek (cap +8), RSVP Going but no-show -12,
  other absence -4, each fine point -5; clamped 600-1500. Applied once, inside
  `lockGameweek` (`src/server/ratings.ts`).
- **Lineups** are per gameweek; the deadline is the team lock. `src/server/fantasy.ts`
  copies the previous lineup forward for squads that did not touch it. A starter who did
  not play is replaced by the first bench player who played (`src/lib/fantasy.ts`).
  Fantasy points are computed on demand (`fantasy-points.ts`); the leaderboard counts
  locked gameweeks only. Pages: `/fantasy`, `/fantasy/leaderboard`.

## Data capture and integrity

Two capture paths run together so nothing is missed:

- **Live scoring** (PWA, offline-first): events tapped during the match. Pitch
  connectivity is unreliable, so events queue locally and sync later. Every event
  carries a client-generated UUID so retries cannot double-count; an **undo** action
  voids the last event (a void, never a hard delete). Event types: goal, assist, save,
  key tackle.
- **Post-match reconciliation**: review pass against the live log before the gameweek
  is finalized and locked.

Integrity rules (managers are also players and bettors, so conflicts exist):

- Live scoring and reconciliation are done by any teammate not playing in that match,
  or a third party. Nobody may score or reconcile a match they play in.
- Every event create/void/edit writes an **audit log** row (who, when, before/after).
- Once reconciliation is confirmed the gameweek is **locked** (`lockedAt`); further
  changes need an organizer override and are audited.
- Nobody may bet on a match they play in.

## Scoring rubric

| Event | Points | Notes |
| --- | --- | --- |
| Goal | **+2** | Locked |
| Assist | **+1** | Locked |
| Team goal-difference bonus | **+1 to every player on the team** | Once per match, when a team leads by 2+ at any point (running score, not full-time) |
| Clean sheet / low-concede band | + (TBD) | Needed so defenders are worth picking |
| Save / key tackle | + (TBD) | Needed so defenders are worth picking |
| Man of the match | + (TBD) | Per gameweek |
| Fines | − per fine | Issued manually, see below |

Unset values default to 0 in code and are marked `TODO` against Open Items. Settle the
defensive values before launch: with only goals/assists/team bonus, defenders are never
worth picking.

## Fines (manual deductions)

Rule breaking is **not** an automatic penalty. An organizer issues a **fine**: pick a
violation from the catalog, optionally the match and a note; the deduction (positive
points, copied from the catalog at issue time but overridable) is subtracted from that
player's gameweek score. Fines are voided, never deleted, and record who issued and
who voided them. The catalog (`ViolationType`) is seeded from `DEFAULT_VIOLATIONS` in
`src/lib/violations.ts` and editable afterwards.

**Decided:** fines deduct points, not money, in the three tiers below.

Standard catalog (tiers agreed; organizers can edit or add violations afterwards):

| Tier | Pts | Violations |
| --- | --- | --- |
| Minor | 1 | Entering the D; Deliberate handball; Time wasting; Dissent; Late arrival |
| Major | 2 | No-show after confirming; Reckless challenge; Abusive language; Tactical foul; Playing for the wrong team; Leaving the pitch unannounced |
| Serious | 3 | Violent conduct; Threats or harassment; Abandoning the match; Tampering with match records |

## Betting (last to build)

Points-based virtual currency, **not real money** (keeps v1 outside Kenyan gambling
licensing). Stake points on top scorer, top assists or match winner for a gameweek;
settles automatically on lock. Build only after several weeks of real fantasy data,
once the integrity rules above are in place. Stake/payout mechanics and starting
balance are open.

## Notifications

WhatsApp is the primary channel (group already lives there): RSVP polls, "teams are
set" at the lock, result summaries. Shareable result cards (image) per match. In-app
notifications are secondary. Provider/integration choice is open.

## Player profiles and awards

Profile: career/season totals, **best partnerships** (goal-assist pairs from linked
events, query/materialized view), **streaks** (cached on the player, recomputed on
lock), traits, rating history, fines, bet history, editable picture. Season awards:
golden boot, top assister, best partnership, longest streak, player of the month.

## Database

PostgreSQL (relationship- and aggregation-heavy, consistency matters, small volume).
Postgres is the single source of truth; add Redis only if live streaming or leaderboard
caching proves necessary.

### Core tables

Defined in `src/db/schema/` (one file per domain); keep this table in sync with it.

| Table | Purpose |
| --- | --- |
| `users` | Login identity; role (manager / organizer / super admin) |
| `players` | Player profile, picture, bio, current rating, price, cached streak |
| `traits`, `player_traits` | Trait catalog (name, category) and links; editable by super admin only |
| `player_ratings` | Rating history per player per gameweek |
| `seasons` | Season grouping; start/end |
| `gameweeks` | Weekly game day: `kickoffAt` (lock and lineup deadline are derived from it), locked flag |
| `attendances` | RSVP status and confirmed-attended flag per player per gameweek |
| `matches` | Matches within a gameweek |
| `game_day_teams`, `game_day_team_players` | Ephemeral teams and their members |
| `match_events` | Goal / assist / save / key tackle; client UUID; voided flag; links assist to goal (DB checks: an assist always has a goal, one live assist per goal) |
| `event_audit_logs` | Who changed what and when, before/after |
| `violation_types` | Catalog of fineable violations with default deduction |
| `fines` | Manual deductions: player, gameweek, violation, points, issuer, void state |
| `fantasy_squads`, `fantasy_squad_players` | A manager's persistent 6-player roster for a season |
| `fantasy_lineups`, `fantasy_lineup_players` | Per-gameweek snapshot frozen at the lock: starter/bench slot, bench order, captain, cached points |
| `transfers` | Transfer history; unique per squad per gameweek enforces the 1-transfer limit |
| `bets` | Points-based bets and resolution |

## Tech stack (local-first)

| Layer | Choice | Why |
| --- | --- | --- |
| Database | PostgreSQL, self-hosted | Matches schema decision |
| App | **Next.js (App Router) full-stack**, TypeScript | One deployable; route handlers and server actions replace a separate Express/Fastify API, so validation lives in one place |
| ORM | **Drizzle ORM** (`pg` driver) + drizzle-kit | Schema is plain TypeScript in `src/db/schema/`; migrations are SQL files in `drizzle/`; no engine binaries to download, so it works on locked-down networks |
| Live scoring | Same app, mobile PWA route with offline queue | No separate native app |
| Validation | Zod, shared by client and server | Single source of truth for input rules |
| Auth | Own minimal session auth: email + password (scrypt from Node's `crypto`), sessions in the `sessions` table, cookie holds a random token and the database stores only its SHA-256 hash | Enough at this scale, no extra dependency; the role is read fresh on every request so role changes apply immediately |
| Tests | Vitest | Fast unit tests for scoring/fines/rating logic |
| Hosting | Homelab behind a tunnel (Cloudflare Tunnel or Tailscale); VPS as fallback | Near-zero cost |
| Backups | Automated nightly `pg_dump` to a second location | Losing a season of stats is unacceptable |

## Deferred (scoped out for now, to reinstate later)

These were designed and then deliberately removed from phase 1. They are not in the
schema or code; reinstating them means the changes noted.

- **Trait-based team sorting.** Exclusive-category traits (no two last-man defenders on
  one team, except special games). Needs an `isExclusive` flag on traits and an
  `isSpecial` flag on matches.
- **Auto-balance and captains' draft.** Auto-balance spreads exclusive-trait players
  first, then evens out summed rating, with a balance score; the draft is snake-order
  with captains. Trait weighting for the balance was never defined.
- **Automatic violation and card events.** D violations and yellow/red cards as live
  events with automatic penalties. Needs the `D_VIOLATION`, `YELLOW_CARD`, `RED_CARD`
  event types, point values, and a rule for avoiding double penalties with fines.

## Open items (confirm before building the dependent feature)

- [ ] Point values: clean sheet band, saves/tackles, MOTM
- [ ] Late drop-outs after the lock: stay on their team and play short, or may the
      organizer substitute someone (and who may do that after the lock)?
- [ ] Rating constants and price mapping are first defaults (step 8); tune after real games. Ratings are not recomputed if a fine or override changes after the lock
- [ ] A squad created after a gameweek locks does not score it; confirm that is acceptable
- [ ] Bet starting balance and stake/payout mechanics
- [ ] WhatsApp integration approach: manual share links and result card are built; Business API (automatic RSVP polls, "teams are set" at the lock) is not. Confirm whether to pay for it
- [ ] Organizer RSVP/attendance changes are not audited yet (add when the audit log is built, step 5)
- [ ] Scoring screen: assists can only be added right after a goal; add a way to add a missed assist or event during reconciliation?
- [ ] The cached scoring page stays on the phone after sign-out (it holds that match's roster only); clear it on logout if shared phones are a concern
- [ ] Who counts as having played: currently marked attended OR has an event in the match (an event proves presence). Team bonus and match count use this. Confirm, or require organizers to mark attendance for everyone?
- [ ] Auto-sub bench priority rule when several bench players attended (default: bench order)
- [ ] Profile picture storage (local disk on the homelab vs. a hosted service); the profile has no picture upload until decided
- [ ] Password reset: recommended approach is organizer-issued one-time reset links (same mechanism as invites, no email/SMS service needed); build when first needed
- [ ] Before exposing the site to the public internet: serve over HTTPS (Caddy/Cloudflare Tunnel), add per-IP rate limiting at the proxy, and tighten the CSP with nonces
- [ ] Phone verification by SMS/WhatsApp OTP is not planned: the invite link already proves the organizer knows the person

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the app (needs `.env`; copy `.env.example`) |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | After editing `src/db/schema/`, write a new SQL migration into `drizzle/` (no database needed) |
| `npm run db:migrate` | Apply pending migrations to the database in `DATABASE_URL` |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run test:db` | Integration tests against the real Postgres in `DATABASE_URL` (`*.int.test.ts`; each test rolls back its changes) |
| `npm run admin:create -- "Name" email phone` | Create the first super admin (asks for the password; registration is invite-only so nobody can invite the first user) |
| `npm run admin:promote -- <email> [ROLE]` | Change a user's role (default `SUPER_ADMIN`) |

The first migration (`drizzle/0000_init.sql`, 21 tables) is generated and committed.
To set up a fresh machine:

```bash
cp .env.example .env          # default URL matches docker-compose.yml
docker compose up -d          # Postgres 16 on localhost:5432
npm install
npm run db:migrate
```

Without Docker, any local Postgres works: create a database and point `DATABASE_URL`
in `.env` at it. Never edit an applied migration; change the schema and run
`npm run db:generate` to add a new one.

## Build order

1. Repo, tooling, Drizzle schema + first migration, shared constants (done)
2. Auth, roles (incl. super admin) + player profiles; trait editing (super admin only)
   (done; profile picture upload waits on the storage decision in Open items)
3. Seasons, gameweeks, RSVP/attendance
   (done: organizers create seasons and gameweeks at `/admin/calendar` (kick-off entered in Nairobi time); players RSVP at `/gameweeks/[id]` until the 3-hour lock; organizers can set anyone's RSVP at any time and mark who attended)
4. Manual team sorting with the 3-hour lock
   (done: `/gameweeks/[id]/teams`; organizers add matches and move Going players between Team A/B until the lock, everyone can view; copy-teams-between-matches and renaming teams are not built)
5. Live scoring PWA (offline queue, undo) + reconciliation + audit log + locking
   (done: `/matches/[id]` (score, event log, claim scoring, reconcile, lock gameweek, audit log for organizers) and `/matches/[id]/score` (offline-first scoring screen; queue and last server snapshot kept in localStorage, `public/sw.js` caches the page and static assets, installable via `public/manifest.webmanifest`). Rules live in `src/server/scoring.ts` and the pure `src/lib/match-events.ts`. Not built yet: adding a missed assist/event during reconciliation, save/tackle scoring points)
6. Scoring engine (goal, assist, goal-diff bonus first; TBD values wired as set)
   (done: `src/server/points.ts` computes player points from events, attendance and fines on every request (nothing stored), via `breakdownMatch` in `src/lib/scoring/engine.ts`. Pages: `/gameweeks/[id]/points` (provisional until the gameweek is locked), `/leaderboard` (season player points), season stats on profiles. Save and key-tackle points stay 0 until decided)
7. Fines: violation catalog seed, issue/void flow, applied to gameweek scores
   (done: `src/server/fines.ts`; organizers load the standard violations and edit the catalog at `/admin/violations`, issue and void fines at `/gameweeks/[id]/fines`; fines show on profiles and feed the points page. Fines can still be issued after a gameweek is locked (organizers only, who and when are recorded); they are not in the event audit log)
8. Ratings update, fantasy squads, auto-sub, captain, transfers, leaderboards (done)
9. Partnerships, streaks, awards, WhatsApp notifications and result cards
   (done, minus automatic WhatsApp sending: `src/server/stats.ts` computes partnerships (assist→goal pairs) and season awards on demand (golden boot, top assister, best partnership, longest streak, player of the month = latest month), shown at `/awards` and on profiles. Streak counting is `players.currentStreak` (updated at lock) and `longestStreak` over played gameweeks. Sharing needs no integration: a match page has a wa.me link with a text summary (`src/lib/share.ts`) and a PNG result card at `/api/matches/[id]/card` (next/og; no emoji, they make it fetch a font from the internet). Automatic RSVP polls and "teams are set" messages wait on the WhatsApp decision)
10. Betting
