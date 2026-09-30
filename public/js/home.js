// Home: the upcoming episode (countdown and picks so far) and league standings.
(() => {
  const { season, esc } = UI;
  const app = document.getElementById("app");
  const next = season.nextEpisode;
  const completed = season.episodes.filter((e) => e.completed);
  const lastCompleted = completed[completed.length - 1];

  function championCard() {
    if (!season.winner) return "";
    const champ = season.standings[0];
    return `<section class="card mb-4"><div class="card-body d-flex align-items-center gap-3">
      ${UI.avatar(season.winner, 64)}
      <div>
        <div class="eyebrow">Sole Survivor: ${esc(UI.castawayById.get(season.winner).name)}</div>
        <div class="fw-semibold">League champion: ${esc(champ.player.name)} with ${champ.total} points</div>
      </div>
    </div></section>`;
  }

  // Picks are shown as soon as they're entered (no hiding until lock in V1).
  function picksList(episode) {
    if (Object.values(episode.picks).every((pick) => pick === null)) return "";
    const rows = LEAGUE.players
      .map((p) => {
        const pick = episode.picks[p.id];
        return `<li class="d-flex justify-content-between align-items-center py-1"><span>${esc(p.name)}</span>${UI.pickChip(pick, 28)}</li>`;
      })
      .join("");
    return `<h3 class="section-title mt-3 mb-1">This week's picks</h3><ul class="list-unstyled mb-0 small">${rows}</ul>`;
  }

  function episodeCard() {
    if (!next) return "";
    const locked = Date.now() >= next.airsAt;
    return `<section class="card mb-4"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center">
        <span class="eyebrow">Episode ${next.number}${next.title ? ` · ${esc(next.title)}` : ""}</span>
        <span id="lock-status" class="badge rounded-pill ${locked ? "text-bg-secondary" : "text-bg-warning"}"></span>
      </div>
      <p class="fw-semibold mb-1 mt-2">${locked ? "Picks are locked" : `Picks lock ${UI.dateTime(next.airsAt)}`}</p>
      <p class="small text-body-secondary mb-0">
        ${locked ? "Results will be posted after the episode." : "Send your pick to the commissioner before the episode airs. No pick? Last week's carries over."}
        Picking the eventual winner this week is worth <strong>${UI.points(next.remainingAtLock)}</strong> at the finale.
      </p>
      ${picksList(next)}
    </div></section>`;
  }

  function movementHtml(movement) {
    if (movement === null || movement === 0) return `<span class="eyebrow">–</span>`;
    return movement > 0
      ? `<span class="small pts-pos">▲${movement}</span>`
      : `<span class="small pts-neg">▼${Math.abs(movement)}</span>`;
  }

  function standings() {
    if (!lastCompleted) {
      return `<p class="text-body-secondary">Standings appear once the first episode's results are in.</p>`;
    }
    // Tint the leader green and anyone who dropped red. No leader while everyone is tied.
    const everyoneTied = season.standings.every((row) => row.rank === 1);
    const rowState = (row) => {
      if (row.rank === 1 && !everyoneTied) return " is-leader";
      if (row.movement < 0) return " is-dropping";
      return "";
    };
    const rows = season.standings
      .map(
        (row) => `<li class="list-group-item d-flex align-items-center gap-3 standings-row${rowState(row)}">
          <span class="standings-rank tabular">${row.rank}</span>
          <span class="flex-grow-1">${esc(row.player.name)}</span>
          ${movementHtml(row.movement)}
          <span class="fw-semibold tabular text-end" style="width:3.5rem">${row.total}</span>
        </li>`,
      )
      .join("");
    return `<div class="d-flex justify-content-between align-items-baseline mb-2">
        <h2 class="section-title">Standings</h2>
        ${UI.episodeLink(lastCompleted.number, `After Episode ${lastCompleted.number}`)}
      </div>
      <ol class="card list-group list-group-flush mb-0">${rows}</ol>`;
  }

  app.innerHTML = UI.errorsHtml() + championCard() + episodeCard() + standings();

  function updateLockStatus() {
    const badge = document.getElementById("lock-status");
    if (!badge) return;
    badge.textContent = Date.now() >= next.airsAt ? "Locked" : `Locks in ${UI.timeUntil(next.airsAt)}`;
  }
  updateLockStatus();
  setInterval(updateLockStatus, 30000);
})();
