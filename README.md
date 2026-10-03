# Survivor Fantasy League

A static scoreboard for our Survivor league: standings, itemized episode
results, castaways, and rules. Plain HTML, Bootstrap 5, and vanilla JS, with no
build step and no backend. Game design and scoring rules: [docs/DESIGN.md](docs/DESIGN.md).

## Project layout
```
public/                 ← everything the website serves
  index.html            ← Standings (home)
  episodes.html         ← Episode dashboards and results (?ep=3 for a specific episode)
  castaways.html        ← Castaway photo grid
  castaway.html         ← One castaway's page (?id=rob)
  rules.html            ← Scoring rules (generated from scoring.js)
  css/theme.css         ← Bootstrap overrides
  js/data.js            ← season data: the only file you edit weekly
  js/scoring.js         ← scoring engine (pure logic, shared by all pages and tests)
  js/ui.js, js/nav.js   ← shared display helpers and header
  js/home.js, ...       ← one script per page
tests/scoring.test.js   ← scoring tests (includes a check that data.js is valid)
```

## Run it locally
Open `public/index.html` in a browser. That's it.

Run the tests (Node 16+):
```sh
node tests/scoring.test.js
```

## Weekly routine
1. **Before the episode:** collect picks by text/DM before 8 PM ET.
2. **After the episode:** in `public/js/data.js`, fill in that episode's `picks`
   and `events`, then add the next episode (number, title, `airsAt`, no `events`).
   `airsAt` is Eastern time with its offset: `-04:00` until daylight saving
   ends (Nov 1, 2026), `-05:00` after.
3. Run `node tests/scoring.test.js`. It fails on typos like unknown castaway ids.
4. Open `public/index.html` locally to eyeball the results.
5. Commit and push. The live site updates in about a minute.

A player left out of `picks` scores zero that week (picks don't carry over).

### Events
Enter events **in the order they happened**. Order matters: tribe events
credit whoever is on the tribe at that moment, and phases depend on how many
castaways are left.

| Event | Example | Notes |
|---|---|---|
| Immunity | `{ type: "immunity", tribe: "savu" }` or `{ type: "immunity", castaway: "kilby" }` | Tribe or individual |
| Reward | `{ type: "reward", tribe: "toka" }` or `{ type: "reward", castaway: "ana" }` | Tribe reward or individual reward win |
| Chosen for reward | `{ type: "rewardGuest", castaways: ["ori", "rob"] }` | |
| Found advantage | `{ type: "advantage", castaway: "jelly" }` | Idols, extra votes, journey prizes |
| Votes against | `{ type: "votesAgainst", castaway: "jenna", count: 2 }` | Votes that counted |
| Idol cancels votes | `{ type: "idolCancel", castaway: "devin", count: 4 }` | Credited to the castaway the idol protected; don't also enter those votes as votes against |
| Voted out | `{ type: "votedOut", castaway: "aaliyah" }` | Also use for fire-making losses. Add `withIdol: true` if they left with an idol in their pocket (double penalty) |
| Left the game | `{ type: "leftGame", castaway: "rob" }` | Quit / medevac: no points either way |
| Tribe swap | `{ type: "moveTribe", castaways: ["lewis", "ori"], tribe: "toka" }` | `tribe` is where they move to; one event per destination tribe |
| Individual game starts | `{ type: "individualGame" }` | Add once, at the point immunity becomes individual |
| Merge | `{ type: "moveTribe", castaways: [...everyone left], tribe: "kiyu" }` | See **The merge** below |
| Winner | `{ type: "soleSurvivor", castaway: "..." }` | Finale only; triggers the winner bonus |

### The merge
Everyone stays in a tribe after the merge:
1. Add the merged tribe to `tribes` (`id`, `name`, `color`).
2. Enter one `moveTribe` with every castaway still in the game, then
   `{ type: "individualGame" }`.

The site shows the merge at the top of that episode and the tribe once on the
Castaways page. If the merged tribe isn't named yet, use a placeholder such as
`{ id: "merged", name: "Merged", color: "#2E9E8F" }` and change only its `name`
and `color` once it's named. Every page looks tribes up by `id`, so the new name
shows everywhere, past episodes included.

Shortcuts and overrides:
- **Tribe with exceptions:** `{ type: "immunity", tribe: "savu", except: ["ori"] }`
- **Several castaways:** use `castaways: [...]` instead of `castaway` on any
  event except `soleSurvivor`.
- **Phase override:** add `phase: "tribe" | "individual" | "final5"` to any event.
- **Survived** points are never entered. They're added for everyone still in at
  the end of each episode.

## Deploy (Render static site)
1. In Render: **New → Static Site** and connect this GitHub repo.
2. **Build command:** leave empty. **Publish directory:** `public`
3. Create it. Every push to `main` redeploys automatically.
