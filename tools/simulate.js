// Replays real seasons (tools/seasons) through the live scoring engine with seven
// simulated pickers, to see how close and how skill-driven the league stays.
//
//   node tools/simulate.js              current rules: comebacks, skill, where gaps come from
//   node tools/simulate.js --variants   also compare ideas layered on top of the rules
//   node tools/simulate.js --runs 200   fewer runs per season (default 1000) for a quick look
//
// To test a change to the rules themselves (points, multipliers, the bonus), edit
// public/js/scoring.js, run this, and compare with the numbers from before the edit.
// Picks are simulated, so treat results as directional: compare rule sets, don't
// read any single number as a prediction.
const fs = require("fs");
const path = require("path");
const { scoreSeason } = require("../public/js/scoring.js");

// --- Setup -------------------------------------------------------------------

const args = process.argv.slice(2);
const SHOW_VARIANTS = args.includes("--variants");
const runsFlag = args.indexOf("--runs");
const RUNS = runsFlag === -1 ? 1000 : Number(args[runsFlag + 1]);
if (!Number.isInteger(RUNS) || RUNS < 1) {
  console.error("--runs needs a positive whole number, e.g. --runs 200");
  process.exit(1);
}

// Seeded, so every run of the script (and every variant) sees the same picks.
function createRandom(seed) {
  let state = seed;
  return () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
}

const SEASONS = fs
  .readdirSync(path.join(__dirname, "seasons"))
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => require(path.join(__dirname, "seasons", file)));

// A friends league: casual fans who read the game a little better or worse than each
// other (`read`: 0 = coin flip, 1 = knows who goes deep), one who chases last week's
// top scorer, and one who sticks with a favorite until they're out.
const PICKERS = [
  { id: "read .25", read: 0.25 },
  { id: "read .30", read: 0.3 },
  { id: "read .35", read: 0.35 },
  { id: "read .40", read: 0.4 },
  { id: "read .45", read: 0.45 },
  { id: "chaser", chaser: true },
  { id: "loyal", read: 0.35, loyal: true },
];

// --- One simulated season ----------------------------------------------------

// Castaways in the game when each episode's picks lock.
function rostersAtLock(season) {
  let active = season.league.castaways.map((c) => c.id);
  return season.league.episodes.map((episode) => {
    const atLock = active;
    const gone = episode.events.filter((ev) => ev.type === "votedOut" || ev.type === "leftGame").map((ev) => ev.castaway);
    active = active.filter((id) => !gone.includes(id));
    return atLock;
  });
}

// What each castaway scored each week (the chaser looks at last week's).
function castawayWeekly(season) {
  return scoreSeason(season.league).episodes.map((e) => Object.fromEntries(Object.entries(e.castawayPoints).map(([id, s]) => [id, s.total])));
}

function makePicks(season, rosters, weekly, random) {
  const n = season.league.castaways.length;
  const quality = (id) => 1 - (season.place[id] - 1) / (n - 1);
  const pickAny = (ids) => ids[Math.floor(random() * ids.length)];
  const favorite = {};
  return rosters.map((active, week) => {
    const picks = {};
    for (const picker of PICKERS) {
      if (picker.chaser && week > 0) {
        const score = (id) => weekly[week - 1][id] ?? -Infinity;
        const best = Math.max(...active.map(score));
        picks[picker.id] = pickAny(active.filter((id) => score(id) === best));
        continue;
      }
      if (picker.loyal && active.includes(favorite[picker.id])) {
        picks[picker.id] = favorite[picker.id];
        continue;
      }
      const read = picker.read ?? 0;
      const appeal = (id) => read * quality(id) + (1 - read) * random();
      const choice = active.map((id) => [appeal(id), id]).sort((a, b) => b[0] - a[0])[0][1];
      if (picker.loyal) favorite[picker.id] = choice;
      picks[picker.id] = choice;
    }
    return picks;
  });
}

// Each picker's weekly points, split into the pick's own points and the winner bonus.
function weeklyScores(season, picks) {
  const league = {
    ...season.league,
    players: PICKERS.map((p) => ({ id: p.id, name: p.id })),
    episodes: season.league.episodes.map((episode, i) => ({ ...episode, picks: picks[i] })),
  };
  const result = scoreSeason(league);
  if (result.errors.length) throw new Error(`Season ${season.season}: ${result.errors[0]}`);
  return {
    result,
    weeks: PICKERS.map((p) =>
      result.episodes.map((e) => {
        const items = e.playerPoints[p.id].items;
        const bonus = items.filter((item) => item.rule === "soleSurvivor").reduce((sum, item) => sum + item.points, 0);
        return { base: e.playerPoints[p.id].total - bonus, bonus };
      }),
    ),
  };
}

// --- Ideas layered on top of the rules (--variants) ----------------------------

const reshape = (fn) => (weeks) => weeks.map((w) => w.map(fn));
const VARIANTS = {
  "Current rules": null,
  "Weekly floor −10": reshape((x) => ({ ...x, base: Math.max(-10, x.base) })),
  "Sole Survivor bonus ×2 (on top)": reshape((x) => ({ ...x, bonus: x.bonus * 2 })),
  "Double-points finale": (weeks) => weeks.map((w) => w.map((x, i) => (i === w.length - 1 ? { ...x, base: x.base * 2 } : x))),
};

// --- Measuring ---------------------------------------------------------------

const CHECKPOINTS = ["at merge", "mid-merge", "pre-finale"];

function checkpointWeeks(season) {
  const last = season.league.episodes.length;
  const merge = season.mergeEpisode - 1;
  return { "at merge": merge, "mid-merge": Math.round((merge + last - 1) / 2), "pre-finale": last - 1 };
}

function runVariant(reshapeWeeks) {
  const random = createRandom(7);
  const stats = {
    runs: 0,
    spread: 0,
    leaderLost: 0,
    wins: Object.fromEntries(PICKERS.map((p) => [p.id, 0])),
    lastTop2: Object.fromEntries(CHECKPOINTS.map((c) => [c, 0])),
    gapByRule: {},
  };
  for (const season of SEASONS) {
    const rosters = rostersAtLock(season);
    const weekly = castawayWeekly(season);
    const at = checkpointWeeks(season);
    for (let run = 0; run < RUNS; run++) {
      const { result, weeks: raw } = weeklyScores(season, makePicks(season, rosters, weekly, random));
      const weeks = reshapeWeeks ? reshapeWeeks(raw) : raw;
      const totalAfter = (i, k) => weeks[i].slice(0, k).reduce((sum, x) => sum + x.base + x.bonus, 0);
      const finals = PICKERS.map((_, i) => totalAfter(i, weeks[i].length));
      const finalRank = finals.map((t) => finals.filter((x) => x > t).length); // 0 = first; ties share
      const top = Math.max(...finals);
      const champions = PICKERS.filter((_, i) => finals[i] === top);
      champions.forEach((p) => (stats.wins[p.id] += 1 / champions.length));
      stats.spread += top - Math.min(...finals);
      stats.runs++;

      for (const c of CHECKPOINTS) {
        const totals = PICKERS.map((_, i) => totalAfter(i, at[c]));
        const lowest = Math.min(...totals);
        const last = totals.map((t, i) => [t, i]).filter(([t]) => t === lowest).map(([, i]) => i);
        if (finalRank[last[Math.floor(random() * last.length)]] <= 1) stats.lastTop2[c]++;
      }
      const pre = PICKERS.map((_, i) => totalAfter(i, at["pre-finale"]));
      if (finalRank[pre.indexOf(Math.max(...pre))] !== 0) stats.leaderLost++;

      // Where the final gap comes from: leader minus last place, by rule.
      if (!reshapeWeeks) {
        const byRule = PICKERS.map((p) => {
          const m = {};
          result.episodes.forEach((e) => e.playerPoints[p.id].items.forEach((it) => (m[it.rule] = (m[it.rule] || 0) + it.points)));
          return m;
        });
        const leader = finals.indexOf(top);
        const lastPlace = finals.indexOf(Math.min(...finals));
        for (const rule of new Set([...Object.keys(byRule[leader]), ...Object.keys(byRule[lastPlace])])) {
          stats.gapByRule[rule] = (stats.gapByRule[rule] || 0) + (byRule[leader][rule] || 0) - (byRule[lastPlace][rule] || 0);
        }
      }
    }
  }
  return stats;
}

// --- Report ------------------------------------------------------------------

const pct = (n, of) => `${Math.round((100 * n) / of)}%`;
const pad = (text, width) => String(text).padEnd(width);

function report() {
  console.log(`${SEASONS.length} seasons (${SEASONS.map((s) => s.season).join(", ")}), ${RUNS} runs each, ${PICKERS.length} pickers\n`);
  const current = runVariant(null);

  console.log("Last place → finishes top 2 (with 7 equal players, pure luck would be 29%)");
  for (const c of CHECKPOINTS) console.log(`  ${pad(c, 12)} ${pct(current.lastTop2[c], current.runs)}`);
  console.log(`Pre-finale leader loses the title: ${pct(current.leaderLost, current.runs)}`);
  console.log(`Average final gap, 1st to last:  ${Math.round(current.spread / current.runs)}`);

  console.log("\nWin share by picker (skill should matter, but not decide everything)");
  for (const p of PICKERS) console.log(`  ${pad(p.id, 10)} ${pct(current.wins[p.id], current.runs)}`);

  console.log("\nWhere the final gap comes from (leader minus last place, by rule)");
  const gap = Object.entries(current.gapByRule).map(([rule, sum]) => [rule, sum / current.runs]);
  const totalGap = gap.reduce((sum, [, v]) => sum + v, 0);
  gap
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .filter(([, v]) => Math.abs(v) >= 0.5)
    .forEach(([rule, v]) => console.log(`  ${pad(rule, 22)} ${String(Math.round(v)).padStart(4)}  (${pct(v, totalGap)})`));

  if (!SHOW_VARIANTS) return;
  console.log("\nIdeas on top of the current rules");
  console.log(`  ${pad("variant", 34)} ${pad("last → top 2 (merge/mid/pre)", 30)} leader loses   gap   best / worst picker wins`);
  for (const [name, reshapeWeeks] of Object.entries(VARIANTS)) {
    const s = reshapeWeeks ? runVariant(reshapeWeeks) : current;
    const comeback = CHECKPOINTS.map((c) => pct(s.lastTop2[c], s.runs)).join(" / ");
    const skill = `${pct(s.wins["read .45"], s.runs)} / ${pct(s.wins["read .25"], s.runs)}`;
    console.log(`  ${pad(name, 34)} ${pad(comeback, 30)} ${pad(pct(s.leaderLost, s.runs), 14)} ${pad(Math.round(s.spread / s.runs), 5)} ${skill}`);
  }
}

report();
