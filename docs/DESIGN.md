# Survivor Fantasy League — Design

Living record of design decisions. Implementation follows this document.

## Game overview
Each player picks one castaway per episode. Picks may repeat week to week, and
multiple players may pick the same castaway. Points come from what the picked
castaway does in that episode.

**Balance goal:** a player who backed the eventual winner early and a player who
picks well late in the season should finish close. Late-game picks are easier
(fewer choices), so they pay more per event; early conviction in the winner is
rewarded by the Sole Survivor bonus.

## Phases
Phase is attached to each **event**, not the episode (a merge or double boot can
happen mid-episode). It is derived automatically and the admin can override it.

| Phase | Defined by |
|---|---|
| Tribe game | Immunity is won by tribes (any number of tribes, swaps included) |
| Individual game | Immunity is won by individuals, 6+ castaways remain |
| Final 5 | 5 or fewer castaways remain |

## Scoring (starting ruleset)
Tiered events = base × phase multiplier. Late-weighted events use 1x / 2x / 3x;
the voted-out penalty is early-weighted (3x / 2x / 1x).

| Event | Base | Tribe | Individual | Final 5 |
|---|---|---|---|---|
| Survived episode | +5 | +5 | +10 | +15 |
| Immunity (tribe or individual) | +10 | +10 | +20 | +30 |
| Found advantage (idol, extra vote, journey prize, etc.) | +5 | +5 | +10 | +15 |
| Tribe reward win | +3 | +3 | +6 | +9 |
| Individual reward win | +8 | +8 | +16 | +24 |
| Chosen for reward | +4 | +4 | +8 | +12 |
| Voted out (early-weighted) | −10 | −30 | −20 | −10 |
| Votes against (flat) | −2 per vote | | | |
| Idol cancels votes (flat) | +5 per vote cancelled | | | |

**Sole Survivor bonus:** paid at the finale for every weekly pick of the eventual
winner, worth 1 × castaways remaining when that week's picks locked
(e.g. +18 in episode 1, +4 at the finale).

Values should be stored as data (not hard-coded) so they can be retuned.

**Calibration:** 4,000 simulated seasons shaped like Survivor 47. An "early
believer" (winner every week of the tribe game, random after) averaged 331; a
"late sharpshooter" (random early, best weekly scorer half the time after)
averaged 338; a random picker averaged 224.

## Pick rules
- **Deadline:** picks lock at the episode's East Coast air time. The app shows a
  countdown in each player's local time. Schedule changes are handled by the
  admin editing the episode's air time.
- **Missed pick:** the player's previous pick carries over if that castaway is
  still in the game; otherwise the player scores zero that week. Carried-over
  picks count toward the Sole Survivor bonus.
- **Visibility:** a player always sees their own pick; everyone's picks are
  revealed when the episode locks. (V1 shows picks as soon as they're entered;
  hiding until lock returns with accounts in V2.)

## League structure
- **Leagues:** one league for now, with the data model built to support multiple
  leagues later without a rewrite.
- **Seasons:** each season is a separate game (cast, episodes, standings,
  ruleset). Past seasons are archived and viewable; no cross-season stats.
- **Admins:** the league owner plus optional co-admins. Admins also play.
- **Safeguard:** admins can correct anything, but every change after lock is
  recorded in a change log visible to all players (who, what, when).

## Admin workflow
- **Season setup:** manual form. The admin adds each castaway (name, optional
  nickname, starting tribe, photo URL). Cast size varies by season (e.g. 18, 21);
  nothing assumes a fixed number.
- **Results entry:** one guided form per episode in show order: reward →
  immunity → tribal council (votes per castaway, idols and votes cancelled) →
  advantages found → eliminations. Castaways are selected by tapping, not typing.
  - Every section is repeatable (multiple challenges, split tribals, double
    boots, several advantages). Only the Sole Survivor is limited to one.
  - An "Other" row (castaway + any event type) covers unpredictable twists.
  - Phase is auto-filled per event and can be overridden.
  - The admin previews each player's points, then publishes.
- **Tribes:** named rosters (name + color) that the admin edits when swaps
  happen, including mid-episode. Choosing a tribe pre-selects its current
  members; the admin can add or remove individuals (Exile, sit-outs). Tribes
  exist only for entry convenience and display. Points are always stored per
  castaway, so roster edits never change past scores.
- **Corrections:** editing published results recalculates scores automatically
  and is recorded in the change log.

## Player experience
Mobile-first.
- **Home:** this week's pick card on top (current pick + countdown to lock, or a
  "Pick now" prompt), league standings below with movement since last episode.
- **Pick screen:** each castaway card shows photo, name, tribe badge, season
  points so far, this week's Sole Survivor bonus ("+14 if they win"), and the
  player's history with them (times picked, points earned). Eliminated
  castaways can't be picked.

- **Reminders:** one email on episode day to players who haven't changed their
  pick since the last episode. Players can opt out.
- **Results:** each episode page shows every player's pick with an itemized
  point breakdown (event, phase multiplier, points).
- **Tiebreak:** most picks of the eventual Sole Survivor; then highest
  single-episode score.

## Accounts
- **Sign-in:** email magic link (no passwords).
- **Joining:** admin shares an invite link; the admin can regenerate it to stop
  new joins and can remove players.

## V1: static scoreboard (current plan)
A read-only site the admin updates by hand, to be live within a day or two.
- **Stack:** plain HTML, Bootstrap 5, vanilla JS. No build step, no backend.
  Hosted as a free Render static site from this repo (static sites don't sleep).
- **Data:** JS data files in the repo (castaways, tribes, episodes). Each week
  the admin adds that episode's picks and events, commits, and pushes.
- **Admin enters events; the code scores.** Multipliers, survived points,
  carryover picks, and the Sole Survivor bonus are all computed. Final 5 is
  derived from the castaway count; the switch to the individual game is a
  one-line `individualGame` marker the admin adds at the right point (more
  reliable than guessing from the data). Any event can override its phase.
- **Quit / medevac:** removes the castaway with no points either way.
- **Picks:** collected outside the app (text/DM) and entered by the admin after
  lock, so picks are naturally hidden until published.
- **Change log:** git history.
- **Pages:** home (episode + countdown, standings with movement), episodes
  (dashboard + itemized breakdowns), castaways (cards per the pick-screen design),
  rules.
- **Data check:** validates the data on load (e.g. unknown castaway ids) and
  shows a clear error.
- **Not in V1:** accounts, in-app picking, reminders, admin form. The scoring
  engine should port to V2 nearly unchanged.
- **Repo:** same repo; the Gemini Python scaffold is removed.

## V2: full app (future)
Everything above the V1 section (accounts, in-app picks, reminders, guided
admin form) plus the stack below.

## Stack (V2)
| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript (strict) |
| UI | React-Bootstrap with a custom theme (clean, minimal, friendly) |
| Database | Supabase Postgres, local Postgres via Supabase CLI for development |
| ORM / migrations | Drizzle ORM + drizzle-kit (versioned SQL migrations in git) |
| Auth | Supabase Auth (magic links) |
| Access rules | Postgres Row Level Security (e.g. picks hidden until lock) |
| Email | Resend |
| Hosting | Vercel (git push deploys, preview URLs, cron for reminders) |
| Quality | ESLint, Prettier, unit tests for scoring, pinned dependency versions |

Scoring and game rules live in plain TypeScript modules with no framework
dependencies.

## Open questions
- V2 data model (derived from the decisions above)
