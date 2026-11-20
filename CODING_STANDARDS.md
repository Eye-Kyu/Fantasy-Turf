# Coding Standards

Engineering conventions for this project. Read alongside `CLAUDE.md` (the product/
architecture spec). This file governs *how* code gets written; `CLAUDE.md` governs
*what* gets built. When they conflict on process, this file wins for code-level
decisions.

## Guiding principle

Optimize for the next person reading this code — including future-you, and Claude
Code in a later session with no memory of this one. Prefer boring, obvious code over
clever code. If a reviewer has to pause to understand *why* a line exists, it needs a
comment; if they have to pause to understand *what* it does, it needs to be rewritten
more simply.

## No redundant code

- **DRY, but not prematurely.** Extract a shared function/module once the same logic
  appears a third time (rule of three), or once two copies have already drifted and
  caused a bug. Two similar-looking blocks that will likely evolve differently (e.g.
  two validation rules that happen to match today) can stay separate.
- **No dead code.** Delete unused functions, commented-out blocks, unused imports,
  and unreferenced variables before committing — don't leave them "in case." Git
  history is the archive, not the source tree.
- **No duplicate logic across layers.** Validation, scoring math, and formatting
  rules live in exactly one place (e.g. the scoring engine owns point calculations —
  the frontend never re-implements it, only displays the result).
- **Single source of truth for constants.** Point values, squad size, transfer
  limits, etc. (see `CLAUDE.md`) are defined once — as DB-backed config or a shared
  constants module — and imported everywhere they're used, never hardcoded twice.
- **Search before writing.** Before adding a new function, grep the codebase for
  existing functionality that already does the job, and reuse or extend it rather
  than adding a parallel implementation.

## Comments

- **Comment the "why," not the "what."** Code should be self-explanatory for *what*
  it does through good naming; comments explain intent, trade-offs, and non-obvious
  reasoning — e.g. `// Goal-diff bonus checks the running score, not just full-time —
  a team that led by 2 and drew still earns it`.
- **Every exported function/module gets a short doc comment**: what it does, its
  parameters, what it returns, and any non-obvious side effects or invariants (e.g.
  "assumes the gameweek is already locked").
- **No commented-out code left in commits.** If it's not needed, delete it.
- **No noise comments.** Skip comments that just restate the line (`// increment i`
  above `i++`).
- **Flag known gaps inline.** Use `// TODO(<name>): <what and why>` for deliberate
  shortcuts, and cross-reference the Open Items list in `CLAUDE.md` when a TODO
  depends on an unlocked decision, e.g. `// TODO: D-violation point value is TBD, see
  CLAUDE.md Open Items — currently 0`.

## Structure and naming

- **One responsibility per function/module.** If a function's name needs "and" to
  describe it, split it.
- **Descriptive names over short ones.** `calculateGoalDifferenceBonus` beats
  `calcGDB`. Avoid abbreviations unless they're domain-standard and defined once in a
  glossary comment (e.g. `gw` for gameweek).
- **Match `CLAUDE.md`'s vocabulary exactly**, since "team" is overloaded in this
  domain: a `fantasy_squad` is a manager's persistent roster; a `game_day_team` is the
  ephemeral weekly grouping. Never call either one just "team" in code — the type/
  table name should always disambiguate.
- **Keep files small and single-purpose.** A file that mixes scoring math, DB access,
  and HTTP handling for the same feature should be split into layers (e.g.
  `scoring/engine.ts`, `scoring/repository.ts`, `routes/scoring.ts`).
- **Consistent folder shape**: group by domain concept (`players/`, `matches/`,
  `fantasy/`, `betting/`), not by technical layer alone — keeps related logic close
  together as the codebase grows.

## Database and migrations

- Every schema change ships as a migration file, never a manual edit against a
  running database.
- Foreign keys and constraints are enforced at the DB level, not just in application
  code — don't rely on the app to be the only thing that ever writes to the DB.
- Match `CLAUDE.md`'s core tables and naming (`match_events`, `fantasy_squad_players`,
  etc.) exactly; if a table needs to change shape, update `CLAUDE.md`'s schema section
  in the same change, so the spec never drifts from the implementation.

## Error handling and validation

- Fail loudly and specifically. No silent `catch` blocks that swallow errors — log or
  rethrow with context.
- Validate at the boundary (API input, form submission) rather than deep inside
  business logic, so invalid data never reaches the scoring engine or DB.
- Business rules from `CLAUDE.md` (squad size caps, transfer limits, trait exclusivity
  in game-day balancing) are enforced server-side, never trusted from the client.

## Testing

- New logic that computes something (scoring, balancing, streaks, partnerships) gets
  a unit test covering at least: the typical case, a zero/empty case, and one edge
  case drawn from the rules in `CLAUDE.md` (e.g. the goal-difference bonus triggering
  mid-match even if the final score ends level).
- Don't chase 100% coverage on trivial code (simple getters, pure UI markup); do
  cover anything that touches points, money-equivalent bet stakes, or squad/roster
  mutations.

## Version control

- Small, focused commits — one logical change per commit, with a message describing
  *why* the change was made, not just what changed.
- Never commit commented-out code, debug `console.log`/`print` statements, or secrets
  (API keys, DB credentials) — use environment variables and a `.gitignore`d `.env`.
- Before marking a feature done, re-read the diff once as a reviewer would: check for
  leftover TODOs that should have been resolved, duplicated logic that could reuse an
  existing function, and missing comments on anything non-obvious.

## Keeping this file current

If a convention here turns out to be wrong for this project, or a new one is needed,
update this file in the same change that motivated it — don't let practice and
documentation drift apart.
