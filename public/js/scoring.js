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

  // Late-weighted events grow as the game tightens; early-weighted ones shrink.
  const PHASES = {
    tribe: { label: "Tribe game", short: "Tribe", late: 1, early: 3 },
    individual: { label: "Individual game", short: "Individual", late: 2, early: 2 },
    final5: { label: "Final 5", short: "Final 5", late: 3, early: 1 },
  };
  const FINAL_PHASE_SIZE = 5;

  const RULES = {
    survived: { label: "Survived episode", points: 5, weight: "late" },
    immunity: { label: "Immunity", points: 10, weight: "late" },
    advantage: { label: "Found advantage", points: 5, weight: "late" },
    reward: { label: "Reward", points: 5, weight: "late" },
    votedOut: { label: "Voted out", points: -10, weight: "early" },
    votesAgainst: { label: "Votes against", points: -2, weight: "flat", perCount: true },
    idolCancel: { label: "Idol cancels votes", points: 5, weight: "flat", perCount: true },
    shotInTheDark: { label: "Safe with Shot in the Dark", points: 5, weight: "flat" },
    // `optionalCount`: the event may leave out `count` (a Shot in the Dark that cancelled no votes).
    shotInTheDarkCancel: { label: "Shot in the Dark cancels votes", points: 5, weight: "flat", perCount: true, optionalCount: true },
    optOut: { label: "Opted out of a challenge", points: -10, weight: "flat" },
  };

  // Sole Survivor bonus per weekly pick = this x castaways in the game at lock.
  const SOLE_SURVIVOR_PER_CASTAWAY = 1;

  // A castaway voted out with an idol in their pocket takes this x the voted-out penalty.
  const IDOL_IN_POCKET_MULTIPLIER = 2;

  // A castaway chosen to join someone else's reward earns this share of the reward, rounded up.
  const REWARD_GUEST_SHARE = 1 / 2;
  const guestPoints = (points) => Math.ceil(points * REWARD_GUEST_SHARE);

  // Event types the data file may use, and the rules each one scores (in breakdown order).
  // "survived" is never entered, it is computed at the end of each episode.
  const SCORING_EVENTS = new Map([
    ["immunity", ["immunity"]],
    ["reward", ["reward"]],
    ["rewardGuest", ["reward"]], // scored at REWARD_GUEST_SHARE
    ["advantage", ["advantage"]],
    ["shotInTheDark", ["shotInTheDark", "shotInTheDarkCancel"]],
    ["optOut", ["optOut"]],
    ["votedOut", ["votedOut"]],
    ["votesAgainst", ["votesAgainst"]],
    ["idolCancel", ["idolCancel"]],
  ]);
  // Event types that change game state instead of scoring points.
  const STATE_EVENTS = new Set(["moveTribe", "individualGame", "leftGame", "soleSurvivor"]);

  // `idolInPocket` applies only to votedOut and `guest` only to reward; both are kept
  // apart from the phase multiplier so breakdowns can show each one.
  function makeItem(ruleKey, phaseKey, { count = null, idolInPocket = false, guest = false } = {}) {
    const rule = RULES[ruleKey];
    const multiplier = rule.weight === "flat" ? 1 : PHASES[phaseKey][rule.weight];
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

  function addItem(bucket, id, item) {
    if (!bucket[id]) bucket[id] = { total: 0, items: [] };
    bucket[id].items.push(item);
    bucket[id].total += item.points;
  }

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

  /**
   * Replays the whole season in episode order and returns everything the
   * pages need: per-episode castaway and player points, standings, castaway
   * status, and a list of data errors (empty when the data is valid).
   */
  function scoreSeason(league) {
    const errors = [];
    const castawayById = new Map(league.castaways.map((c) => [c.id, c]));
    const tribeIds = new Set(league.tribes.map((t) => t.id));
    const playerIds = league.players.map((p) => p.id);

    const tribeOf = {};
    for (const c of league.castaways) {
      if (c.tribe && !tribeIds.has(c.tribe)) {
        errors.push(`Castaway "${c.id}" has unknown tribe "${c.tribe}"`);
      }
      tribeOf[c.id] = c.tribe || null;
    }

    const active = new Set(league.castaways.map((c) => c.id));
    const eliminatedIn = {};
    let individualGame = false;
    let winner = null;
    let finaleIndex = null;

    const currentPhase = () => {
      if (active.size <= FINAL_PHASE_SIZE) return "final5";
      return individualGame ? "individual" : "tribe";
    };

    const episodes = [...league.episodes].sort((a, b) => a.number - b.number);
    errors.push(...structureErrors(league, episodes));

    const results = episodes.map((ep, index) => {
      const where = `Episode ${ep.number}`;
      const activeAtStart = [...active];
      const result = {
        number: ep.number,
        title: ep.title || "",
        airsAt: new Date(ep.airsAt),
        completed: Array.isArray(ep.events),
        remainingAtLock: active.size,
        events: ep.events || [],
        picks: {},
        castawayPoints: {},
        playerPoints: {},
        eliminated: [],
        // Events as they resolved: who each one actually credited (tribes expanded).
        timeline: [],
      };

      // Picks: only what was entered this week. A missed pick scores zero.
      const explicit = ep.picks || {};
      for (const pid of Object.keys(explicit)) {
        if (!playerIds.includes(pid)) errors.push(`${where}: unknown player "${pid}" in picks`);
      }
      for (const pid of playerIds) {
        const cid = explicit[pid];
        if (cid) {
          if (!castawayById.has(cid)) {
            errors.push(`${where}: ${pid} picked unknown castaway "${cid}"`);
            result.picks[pid] = null;
            continue;
          }
          if (!active.has(cid)) errors.push(`${where}: ${pid} picked "${cid}", who is already out`);
          result.picks[pid] = { castaway: cid };
        } else {
          result.picks[pid] = null;
        }
      }

      if (!result.completed) return result;

      const eliminate = (cid) => {
        active.delete(cid);
        eliminatedIn[cid] = ep.number;
        result.eliminated.push(cid);
      };

      const checkCastaway = (cid, at) => {
        if (!castawayById.has(cid)) {
          errors.push(`${at}: unknown castaway "${cid}"`);
          return false;
        }
        if (!active.has(cid)) {
          errors.push(`${at}: "${cid}" is not in the game at this point`);
          return false;
        }
        return true;
      };

      // `castaway: "x"` and `castaways: ["x", "y"]` are interchangeable.
      const listedIds = (ev) => ev.castaways || (ev.castaway ? [ev.castaway] : []);

      // A tribe target expands to its current members, minus any exceptions.
      const resolveTargets = (ev, at) => {
        if (ev.tribe) {
          if (!tribeIds.has(ev.tribe)) {
            errors.push(`${at}: unknown tribe "${ev.tribe}"`);
            return [];
          }
          const except = ev.except || [];
          except.forEach((cid) => checkCastaway(cid, at));
          return [...active].filter((cid) => tribeOf[cid] === ev.tribe && !except.includes(cid));
        }
        const ids = listedIds(ev);
        if (ids.length === 0) errors.push(`${at}: needs a castaway, castaways, or tribe`);
        return ids.filter((cid) => checkCastaway(cid, at));
      };

      // State events change the game instead of scoring. On moveTribe, `tribe`
      // is the destination, so castaways are always listed, never expanded.
      const applyStateEvent = (ev, at) => {
        if (ev.type === "individualGame") {
          individualGame = true;
          result.timeline.push({ type: ev.type, castaways: [], tribe: null, count: null, points: null });
          return;
        }
        const ids = listedIds(ev);
        if (ids.length === 0) {
          errors.push(`${at}: needs a castaway or castaways`);
          return;
        }
        if (ev.type === "soleSurvivor" && (ids.length !== 1 || winner)) {
          errors.push(`${at}: there is exactly one Sole Survivor`);
          return;
        }
        if (ev.type === "moveTribe" && !tribeIds.has(ev.tribe)) {
          errors.push(`${at}: unknown tribe "${ev.tribe}"`);
          return;
        }
        const valid = ids.filter((cid) => checkCastaway(cid, at));
        if (valid.length === 0) return;

        result.timeline.push({ type: ev.type, castaways: valid, tribe: ev.tribe || null, count: null, points: null });
        if (ev.type === "moveTribe") {
          valid.forEach((cid) => (tribeOf[cid] = ev.tribe));
        } else if (ev.type === "leftGame") {
          valid.forEach(eliminate);
        } else if (ev.type === "soleSurvivor") {
          winner = valid[0];
          finaleIndex = index;
        }
      };

      ep.events.forEach((ev, i) => {
        const at = `${where}, event ${i + 1} (${ev.type})`;

        if (STATE_EVENTS.has(ev.type)) {
          applyStateEvent(ev, at);
          return;
        }

        if (!SCORING_EVENTS.has(ev.type)) {
          errors.push(`${at}: unknown event type`);
          return;
        }
        const ruleKeys = SCORING_EVENTS.get(ev.type);
        const countRule = ruleKeys.map((key) => RULES[key]).find((rule) => rule.perCount);
        const countNeeded = countRule && (ev.count !== undefined || !countRule.optionalCount);
        if (countNeeded && !(Number.isInteger(ev.count) && ev.count > 0)) {
          errors.push(`${at}: needs a positive whole-number "count"`);
          return;
        }
        if (ev.withIdol && ev.type !== "votedOut") {
          errors.push(`${at}: "withIdol" only applies to votedOut`);
          return;
        }
        if (ev.phase && !PHASES[ev.phase]) {
          errors.push(`${at}: unknown phase "${ev.phase}"`);
          return;
        }

        const phase = ev.phase || currentPhase();
        const targets = resolveTargets(ev, at);
        const options = { count: ev.count, idolInPocket: Boolean(ev.withIdol), guest: ev.type === "rewardGuest" };
        const items = ruleKeys
          .filter((key) => !RULES[key].perCount || ev.count) // an optional count left out scores nothing
          .map((key) => makeItem(key, phase, options));
        targets.forEach((cid) => items.forEach((item) => addItem(result.castawayPoints, cid, { ...item })));
        // `points` is what each credited castaway earned from this event.
        const points = items.reduce((sum, item) => sum + item.points, 0);
        const entry = { type: ev.type, castaways: targets, tribe: ev.tribe || null, count: ev.count || null, points };
        if (ev.type === "votedOut") entry.withIdol = Boolean(ev.withIdol);
        result.timeline.push(entry);
        if (ev.type === "votedOut") targets.forEach(eliminate);
      });

      const endPhase = currentPhase();
      for (const cid of activeAtStart) {
        if (active.has(cid)) addItem(result.castawayPoints, cid, makeItem("survived", endPhase));
      }

      for (const pid of playerIds) {
        const pick = result.picks[pid];
        const earned = pick && result.castawayPoints[pick.castaway];
        result.playerPoints[pid] = {
          total: earned ? earned.total : 0,
          items: earned ? [...earned.items] : [],
        };
      }
      return result;
    });

    // Sole Survivor bonus: every completed week's pick of the winner, paid in the finale.
    const noWinnerPicks = Object.fromEntries(playerIds.map((pid) => [pid, 0]));
    const winnerPicks = { ...noWinnerPicks };
    if (winner) {
      const finale = results[finaleIndex];
      for (const result of results.filter((r) => r.completed)) {
        for (const pid of playerIds) {
          if (result.picks[pid]?.castaway !== winner) continue;
          winnerPicks[pid] += 1;
          const points = result.remainingAtLock * SOLE_SURVIVOR_PER_CASTAWAY;
          const bonus = finale.playerPoints[pid];
          bonus.items.push({
            rule: "soleSurvivor",
            label: `Sole Survivor bonus (Ep ${result.number} pick)`,
            weight: "winner",
            points,
          });
          bonus.total += points;
        }
      }
    }

    const completed = results.filter((r) => r.completed);
    const standings = rankPlayers(league.players, completed, winnerPicks);
    if (completed.length > 1) {
      // Rank last week with only what was known then: the winner-picks tiebreak
      // applies only if the finale had already aired.
      const earlier = completed.slice(0, -1);
      const winnerKnown = winner && earlier.includes(results[finaleIndex]);
      const previous = rankPlayers(league.players, earlier, winnerKnown ? winnerPicks : noWinnerPicks);
      // Movement from a complete tie (e.g. a week with no picks) is meaningless, so skip it.
      if (!previous.every((row) => row.rank === 1)) {
        const previousRank = Object.fromEntries(previous.map((row) => [row.player.id, row.rank]));
        standings.forEach((row) => (row.movement = previousRank[row.player.id] - row.rank));
      }
    }

    const castaways = {};
    for (const c of league.castaways) {
      castaways[c.id] = {
        active: active.has(c.id),
        eliminatedIn: eliminatedIn[c.id] || null,
        tribe: tribeOf[c.id],
        seasonPoints: completed.reduce((sum, r) => sum + (r.castawayPoints[c.id]?.total || 0), 0),
      };
    }

    return {
      errors,
      episodes: results,
      standings,
      castaways,
      winner,
      nextEpisode: results.find((r) => !r.completed) || null,
      activeCount: active.size,
    };
  }

  // Order: total points, then most picks of the winner, then best single episode.
  function rankPlayers(players, completed, winnerPicks) {
    const rows = players.map((player) => {
      const totals = completed.map((r) => r.playerPoints[player.id].total);
      return {
        player,
        total: totals.reduce((a, b) => a + b, 0),
        winnerPicks: winnerPicks[player.id],
        bestEpisode: totals.length ? Math.max(...totals) : 0,
        movement: null,
      };
    });
    rows.sort((a, b) => b.total - a.total || b.winnerPicks - a.winnerPicks || b.bestEpisode - a.bestEpisode);
    rows.forEach((row, i) => {
      const prev = rows[i - 1];
      const tied =
        prev && prev.total === row.total && prev.winnerPicks === row.winnerPicks && prev.bestEpisode === row.bestEpisode;
      row.rank = tied ? prev.rank : i + 1;
    });
    return rows;
  }

  return {
    PHASES,
    RULES,
    FINAL_PHASE_SIZE,
    SOLE_SURVIVOR_PER_CASTAWAY,
    IDOL_IN_POCKET_MULTIPLIER,
    REWARD_GUEST_SHARE,
    guestPoints,
    scoreSeason,
  };
});
