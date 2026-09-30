# Survivor Fantasy League

A static scoreboard for our Survivor league: standings, itemized episode
results, castaways, and rules. Plain HTML, Bootstrap 5, and vanilla JS, with no
build step and no backend. Game design and scoring rules: [docs/DESIGN.md](docs/DESIGN.md).

## Project layout
```
public/                 ← everything the website serves
  index.html            ← Standings (home)
  episodes.html         ← Episode dashboards and results (?ep=3 for a specific episode)
  castaways.html        ← Castaway cards
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
| Voted out | `{ type: "votedOut", castaway: "aaliyah" }` | Also use for fire-making losses |
| Left the game | `{ type: "leftGame", castaway: "rob" }` | Quit / medevac: no points either way |
| Tribe swap | `{ type: "moveTribe", castaways: ["lewis", "ori"], tribe: "toka" }` | `tribe` is where they move to; one event per destination tribe |
| Individual game starts | `{ type: "individualGame" }` | Add once, at the point immunity becomes individual |
| Winner | `{ type: "soleSurvivor", castaway: "..." }` | Finale only; triggers the winner bonus |

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
