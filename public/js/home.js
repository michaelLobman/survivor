// Home: the upcoming episode, then standings as expandable player cards
// (stats, pick history with itemized points, most-picked castaways).
(() => {
  const { season, esc } = UI;
  const app = document.getElementById("app");
  const next = season.nextEpisode;
  const completed = season.episodes.filter((e) => e.completed);
  const lastCompleted = completed[completed.length - 1];
  // Episodes before the league started (nobody picked) are left out of player cards.
  const leaguePicked = (e) => Object.values(e.picks).some(Boolean);
  // Orange on this page belongs to the top scorers card, so pick chips stay neutral.
  const QUIET = { quiet: true };

  function championCard() {
    if (!season.winner) return "";
    const champ = season.standings[0];
    return `<section class="card mb-4"><div class="card-body d-flex align-items-center gap-3">
      ${UI.avatar(season.winner, 64)}
      <div>
        <div class="eyebrow">Sole Survivor: ${esc(UI.castawayById.get(season.winner).name)}</div>
        <div class="fw-semibold">League champion: ${esc(champ.player.name)} with ${UI.pointsHtml(champ.total)} points</div>
      </div>
    </div></section>`;
  }

  // The top scorer(s) of the latest episode, featured in the orange card.
  function topScorersCard() {
    if (!lastCompleted) return "";
    const scored = LEAGUE.players.filter((p) => lastCompleted.picks[p.id]);
    if (scored.length === 0) return "";
    const top = Math.max(...scored.map((p) => lastCompleted.playerPoints[p.id].total));
    if (top <= 0) return "";
    const winners = scored.filter((p) => lastCompleted.playerPoints[p.id].total === top);
    const rows = winners
      .map((p) => {
        const castaway = lastCompleted.picks[p.id].castaway;
        return `<li class="d-flex align-items-center gap-3 py-1">
          ${UI.avatar(castaway, 48)}
          <div class="flex-grow-1">
            <div class="dash-name">${esc(p.name)}</div>
            <div class="small text-body-secondary">with ${esc(UI.shortName(castaway))}</div>
          </div>
          ${UI.pointsHtml(top, "fs-5 fw-semibold")}
        </li>`;
      })
      .join("");
    return `<section class="card featured-card mb-4"><div class="card-body">
      <div class="d-flex justify-content-between align-items-baseline mb-2">
        <span class="featured-label">Episode ${lastCompleted.number} ${winners.length > 1 ? "top scorers" : "top scorer"}</span>
        ${UI.episodeLink(lastCompleted.number, "See episode")}
      </div>
      <ul class="list-unstyled mb-0">${rows}</ul>
    </div></section>`;
  }

  const isLocked = () => next && Date.now() >= next.airsAt;

  // Two states: open for picks (with a countdown), then locked until results are posted.
  function episodeCard() {
    if (!next) return "";
    const locked = isLocked();
    const badge = locked
      ? `<span class="badge rounded-pill text-bg-secondary">Locked</span>`
      : `<span class="badge rounded-pill text-bg-warning">Locks in ${UI.timeUntil(next.airsAt)}</span>`;
    const body = locked
      ? `<p class="fw-semibold mb-1 mt-2">Picks locked. Points coming soon.</p>
        <p class="small text-body-secondary mb-0">Results post after the episode.</p>`
      : `<p class="fw-semibold mb-1 mt-2">Picks lock ${UI.dateTime(next.airsAt)}</p>
        <p class="small text-body-secondary mb-0">
          Send your pick to the commissioner before the episode airs. No pick, no points.
          Picking the eventual winner this week is worth ${UI.pointsHtml(next.remainingAtLock, "fw-semibold")} at the finale.
        </p>`;
    return `<section id="episode-card" class="card mb-4"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center">
        <span class="eyebrow">Episode ${next.number}${next.title ? ` · ${esc(next.title)}` : ""}</span>
        ${badge}
      </div>
      ${body}
    </div></section>`;
  }

  // --- Player cards ---

  // Per-player numbers derived from the scored season.
  function statsFor(playerId) {
    const scored = completed.filter((e) => e.picks[playerId]);
    const totals = scored.map((e) => ({ episode: e, points: e.playerPoints[playerId].total }));
    const best = totals.reduce((top, t) => (!top || t.points > top.points ? t : top), null);
    const average = totals.length ? Math.round(totals.reduce((sum, t) => sum + t.points, 0) / totals.length) : null;

    const byCastaway = {};
    for (const e of scored) {
      const id = e.picks[playerId].castaway;
      byCastaway[id] = byCastaway[id] || { id, count: 0, points: 0 };
      byCastaway[id].count += 1;
      byCastaway[id].points += e.castawayPoints[id]?.total || 0;
    }
    const favorites = Object.values(byCastaway).sort((a, b) => b.count - a.count || b.points - a.points);
    const winnerPicks = season.winner ? scored.filter((e) => e.picks[playerId].castaway === season.winner).length : null;
    return { best, average, favorites, winnerPicks };
  }

  function stat(label, value) {
    return `<div class="player-stat"><div class="eyebrow">${label}</div><div class="fw-semibold">${value}</div></div>`;
  }

  function statsRow(stats) {
    const cells = [
      stat("Best episode", stats.best ? `${UI.pointsHtml(stats.best.points)} <span class="eyebrow">Ep ${stats.best.episode.number}</span>` : "–"),
      stat("Average", stats.average === null ? "–" : UI.pointsHtml(stats.average)),
    ];
    if (stats.winnerPicks !== null) cells.push(stat("Picked the winner", `${stats.winnerPicks}×`));
    return `<div class="player-stats">${cells.join("")}</div>`;
  }

  function favoritesSection(stats) {
    if (stats.favorites.length === 0) return "";
    const chips = stats.favorites
      .map(
        (f) => `<span class="d-inline-flex align-items-center gap-2">${UI.pickChip({ castaway: f.id }, 28, QUIET)}
          <span class="small text-nowrap">×${f.count} <em>${UI.pointsHtml(f.points)}</em></span></span>`,
      )
      .join("");
    return `<div class="mt-3"><div class="eyebrow mb-2">Most picked</div><div class="d-flex flex-wrap gap-3">${chips}</div></div>`;
  }

  // Each past episode: pick and points, expanding to the itemized breakdown and a
  // link to the episode. The link stays out of <summary> so a row has one tap target.
  function historyRow(e, playerId) {
    const pick = e.picks[playerId];
    const score = e.playerPoints[playerId];
    const head = `<span class="history-ep eyebrow">Ep ${e.number}</span>
      <span class="flex-grow-1">${UI.pickChip(pick, 28, QUIET)}</span>
      ${UI.pointsHtml(score.total, "fw-semibold")}`;
    if (score.items.length === 0) {
      return `<li class="history-row d-flex align-items-center gap-3">${head}<span class="chevron-spacer"></span></li>`;
    }
    return `<li class="history-row">
      <details class="expandable">
        <summary class="d-flex align-items-center gap-3">${head}<span class="chevron" aria-hidden="true">›</span></summary>
        <div class="history-breakdown pe-4 mt-2 mb-1">
          <ul class="list-unstyled breakdown mb-2">${score.items.map(UI.breakdownItem).join("")}</ul>
          ${UI.episodeLink(e.number, "See episode")}
        </div>
      </details>
    </li>`;
  }

  function historySection(playerId) {
    // Completed episodes only; this week's pick is already on the card's "This week" line.
    const rows = completed
      .filter(leaguePicked)
      .reverse()
      .map((e) => historyRow(e, playerId));
    const body = rows.length
      ? `<ul class="list-unstyled mb-0">${rows.join("")}</ul>`
      : `<p class="small text-body-secondary fst-italic mb-0">N/A</p>`;
    return `<div class="mt-3"><div class="eyebrow mb-1">Pick history</div>${body}</div>`;
  }

  function movementHtml(movement) {
    if (movement === null || movement === 0) return `<span class="eyebrow">–</span>`;
    return movement > 0
      ? `<span class="small pts-pos">▲${movement}</span>`
      : `<span class="small pts-neg">▼${Math.abs(movement)}</span>`;
  }

  // Tint the leader green and anyone who dropped red. No leader while everyone is tied.
  const everyoneTied = season.standings.every((row) => row.rank === 1);
  function rowState(row) {
    if (row.rank === 1 && !everyoneTied) return " is-leader";
    if (row.movement < 0) return " is-dropping";
    return "";
  }

  function playerCard(row) {
    const { player } = row;
    const stats = statsFor(player.id);
    // Last week's pick (with its points) and this week's, so the card isn't all "No pick" early in the week.
    const pickLine = (label, pick, points) => `<div class="pick-line">
        <span class="eyebrow">${label}</span>${UI.pickChip(pick, 24, QUIET)}${points === null ? "" : UI.pointsHtml(points, "small fw-semibold")}
      </div>`;
    let lastWeek = "";
    if (lastCompleted && leaguePicked(lastCompleted)) {
      const pick = lastCompleted.picks[player.id];
      lastWeek = pickLine("Last week", pick, pick ? lastCompleted.playerPoints[player.id].total : null);
    }
    const thisWeek = next ? pickLine("This week", next.picks[player.id], null) : "";
    return `<details class="card expandable standings-row mb-2${rowState(row)}" id="${esc(player.id)}">
      <summary class="card-body d-flex align-items-center gap-3">
        <span class="standings-rank tabular">${row.rank}</span>
        <div class="flex-grow-1 min-w-0">
          <div class="fw-semibold">${esc(player.name)}</div>
          ${lastWeek}${thisWeek}
        </div>
        <div class="text-end flex-shrink-0">
          <div>${UI.pointsHtml(row.total, "fs-5 fw-semibold")}</div>
          ${movementHtml(row.movement)}
        </div>
        <span class="chevron" aria-hidden="true">›</span>
      </summary>
      <div class="card-body pt-0">
        ${statsRow(stats)}
        ${historySection(player.id)}
        ${favoritesSection(stats)}
      </div>
    </details>`;
  }

  function standings() {
    const after = lastCompleted ? UI.episodeLink(lastCompleted.number, `After Episode ${lastCompleted.number}`) : "";
    return `<div class="d-flex justify-content-between align-items-baseline mb-2">
        <h2 class="section-title">Standings</h2>
        ${after}
      </div>
      ${season.standings.map(playerCard).join("")}`;
  }

  app.innerHTML = UI.errorsHtml() + championCard() + topScorersCard() + episodeCard() + standings();

  // Links like index.html#mike open that player's card.
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target) {
    target.open = true;
    target.scrollIntoView({ block: "start" });
  }

  // Keep the countdown fresh; once locked, nothing changes until results are published.
  if (next && !isLocked()) {
    const timer = setInterval(() => {
      document.getElementById("episode-card").outerHTML = episodeCard();
      if (isLocked()) clearInterval(timer);
    }, 30000);
  }
})();
