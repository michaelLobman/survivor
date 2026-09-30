// Run with: node tests/scoring.test.js
const assert = require("assert");
const { scoreSeason } = require("../public/js/scoring.js");
const LEAGUE = require("../public/js/data.js");

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// A league with `size` castaways split across tribes "a" and "b" (c1, c2, ...).
function league({ size = 10, players = ["p1", "p2"], episodes = [] } = {}) {
  return {
    players: players.map((id) => ({ id, name: id })),
    tribes: [{ id: "a" }, { id: "b" }],
    castaways: Array.from({ length: size }, (_, i) => ({
      id: `c${i + 1}`,
      name: `Castaway ${i + 1}`,
      tribe: i < size / 2 ? "a" : "b",
    })),
    episodes: episodes.map((ep, i) => ({ number: i + 1, airsAt: "2026-01-01T20:00:00-05:00", ...ep })),
  };
}

const bootEvents = (cid, votes) => [
  { type: "votesAgainst", castaway: cid, count: votes },
  { type: "votedOut", castaway: cid },
];

function playerTotal(result, episodeNumber, pid) {
  return result.episodes.find((e) => e.number === episodeNumber).playerPoints[pid].total;
}

// Worked examples from the design session (docs/DESIGN.md)
test("tribe immunity + survived in the tribe game = +15", () => {
  const result = scoreSeason(
    league({
      episodes: [{ picks: { p1: "c1" }, events: [{ type: "immunity", tribe: "a" }, ...bootEvents("c10", 4)] }],
    }),
  );
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(playerTotal(result, 1, "p1"), 15);
});

test("individual immunity + survived at final 5 = +45", () => {
  const result = scoreSeason(
    league({
      size: 5,
      episodes: [
        {
          picks: { p1: "c1" },
          events: [{ type: "individualGame" }, { type: "immunity", castaway: "c1" }, ...bootEvents("c5", 3)],
        },
      ],
    }),
  );
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(playerTotal(result, 1, "p1"), 45);
});

test("voted out in the tribe game with 4 votes = -38", () => {
  const result = scoreSeason(league({ episodes: [{ picks: { p1: "c10" }, events: bootEvents("c10", 4) }] }));
  assert.strictEqual(playerTotal(result, 1, "p1"), -38);
});

test("voted out with 6 left is individual game (-20); survivors of that boot are final 5", () => {
  const result = scoreSeason(
    league({
      size: 6,
      episodes: [{ picks: { p1: "c6", p2: "c1" }, events: [{ type: "individualGame" }, ...bootEvents("c6", 1)] }],
    }),
  );
  assert.strictEqual(playerTotal(result, 1, "p1"), -20 - 2);
  assert.strictEqual(playerTotal(result, 1, "p2"), 15);
});

test("idol cancels and votes against are flat per vote", () => {
  const result = scoreSeason(
    league({
      size: 6,
      episodes: [
        {
          picks: { p1: "c1" },
          events: [
            { type: "individualGame" },
            { type: "idolCancel", castaway: "c1", count: 3 },
            { type: "votesAgainst", castaway: "c1", count: 1 },
            ...bootEvents("c6", 4),
          ],
        },
      ],
    }),
  );
  assert.strictEqual(playerTotal(result, 1, "p1"), 15 - 2 + 15);
});

test("phase override on an event wins over the derived phase", () => {
  const result = scoreSeason(
    league({ episodes: [{ picks: { p1: "c1" }, events: [{ type: "immunity", castaway: "c1", phase: "individual" }] }] }),
  );
  assert.strictEqual(playerTotal(result, 1, "p1"), 20 + 5);
});

test("rewards: tribe, individual, and chosen guests score differently", () => {
  const result = scoreSeason(
    league({
      episodes: [
        { picks: { p1: "c1", p2: "c6" }, events: [{ type: "reward", tribe: "a" }] },
        {
          picks: { p1: "c1", p2: "c6" },
          events: [{ type: "reward", castaway: "c1" }, { type: "rewardGuest", castaways: ["c6"] }],
        },
      ],
    }),
  );
  assert.strictEqual(playerTotal(result, 1, "p1"), 3 + 5);
  assert.strictEqual(playerTotal(result, 1, "p2"), 5);
  assert.strictEqual(playerTotal(result, 2, "p1"), 8 + 5);
  assert.strictEqual(playerTotal(result, 2, "p2"), 4 + 5);
});

// Picks
test("missed pick carries over the previous pick", () => {
  const result = scoreSeason(league({ episodes: [{ picks: { p1: "c1" }, events: [] }, { events: [] }] }));
  assert.deepStrictEqual(result.episodes[1].picks.p1, { castaway: "c1", carried: true });
  assert.strictEqual(playerTotal(result, 2, "p1"), 5);
});

test("carryover lapses when the previous pick is out", () => {
  const result = scoreSeason(league({ episodes: [{ picks: { p1: "c1" }, events: bootEvents("c1", 5) }, { events: [] }] }));
  assert.strictEqual(result.episodes[1].picks.p1, null);
  assert.strictEqual(playerTotal(result, 2, "p1"), 0);
});

// Tribes
test("tribe events use the roster at that moment, minus exceptions", () => {
  const result = scoreSeason(
    league({
      players: ["p1", "p2", "p3"],
      episodes: [
        {
          picks: { p1: "c6", p2: "c2", p3: "c3" },
          events: [
            { type: "moveTribe", castaway: "c6", tribe: "a" },
            { type: "immunity", tribe: "a", except: ["c2"] },
            { type: "moveTribe", castaway: "c3", tribe: "b" },
          ],
        },
      ],
    }),
  );
  assert.deepStrictEqual(result.errors, []);
  assert.strictEqual(playerTotal(result, 1, "p1"), 15);
  assert.strictEqual(playerTotal(result, 1, "p2"), 5);
  assert.strictEqual(playerTotal(result, 1, "p3"), 15);
  assert.strictEqual(result.castaways.c3.tribe, "b");
});

test("timeline records who each event credited, with tribes expanded", () => {
  const result = scoreSeason(
    league({
      size: 4,
      episodes: [
        {
          events: [
            { type: "moveTribe", castaway: "c3", tribe: "a" },
            { type: "immunity", tribe: "a", except: ["c2"] },
            { type: "votesAgainst", castaway: "c4", count: 3 },
          ],
        },
      ],
    }),
  );
  assert.deepStrictEqual(result.episodes[0].timeline, [
    { type: "moveTribe", castaways: ["c3"], tribe: "a", count: null, points: null },
    { type: "immunity", castaways: ["c1", "c3"], tribe: "a", count: null, points: 30 }, // 4 left: final 5
    { type: "votesAgainst", castaways: ["c4"], tribe: null, count: 3, points: -6 },
  ]);
});

// Sole Survivor bonus and standings
test("winner bonus pays castaways-at-lock for every pick of the winner, in the finale", () => {
  const result = scoreSeason(
    league({
      size: 4,
      episodes: [
        { picks: { p1: "c1", p2: "c2" }, events: bootEvents("c4", 3) },
        { picks: { p2: "c1" }, events: [...bootEvents("c3", 2), { type: "soleSurvivor", castaway: "c1" }] },
      ],
    }),
  );
  const finale = result.episodes[1].playerPoints;
  assert.ok(finale.p1.items.some((i) => i.rule === "soleSurvivor" && i.points === 4));
  assert.ok(finale.p1.items.some((i) => i.rule === "soleSurvivor" && i.points === 3));
  assert.ok(finale.p2.items.some((i) => i.rule === "soleSurvivor" && i.points === 3));
  assert.strictEqual(result.standings[0].player.id, "p1");
  assert.strictEqual(result.standings[0].winnerPicks, 2);
});

test("ties break on winner picks, then best episode; exact ties share a rank", () => {
  const result = scoreSeason(
    league({ players: ["p1", "p2", "p3"], episodes: [{ picks: { p1: "c1", p2: "c2", p3: "c10" }, events: [] }] }),
  );
  const ranks = Object.fromEntries(result.standings.map((r) => [r.player.id, r.rank]));
  assert.deepStrictEqual(ranks, { p1: 1, p2: 1, p3: 1 });
});

test("standings movement compares with the previous episode", () => {
  const result = scoreSeason(
    league({
      episodes: [
        { picks: { p1: "c1", p2: "c6" }, events: [{ type: "immunity", tribe: "a" }] },
        { picks: { p1: "c1", p2: "c6" }, events: [{ type: "immunity", castaway: "c6", phase: "final5" }] },
      ],
    }),
  );
  const p2 = result.standings.find((r) => r.player.id === "p2");
  assert.strictEqual(p2.rank, 1);
  assert.strictEqual(p2.movement, 1);
});

test("no movement when the previous standings were a complete tie", () => {
  const result = scoreSeason(
    league({ episodes: [{ events: [] }, { picks: { p1: "c1", p2: "c6" }, events: [{ type: "immunity", tribe: "a" }] }] }),
  );
  assert.ok(result.standings.every((row) => row.movement === null));
});

// Data errors
test("reports unknown ids, bad counts, and picks of eliminated castaways", () => {
  const result = scoreSeason(
    league({
      episodes: [
        { picks: { p1: "c1" }, events: [...bootEvents("c1", 5), { type: "votesAgainst", castaway: "zed", count: 1 }] },
        {
          picks: { p1: "c1", ghost: "c2" },
          events: [{ type: "votesAgainst", castaway: "c2" }, { type: "immunty", castaway: "c2" }],
        },
      ],
    }),
  );
  const joined = result.errors.join("\n");
  assert.match(joined, /unknown castaway "zed"/);
  assert.match(joined, /unknown player "ghost"/);
  assert.match(joined, /picked "c1", who is already out/);
  assert.match(joined, /needs a positive whole-number "count"/);
  assert.match(joined, /event 2 \(immunty\): unknown event type/);
});

// The real season data must always be valid.
test("public/js/data.js has no data errors", () => {
  assert.deepStrictEqual(scoreSeason(LEAGUE).errors, []);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}\n    ${err.message.split("\n").join("\n    ")}`);
  }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
