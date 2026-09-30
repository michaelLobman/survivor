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
    tribe: { label: "Tribe game", late: 1, early: 3 },
    individual: { label: "Individual game", late: 2, early: 2 },
    final5: { label: "Final 5", late: 3, early: 1 },
  };
  const FINAL_PHASE_SIZE = 5;

  const RULES = {
    survived: { label: "Survived episode", points: 5, weight: "late" },
    immunity: { label: "Immunity", points: 10, weight: "late" },
    advantage: { label: "Found advantage", points: 5, weight: "late" },
    tribeReward: { label: "Tribe reward win", points: 3, weight: "late" },
    reward: { label: "Individual reward win", points: 8, weight: "late" },
    rewardGuest: { label: "Chosen for reward", points: 4, weight: "late" },
    votedOut: { label: "Voted out", points: -10, weight: "early" },
    votesAgainst: { label: "Votes against", points: -2, weight: "flat", perCount: true },
    idolCancel: { label: "Idol cancels votes", points: 5, weight: "flat", perCount: true },
  };

  // Sole Survivor bonus per weekly pick = this x castaways in the game at lock.
  const SOLE_SURVIVOR_PER_CASTAWAY = 1;

  // Event types the data file may use. "reward" with a tribe scores as tribeReward;
  // "survived" is never entered, it is computed at the end of each episode.
  const SCORING_EVENTS = new Set([
    "immunity",
    "reward",
    "rewardGuest",
    "advantage",
    "votedOut",
    "votesAgainst",
    "idolCancel",
  ]);
  // Event types that change game state instead of scoring points.
  const STATE_EVENTS = new Set(["moveTribe", "individualGame", "leftGame", "soleSurvivor"]);

  function makeItem(ruleKey, phaseKey, count) {
    const rule = RULES[ruleKey];
    const multiplier = rule.weight === "flat" ? 1 : PHASES[phaseKey][rule.weight];
    const times = rule.perCount ? count : 1;
    return {
      rule: ruleKey,
      label: rule.label,
      weight: rule.weight,
      phase: phaseKey,
      multiplier,
      count: rule.perCount ? count : null,
      points: rule.points * multiplier * times,
    };
  }

  function addItem(bucket, id, item) {
    if (!bucket[id]) bucket[id] = { total: 0, items: [] };
    bucket[id].items.push(item);
    bucket[id].total += item.points;
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
    const lastPick = {};
    let individualGame = false;
    let winner = null;
    let finaleIndex = null;

    const currentPhase = () => {
      if (active.size <= FINAL_PHASE_SIZE) return "final5";
      return individualGame ? "individual" : "tribe";
    };

    const episodes = [...league.episodes].sort((a, b) => a.number - b.number);
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

      // Picks: explicit this week, else carry over last pick if still in the game.
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
          result.picks[pid] = { castaway: cid, carried: false };
          lastPick[pid] = cid;
        } else if (lastPick[pid] && active.has(lastPick[pid])) {
          result.picks[pid] = { castaway: lastPick[pid], carried: true };
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
        const ids = ev.castaways || (ev.castaway ? [ev.castaway] : []);
        if (ids.length === 0) errors.push(`${at}: needs a castaway, castaways, or tribe`);
        return ids.filter((cid) => checkCastaway(cid, at));
      };

      ep.events.forEach((ev, i) => {
        const at = `${where}, event ${i + 1} (${ev.type})`;

        if (STATE_EVENTS.has(ev.type)) {
          if (ev.type === "individualGame") {
            individualGame = true;
            result.timeline.push({ type: ev.type, castaways: [], tribe: null, count: null, points: null });
          } else if (checkCastaway(ev.castaway, at)) {
            result.timeline.push({ type: ev.type, castaways: [ev.castaway], tribe: ev.tribe || null, count: null, points: null });
            if (ev.type === "moveTribe") {
              if (tribeIds.has(ev.tribe)) tribeOf[ev.castaway] = ev.tribe;
              else errors.push(`${at}: unknown tribe "${ev.tribe}"`);
            } else if (ev.type === "leftGame") {
              eliminate(ev.castaway);
            } else if (ev.type === "soleSurvivor") {
              winner = ev.castaway;
              finaleIndex = index;
            }
          }
          return;
        }

        if (!SCORING_EVENTS.has(ev.type)) {
          errors.push(`${at}: unknown event type`);
          return;
        }
        const ruleKey = ev.type === "reward" && ev.tribe ? "tribeReward" : ev.type;
        const rule = RULES[ruleKey];
        if (rule.perCount && !(Number.isInteger(ev.count) && ev.count > 0)) {
          errors.push(`${at}: needs a positive whole-number "count"`);
          return;
        }
        if (ev.phase && !PHASES[ev.phase]) {
          errors.push(`${at}: unknown phase "${ev.phase}"`);
          return;
        }

        const phase = ev.phase || currentPhase();
        const targets = resolveTargets(ev, at);
        const item = makeItem(ruleKey, phase, ev.count);
        targets.forEach((cid) => addItem(result.castawayPoints, cid, { ...item }));
        // `points` is what each credited castaway earned from this event.
        result.timeline.push({ type: ev.type, castaways: targets, tribe: ev.tribe || null, count: ev.count || null, points: item.points });
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
    const winnerPicks = Object.fromEntries(playerIds.map((pid) => [pid, 0]));
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
      const previous = rankPlayers(league.players, completed.slice(0, -1), winnerPicks);
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
        timesPicked: completed.reduce(
          (sum, r) => sum + Object.values(r.picks).filter((p) => p?.castaway === c.id).length,
          0,
        ),
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

  return { PHASES, RULES, FINAL_PHASE_SIZE, SOLE_SURVIVOR_PER_CASTAWAY, scoreSeason };
});
