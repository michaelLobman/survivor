/*
 * Scoring engine for the Survivor fantasy league (rules: docs/DESIGN.md).
 *
 * Pure logic with no DOM access, so the same file runs in the browser
 * (as the global `Scoring`) and in Node for tests (via require).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.Scoring = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Rule tables. Frozen so no page can change the math by accident.
  // ---------------------------------------------------------------------------

  function deepFreeze(value) {
    Object.values(value).forEach((child) => typeof child === "object" && child !== null && deepFreeze(child));
    return Object.freeze(value);
  }

  // How a rule's points scale. Tiered weights ("late", "early") are also the keys
  // of each phase's multiplier in PHASES.
  const WEIGHT = deepFreeze({ LATE: "late", EARLY: "early", FLAT: "flat", BONUS: "bonus" });
  const isTiered = (weight) => weight === WEIGHT.LATE || weight === WEIGHT.EARLY;

  // Late-weighted events grow as the game tightens; early-weighted ones shrink.
  const PHASES = deepFreeze({
    tribe: { label: "Tribe game", short: "Tribe", late: 1, early: 3 },
    individual: { label: "Individual game", short: "Individual", late: 2, early: 2 },
    final5: { label: "Final 5", short: "Final 5", late: 3, early: 1 },
  });
  const FINAL_PHASE_SIZE = 5;

  // The Sole Survivor is chosen at Final Tribal Council, by which point at most this many are left.
  const MAX_FINALISTS = 3;

  const RULES = deepFreeze({
    survived: { label: "Survived episode", points: 5, weight: WEIGHT.LATE },
    immunity: { label: "Immunity", points: 10, weight: WEIGHT.LATE },
    advantage: { label: "Found advantage", points: 5, weight: WEIGHT.LATE },
    reward: { label: "Reward", points: 5, weight: WEIGHT.LATE },
    votedOut: { label: "Voted out", points: -10, weight: WEIGHT.EARLY },
    votesAgainst: { label: "Votes against", points: -2, weight: WEIGHT.FLAT, perCount: true },
    idolCancel: { label: "Idol cancels votes", points: 5, weight: WEIGHT.FLAT, perCount: true },
    shotInTheDark: { label: "Safe with Shot in the Dark", points: 5, weight: WEIGHT.FLAT },
    // `optionalCount`: the event may leave out `count` (a Shot in the Dark that cancelled no votes).
    shotInTheDarkCancel: { label: "Shot in the Dark cancels votes", points: 5, weight: WEIGHT.FLAT, perCount: true, optionalCount: true },
    optOut: { label: "Opted out of a challenge", points: -10, weight: WEIGHT.FLAT },
  });

  // Sole Survivor bonus per weekly pick = this x castaways in the game at lock.
  const SOLE_SURVIVOR_PER_CASTAWAY = 2;
  const winnerBonus = (remainingAtLock) => remainingAtLock * SOLE_SURVIVOR_PER_CASTAWAY;

  // A castaway voted out with an idol in their pocket takes this x the voted-out penalty.
  const IDOL_IN_POCKET_MULTIPLIER = 2;

  // A castaway chosen to join someone else's reward earns this share of the reward, rounded up.
  const REWARD_GUEST_SHARE = 1 / 2;
  const guestPoints = (points) => Math.ceil(points * REWARD_GUEST_SHARE);

  // Every event type the data file may use (README.md lists them with examples).
  // - `scores`: the rules a scoring event awards, in breakdown order.
  // - `state`: the event changes the game (tribes, phase, who's in) instead of scoring.
  // - `eliminates`: whoever it names leaves the game.
  // - `allowsIdol`: may carry `withIdol: true` (voted out with an idol in their pocket).
  // - `guest`: scored at REWARD_GUEST_SHARE.
  // "survived" is never entered: it is added for everyone still in at the end of each episode.
  const EVENT_TYPES = deepFreeze({
    immunity: { scores: ["immunity"] },
    reward: { scores: ["reward"] },
    rewardGuest: { scores: ["reward"], guest: true },
    advantage: { scores: ["advantage"] },
    shotInTheDark: { scores: ["shotInTheDark", "shotInTheDarkCancel"] },
    optOut: { scores: ["optOut"] },
    votedOut: { scores: ["votedOut"], eliminates: true, allowsIdol: true },
    votesAgainst: { scores: ["votesAgainst"] },
    idolCancel: { scores: ["idolCancel"] },
    moveTribe: { state: true },
    individualGame: { state: true },
    leftGame: { state: true, eliminates: true },
    soleSurvivor: { state: true },
  });

  // Every field an event may have (README.md). Anything else is a typo that would be ignored.
  const EVENT_FIELDS = new Set(["type", "castaway", "castaways", "tribe", "except", "count", "withIdol", "phase"]);

  // ---------------------------------------------------------------------------
  // Breakdown items: one line of an itemized score. Every item has the same
  // fields; ones that don't apply are null.
  // ---------------------------------------------------------------------------

  // `idolInPocket` and `guest` are kept apart from the phase multiplier so breakdowns can show each one.
  function ruleItem(ruleKey, phaseKey, { count = null, idolInPocket = false, guest = false } = {}) {
    const rule = RULES[ruleKey];
    const multiplier = rule.weight === WEIGHT.FLAT ? 1 : PHASES[phaseKey][rule.weight];
    const idolMultiplier = idolInPocket ? IDOL_IN_POCKET_MULTIPLIER : null;
    const times = rule.perCount ? count : 1;
    const points = rule.points * multiplier * (idolMultiplier || 1) * times;
    return {
      rule: ruleKey,
      label: rule.label,
      weight: rule.weight,
      phase: phaseKey,
      multiplier,
      idolMultiplier,
      guestShare: guest ? REWARD_GUEST_SHARE : null,
      count: rule.perCount ? count : null,
      points: guest ? guestPoints(points) : points,
    };
  }

  function winnerBonusItem(pickedIn) {
    return {
      rule: "soleSurvivor",
      label: `Sole Survivor bonus (Ep ${pickedIn.number} pick)`,
      weight: WEIGHT.BONUS,
      phase: null,
      multiplier: null,
      idolMultiplier: null,
      guestShare: null,
      count: null,
      points: winnerBonus(pickedIn.remainingAtLock),
    };
  }

  // Adds an item to someone's running score in `bucket` (keyed by castaway or player id).
  function addItem(bucket, id, item) {
    if (!bucket[id]) bucket[id] = { total: 0, items: [] };
    bucket[id].items.push(item);
    bucket[id].total += item.points;
  }

  const sum = (values) => values.reduce((a, b) => a + b, 0);

  // ---------------------------------------------------------------------------
  // Data checks that don't depend on replaying the season.
  // ---------------------------------------------------------------------------

  // Returns each value that appears more than once.
  function duplicates(values) {
    const seen = new Set();
    const repeated = new Set();
    for (const value of values) {
      if (seen.has(value)) repeated.add(value);
      seen.add(value);
    }
    return [...repeated];
  }

  // Mistakes in the shape of the data (not in what happened on the show).
  // `episodes` must already be sorted by number.
  function structureErrors(league, episodes) {
    const errors = [];
    for (const id of duplicates(league.players.map((p) => p.id))) errors.push(`Duplicate player id "${id}"`);
    for (const id of duplicates(league.castaways.map((c) => c.id))) errors.push(`Duplicate castaway id "${id}"`);
    for (const n of duplicates(episodes.map((ep) => ep.number))) errors.push(`Duplicate episode number ${n}`);

    for (const ep of episodes) {
      if (Number.isNaN(new Date(ep.airsAt).getTime())) {
        errors.push(`Episode ${ep.number}: airsAt "${ep.airsAt}" is not a valid date`);
      }
    }

    // Results must be entered in order: no aired episode after one still missing its events.
    const firstUpcoming = episodes.find((ep) => !Array.isArray(ep.events));
    const laterAired = firstUpcoming && episodes.find((ep) => ep.number > firstUpcoming.number && Array.isArray(ep.events));
    if (laterAired) {
      errors.push(`Episode ${firstUpcoming.number} has no events, but episode ${laterAired.number} does`);
    }
    return errors;
  }

  // ---------------------------------------------------------------------------
  // Game state: who's in, on which tribe, and which phase the game is in.
  // It changes as episodes replay in order.
  // ---------------------------------------------------------------------------

  function createGame(league, errors) {
    const game = {
      castawayById: new Map(league.castaways.map((c) => [c.id, c])),
      tribeIds: new Set(league.tribes.map((t) => t.id)),
      playerIds: league.players.map((p) => p.id),
      tribeOf: {},
      active: new Set(league.castaways.map((c) => c.id)),
      eliminatedIn: {},
      individualGame: false,
      winner: null,
      finaleNumber: null,
    };
    for (const c of league.castaways) {
      if (c.tribe && !game.tribeIds.has(c.tribe)) {
        errors.push(`Castaway "${c.id}" has unknown tribe "${c.tribe}"`);
      }
      game.tribeOf[c.id] = c.tribe || null;
    }
    return game;
  }

  function currentPhase(game) {
    if (game.active.size <= FINAL_PHASE_SIZE) return "final5";
    return game.individualGame ? "individual" : "tribe";
  }

  // ---------------------------------------------------------------------------
  // One episode. `ctx` bundles what every step needs: the game, the error list,
  // and the episode's result being built.
  // ---------------------------------------------------------------------------

  function newEpisodeResult(ep, game) {
    return {
      number: ep.number,
      title: ep.title || "",
      airsAt: new Date(ep.airsAt),
      completed: Array.isArray(ep.events),
      remainingAtLock: game.active.size,
      hasPicks: false,
      picks: {},
      castawayPoints: {},
      playerPoints: {},
      // Events as they resolved: who each one actually credited (tribes expanded).
      timeline: [],
    };
  }

  // Picks: only what was entered this week. A missed pick scores zero.
  function recordPicks(ctx, entered = {}) {
    const { game, errors, result } = ctx;
    const where = `Episode ${result.number}`;
    for (const pid of Object.keys(entered)) {
      if (!game.playerIds.includes(pid)) errors.push(`${where}: unknown player "${pid}" in picks`);
    }
    for (const pid of game.playerIds) {
      const cid = entered[pid];
      result.picks[pid] = null;
      if (!cid) continue;
      if (!game.castawayById.has(cid)) {
        errors.push(`${where}: ${pid} picked unknown castaway "${cid}"`);
        continue;
      }
      if (!game.active.has(cid)) errors.push(`${where}: ${pid} picked "${cid}", who is already out`);
      result.picks[pid] = { castaway: cid };
    }
    result.hasPicks = Object.values(result.picks).some(Boolean);
  }

  function checkCastaway(ctx, cid, at) {
    if (!ctx.game.castawayById.has(cid)) {
      ctx.errors.push(`${at}: unknown castaway "${cid}"`);
      return false;
    }
    if (!ctx.game.active.has(cid)) {
      ctx.errors.push(`${at}: "${cid}" is not in the game at this point`);
      return false;
    }
    return true;
  }

  // `castaway: "x"` and `castaways: ["x", "y"]` are interchangeable.
  const listedIds = (ev) => ev.castaways || (ev.castaway ? [ev.castaway] : []);

  // A tribe target expands to its current members, minus any exceptions.
  function resolveTargets(ctx, ev, at) {
    const { game, errors } = ctx;
    if (ev.tribe) {
      if (!game.tribeIds.has(ev.tribe)) {
        errors.push(`${at}: unknown tribe "${ev.tribe}"`);
        return [];
      }
      const except = ev.except || [];
      except.forEach((cid) => checkCastaway(ctx, cid, at));
      const members = [...game.active].filter((cid) => game.tribeOf[cid] === ev.tribe && !except.includes(cid));
      if (members.length === 0) errors.push(`${at}: tribe "${ev.tribe}" has no one in the game to credit`);
      return members;
    }
    const ids = listedIds(ev);
    if (ids.length === 0) errors.push(`${at}: needs a castaway, castaways, or tribe`);
    return ids.filter((cid) => checkCastaway(ctx, cid, at));
  }

  function eliminate(ctx, cid) {
    ctx.game.active.delete(cid);
    ctx.game.eliminatedIn[cid] = ctx.result.number;
  }

  const timelineEntry = (type, castaways, { tribe = null, count = null, points = null } = {}) => ({
    type,
    castaways,
    tribe,
    count,
    points,
  });

  // State events change the game instead of scoring. On moveTribe, `tribe`
  // is the destination, so castaways are always listed, never expanded.
  function applyStateEvent(ctx, ev, at) {
    const { game, errors, result } = ctx;
    if (ev.type === "individualGame") {
      if (game.individualGame) {
        errors.push(`${at}: the individual game has already started`);
        return;
      }
      game.individualGame = true;
      result.timeline.push(timelineEntry(ev.type, []));
      return;
    }
    const ids = listedIds(ev);
    if (ids.length === 0) {
      errors.push(`${at}: needs a castaway or castaways`);
      return;
    }
    if (ev.type === "soleSurvivor" && (ids.length !== 1 || game.winner)) {
      errors.push(`${at}: there is exactly one Sole Survivor`);
      return;
    }
    if (ev.type === "soleSurvivor" && game.active.size > MAX_FINALISTS) {
      errors.push(`${at}: ${game.active.size} castaways are still in; the Sole Survivor is named with ${MAX_FINALISTS} or fewer left`);
      return;
    }
    if (ev.type === "moveTribe" && !game.tribeIds.has(ev.tribe)) {
      errors.push(`${at}: unknown tribe "${ev.tribe}"`);
      return;
    }
    const valid = ids.filter((cid) => checkCastaway(ctx, cid, at));
    if (valid.length === 0) return;

    result.timeline.push(timelineEntry(ev.type, valid, { tribe: ev.tribe || null }));
    if (ev.type === "moveTribe") {
      valid.forEach((cid) => (game.tribeOf[cid] = ev.tribe));
    } else if (ev.type === "soleSurvivor") {
      game.winner = valid[0];
      game.finaleNumber = result.number;
    }
    if (EVENT_TYPES[ev.type].eliminates) valid.forEach((cid) => eliminate(ctx, cid));
  }

  // Why a scoring event can't be scored as entered, or null if it can.
  function scoringEventProblem(ev, type) {
    const countRule = type.scores.map((key) => RULES[key]).find((rule) => rule.perCount);
    const countNeeded = countRule && (ev.count !== undefined || !countRule.optionalCount);
    if (countNeeded && !(Number.isInteger(ev.count) && ev.count > 0)) return `needs a positive whole-number "count"`;
    if (ev.phase && !PHASES[ev.phase]) return `unknown phase "${ev.phase}"`;
    return null;
  }

  function applyScoringEvent(ctx, ev, type, at) {
    const problem = scoringEventProblem(ev, type);
    if (problem) {
      ctx.errors.push(`${at}: ${problem}`);
      return;
    }
    const phase = ev.phase || currentPhase(ctx.game);
    const targets = resolveTargets(ctx, ev, at);
    const options = { count: ev.count, idolInPocket: Boolean(ev.withIdol), guest: Boolean(type.guest) };
    const items = type.scores
      .filter((key) => !RULES[key].perCount || ev.count) // an optional count left out scores nothing
      .map((key) => ruleItem(key, phase, options));
    targets.forEach((cid) => items.forEach((item) => addItem(ctx.result.castawayPoints, cid, { ...item })));

    // `points` is what each credited castaway earned from this event.
    const points = sum(items.map((item) => item.points));
    const entry = timelineEntry(ev.type, targets, { tribe: ev.tribe || null, count: ev.count || null, points });
    if (type.allowsIdol) entry.withIdol = Boolean(ev.withIdol);
    ctx.result.timeline.push(entry);
    if (type.eliminates) targets.forEach((cid) => eliminate(ctx, cid));
  }

  // Fields that are misspelled, or that this event type would silently ignore.
  function eventFieldProblem(ev, type) {
    const unknown = Object.keys(ev).find((field) => !EVENT_FIELDS.has(field));
    if (unknown) return `unknown field "${unknown}"`;
    if (ev.withIdol && !type.allowsIdol) return `"withIdol" only applies to votedOut`;
    if (ev.phase && type.state) return `"phase" only applies to scoring events`;
    if (ev.except && (type.state || !ev.tribe)) return `"except" only applies to an event for a whole tribe`;
    return null;
  }

  function applyEvent(ctx, ev, index) {
    const at = `Episode ${ctx.result.number}, event ${index + 1} (${ev.type})`;
    const type = EVENT_TYPES[ev.type];
    if (!type) {
      ctx.errors.push(`${at}: unknown event type`);
      return;
    }
    const problem = eventFieldProblem(ev, type);
    if (problem) ctx.errors.push(`${at}: ${problem}`);
    else if (type.state) applyStateEvent(ctx, ev, at);
    else applyScoringEvent(ctx, ev, type, at);
  }

  // Survived points go to everyone still in at the end, at the phase the episode ended in.
  function awardSurvived(ctx, activeAtStart) {
    const phase = currentPhase(ctx.game);
    for (const cid of activeAtStart) {
      if (ctx.game.active.has(cid)) addItem(ctx.result.castawayPoints, cid, ruleItem("survived", phase));
    }
  }

  // Each player scores whatever their pick scored.
  function scorePlayers(ctx) {
    const { game, result } = ctx;
    for (const pid of game.playerIds) {
      const pick = result.picks[pid];
      const earned = pick && result.castawayPoints[pick.castaway];
      result.playerPoints[pid] = { total: earned ? earned.total : 0, items: earned ? [...earned.items] : [] };
    }
  }

  function playEpisode(game, ep, errors) {
    const ctx = { game, errors, result: newEpisodeResult(ep, game) };
    recordPicks(ctx, ep.picks);
    if (!ctx.result.completed) return ctx.result;

    const activeAtStart = [...game.active];
    ep.events.forEach((ev, i) => applyEvent(ctx, ev, i));
    awardSurvived(ctx, activeAtStart);
    scorePlayers(ctx);
    return ctx.result;
  }

  // ---------------------------------------------------------------------------
  // Season-level results: winner bonus, standings, castaway summaries.
  // ---------------------------------------------------------------------------

  const pickedWinner = (game, result, pid) => game.winner !== null && result.picks[pid]?.castaway === game.winner;

  // Every completed week's pick of the winner pays out in the finale.
  function applyWinnerBonus(game, completed) {
    if (!game.winner) return;
    const finale = completed.find((r) => r.number === game.finaleNumber);
    for (const result of completed) {
      for (const pid of game.playerIds) {
        if (pickedWinner(game, result, pid)) addItem(finale.playerPoints, pid, winnerBonusItem(result));
      }
    }
  }

  // While the game is on: the bonus each player has banked so far on each castaway
  // still in, biggest first. Empty once the winner is known (it's been paid).
  function winnerStakes(game, completed) {
    const stakesFor = (pid) => {
      const byCastaway = new Map();
      for (const result of completed) {
        const cid = result.picks[pid]?.castaway;
        if (!cid || !game.active.has(cid)) continue;
        const stake = byCastaway.get(cid) || { castaway: cid, picks: 0, points: 0 };
        stake.picks += 1;
        stake.points += winnerBonus(result.remainingAtLock);
        byCastaway.set(cid, stake);
      }
      return [...byCastaway.values()].sort((a, b) => b.points - a.points || b.picks - a.picks);
    };
    return Object.fromEntries(game.playerIds.map((pid) => [pid, game.winner ? [] : stakesFor(pid)]));
  }

  // A player's points from their pick that week, leaving out the winner bonus.
  const pickPoints = (score) => sum(score.items.filter((item) => item.weight !== WEIGHT.BONUS).map((item) => item.points));

  // Order: total points, then most picks of the winner, then best single episode
  // (the pick's own points: the winner bonus already counts in the tiebreak before it).
  // `winnerKnown` is false when ranking a week before the finale aired.
  function rankPlayers(players, game, completed, winnerKnown) {
    const rows = players.map((player) => {
      const scores = completed.map((r) => r.playerPoints[player.id]);
      const weekly = scores.map(pickPoints);
      return {
        player,
        total: sum(scores.map((s) => s.total)),
        winnerPicks: winnerKnown ? completed.filter((r) => pickedWinner(game, r, player.id)).length : 0,
        bestEpisode: weekly.length ? Math.max(...weekly) : 0,
        movement: null,
      };
    });
    const tied = (a, b) => a.total === b.total && a.winnerPicks === b.winnerPicks && a.bestEpisode === b.bestEpisode;
    rows.sort((a, b) => b.total - a.total || b.winnerPicks - a.winnerPicks || b.bestEpisode - a.bestEpisode);
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      row.rank = prev && tied(prev, row) ? prev.rank : i + 1;
    });
    return rows;
  }

  // Standings now, with places gained or lost since the week before.
  function standingsWithMovement(players, game, completed) {
    const standings = rankPlayers(players, game, completed, Boolean(game.winner));
    if (completed.length < 2) return standings;

    // Rank last week with only what was known then: the winner-picks tiebreak
    // applies only if the finale had already aired.
    const earlier = completed.slice(0, -1);
    const winnerKnown = Boolean(game.winner) && earlier.some((r) => r.number === game.finaleNumber);
    const previous = rankPlayers(players, game, earlier, winnerKnown);
    // Movement from a complete tie (e.g. a week with no picks) is meaningless, so skip it.
    if (previous.every((row) => row.rank === 1)) return standings;

    const previousRank = Object.fromEntries(previous.map((row) => [row.player.id, row.rank]));
    standings.forEach((row) => (row.movement = previousRank[row.player.id] - row.rank));
    return standings;
  }

  function castawaySummaries(league, game, completed) {
    return Object.fromEntries(
      league.castaways.map((c) => [
        c.id,
        {
          active: game.active.has(c.id),
          eliminatedIn: game.eliminatedIn[c.id] || null,
          tribe: game.tribeOf[c.id],
          seasonPoints: sum(completed.map((r) => r.castawayPoints[c.id]?.total || 0)),
        },
      ]),
    );
  }

  /**
   * Replays the whole season in episode order and returns everything the
   * pages need: per-episode castaway and player points, standings, castaway
   * status, each player's winner bonus at stake, and a list of data errors
   * (empty when the data is valid).
   */
  function scoreSeason(league) {
    const errors = [];
    const game = createGame(league, errors);
    const episodes = [...league.episodes].sort((a, b) => a.number - b.number);
    errors.push(...structureErrors(league, episodes));

    const results = episodes.map((ep) => playEpisode(game, ep, errors));
    const completed = results.filter((r) => r.completed);
    if (game.winner) {
      results
        .filter((r) => r.number > game.finaleNumber)
        .forEach((r) => errors.push(`Episode ${r.number} comes after the finale (episode ${game.finaleNumber})`));
    }
    applyWinnerBonus(game, completed);

    return {
      errors,
      episodes: results,
      standings: standingsWithMovement(league.players, game, completed),
      castaways: castawaySummaries(league, game, completed),
      winner: game.winner,
      winnerStakes: winnerStakes(game, completed),
      nextEpisode: results.find((r) => !r.completed) || null,
    };
  }

  return {
    WEIGHT,
    isTiered,
    PHASES,
    RULES,
    FINAL_PHASE_SIZE,
    SOLE_SURVIVOR_PER_CASTAWAY,
    winnerBonus,
    IDOL_IN_POCKET_MULTIPLIER,
    REWARD_GUEST_SHARE,
    guestPoints,
    scoreSeason,
  };
});
