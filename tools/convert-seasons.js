// Rebuilds tools/seasons/ from the survivoR dataset (MIT, © 2021 Daniel Oehm,
// https://github.com/doehm/survivoR). Only needed when adding a season.
//
// Usage: node tools/convert-seasons.js 41 50
//
// Each season becomes a league in data.js shape (castaways, tribes, episodes with
// events, no players or picks) plus what the simulator needs: the winner, the
// merge episode, and each castaway's finishing place.
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const { scoreSeason } = require("../public/js/scoring.js");

const SOURCE = "https://raw.githubusercontent.com/doehm/survivoR/master/dev/json";
const FILES = ["season_summary", "castaways", "vote_history", "challenge_results", "advantage_movement", "advantage_details"];
const CACHE = path.join(os.tmpdir(), "survivoR-json");
const OUT = path.join(__dirname, "seasons");

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${url}: HTTP ${response.statusCode}`));
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

async function loadDataset() {
  fs.mkdirSync(CACHE, { recursive: true });
  const data = {};
  for (const name of FILES) {
    const file = path.join(CACHE, `${name}.json`);
    if (!fs.existsSync(file)) {
      console.log(`Downloading ${name}.json`);
      fs.writeFileSync(file, await download(`${SOURCE}/${name}.json`));
    }
    data[name] = JSON.parse(fs.readFileSync(file, "utf8")).filter((row) => row.version === "US");
  }
  return data;
}

// Events are ordered by [episode, boots so far, stage, tiebreak]:
// challenges (stage 0), advantages found (0.5), tribal votes (1), eliminations (2), the winner (3).
function convertSeason(data, season) {
  const of = (rows) => rows.filter((row) => row.season === season);
  const summary = of(data.season_summary)[0];
  const cast = of(data.castaways);
  const votes = of(data.vote_history);
  const challenges = of(data.challenge_results);
  const moves = of(data.advantage_movement);
  const advantageType = new Map(of(data.advantage_details).map((a) => [a.advantage_id, a.advantage_type]));
  const bootOrder = new Map(cast.filter((c) => c.order).map((c) => [c.castaway_id, c.order]));

  const keyed = [];
  const add = (episode, boots, stage, tie, event) => keyed.push({ key: [episode, boots, stage, tie], event });

  // Challenges: one reward / guest / immunity event per challenge, listing who won.
  const byChallenge = new Map();
  for (const row of challenges) {
    const key = `${row.episode}|${row.challenge_id}`;
    byChallenge.set(key, [...(byChallenge.get(key) || []), row]);
  }
  for (const rows of byChallenge.values()) {
    const { episode, challenge_id: id } = rows[0];
    // A few rows place a challenge after a winner's own boot; put it before that boot.
    const winnerBoots = rows.filter((r) => r.won && bootOrder.has(r.castaway_id)).map((r) => bootOrder.get(r.castaway_id) - 1);
    const boots = Math.min(rows[0].n_boots, ...winnerBoots);
    const immune = rows.filter((r) => r.won_tribal_immunity || r.won_team_immunity || r.won_individual_immunity).map((r) => r.castaway_id);
    const reward = rows.filter((r) => r.won_tribal_reward || r.won_team_reward || r.won_individual_reward).map((r) => r.castaway_id);
    const guests = rows.filter((r) => r.chosen_for_reward && !reward.includes(r.castaway_id)).map((r) => r.castaway_id);
    if (reward.length) add(episode, boots, 0, id, { type: "reward", castaways: reward });
    if (guests.length) add(episode, boots, 0, id + 0.1, { type: "rewardGuest", castaways: guests });
    if (immune.length) add(episode, boots, 0, id + 0.2, { type: "immunity", castaways: immune });
  }

  // The individual game starts with the first individual immunity once tribes are gone.
  const firstIndividual = challenges
    .filter((r) => r.won_individual_immunity && !["Original", "Swapped"].includes(r.tribe_status))
    .sort((a, b) => a.n_boots - b.n_boots)[0];
  add(firstIndividual.episode, firstIndividual.n_boots, -1, 0, { type: "individualGame" });

  // Advantages found (a shared find lists several ids in one field).
  for (const m of moves.filter((m) => m.event === "Found" || m.event === "Found (beware)")) {
    const bootsBefore = cast.filter((c) => c.order && c.episode < m.episode).length;
    add(m.episode, bootsBefore, 0.5, m.sequence_id, { type: "advantage", castaways: m.castaway_id.split(/,\s*/) });
  }

  // Tribal councils, grouped by boot order: Shots in the Dark, idols, votes against.
  const tribals = new Map();
  for (const v of votes) tribals.set(v.order, [...(tribals.get(v.order) || []), v]);
  for (const [order, rows] of tribals) {
    const { episode } = rows[0];
    const against = {};
    const cancelled = {};
    for (const v of rows.filter((v) => v.vote_id)) {
      const bucket = v.nullified ? cancelled : against;
      bucket[v.vote_id] = (bucket[v.vote_id] || 0) + 1;
    }
    const safeShots = rows.filter((v) => v.vote_event === "Shot in the dark" && v.vote_event_outcome === "Safe").map((v) => v.castaway_id);
    for (const id of new Set(safeShots)) {
      add(episode, order - 1, 1, 0, cancelled[id] ? { type: "shotInTheDark", castaway: id, count: cancelled[id] } : { type: "shotInTheDark", castaway: id });
      delete cancelled[id];
    }
    for (const [id, count] of Object.entries(cancelled)) add(episode, order - 1, 1, 1, { type: "idolCancel", castaway: id, count });
    for (const [id, count] of Object.entries(against)) add(episode, order - 1, 1, 2, { type: "votesAgainst", castaway: id, count });
  }

  // Eliminations: voted out, fire, and rocks are votedOut; quits and medevacs are leftGame.
  const leftWithIdol = new Set(
    moves
      .filter((m) => m.event === "Voted out with advantage" && advantageType.get(m.advantage_id) === "Hidden Immunity Idol")
      .map((m) => m.castaway_id),
  );
  for (const c of cast.filter((c) => c.order && !c.finalist)) {
    const left = /Quit|Medically/.test(c.result);
    const event = { type: left ? "leftGame" : "votedOut", castaway: c.castaway_id };
    if (!left && leftWithIdol.has(c.castaway_id)) event.withIdol = true;
    add(c.episode, c.order - 1, 2, 0, event);
  }
  const winner = cast.find((c) => c.winner);
  add(winner.episode, Infinity, 3, 0, { type: "soleSurvivor", castaway: winner.castaway_id });

  keyed.sort((a, b) => a.key.reduce((diff, x, i) => diff || (x === b.key[i] ? 0 : x - b.key[i]), 0));
  const episodes = Array.from({ length: winner.episode }, (_, i) => ({
    number: i + 1,
    airsAt: "2000-01-01T20:00:00-05:00", // not used by the simulator
    events: keyed.filter((k) => k.key[0] === i + 1).map((k) => k.event),
  }));

  return {
    season,
    name: summary.season_name,
    winner: winner.castaway_id,
    mergeEpisode: firstIndividual.episode,
    place: Object.fromEntries(cast.map((c) => [c.castaway_id, c.place])),
    league: {
      players: [],
      tribes: [...new Set(cast.map((c) => c.original_tribe))].map((id) => ({ id })),
      castaways: cast.map((c) => ({ id: c.castaway_id, name: c.castaway, tribe: c.original_tribe })),
      episodes,
    },
  };
}

async function main() {
  const [first, last = first] = process.argv.slice(2).map(Number);
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) {
    console.error("Usage: node tools/convert-seasons.js <first season> [last season]");
    process.exit(1);
  }
  const data = await loadDataset();
  fs.mkdirSync(OUT, { recursive: true });
  for (let season = first; season <= last; season++) {
    const converted = convertSeason(data, season);
    const { errors } = scoreSeason(converted.league);
    if (errors.length) throw new Error(`Season ${season} doesn't pass the data check:\n  ${errors.join("\n  ")}`);
    fs.writeFileSync(path.join(OUT, `s${season}.json`), `${JSON.stringify(converted)}\n`);
    console.log(`Season ${season} (${converted.name}): ${converted.league.episodes.length} episodes, saved.`);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
