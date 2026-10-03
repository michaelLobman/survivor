// Castaway: one castaway's season (castaway.html?id=rob): status, stats, points by
// episode, who picked them, and tribe history.
(() => {
  const { season, esc } = UI;
  const app = document.getElementById("app");
  const id = new URLSearchParams(location.search).get("id");
  const castaway = UI.castawayById.get(id);

  if (!castaway) {
    app.innerHTML = `${UI.errorsHtml()}
      <p class="text-body-secondary">We couldn't find that castaway. <a href="castaways.html">See all castaways</a>.</p>`;
    return;
  }

  document.title = document.title.replace(/^[^·]+/, `${castaway.name} `);

  const stats = season.castaways[id];
  const short = UI.shortName(id);
  const completed = season.episodes.filter((e) => e.completed);
  // Episodes this castaway scored in, newest first (they score every episode they're in).
  const played = completed.filter((e) => e.castawayPoints[id]).reverse();
  const pickedIn = (e, playerId) => e.picks[playerId]?.castaway === id;
  // A pick counts once picks lock, even before results are in. Picks for an episode
  // that hasn't locked can still change, so they're only mentioned under "Picked by".
  const isLocked = (e) => e.completed || e.airsAt <= Date.now();
  const timesPicked = season.episodes
    .filter(isLocked)
    .reduce((count, e) => count + LEAGUE.players.filter((p) => pickedIn(e, p.id)).length, 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  function backLink() {
    return `<a class="back-link mb-3" href="castaways.html"><span aria-hidden="true">‹</span> All castaways</a>`;
  }

  // How the castaway left: the elimination event in the episode they went out.
  function exit() {
    const episode = season.episodes.find((e) => e.number === stats.eliminatedIn);
    const event = episode.timeline.find((ev) => ["votedOut", "leftGame"].includes(ev.type) && ev.castaways.includes(id));
    return { episode, left: event?.type === "leftGame" };
  }

  function status() {
    if (season.winner === id) return `<span class="fw-semibold pts-pos">Sole Survivor</span>`;
    if (stats.active) return `<span class="small text-body-secondary">Still in the game. Fire represents life.</span>`;
    const { episode, left } = exit();
    const episodeLink = `<a href="episodes.html?ep=${episode.number}">Episode ${episode.number}</a>`;
    if (left) return `<span class="small text-body-secondary">Left the game in ${episodeLink}</span>`;
    return `<span class="small text-body-secondary">The tribe has spoken · ${episodeLink}</span>`;
  }

  function hero() {
    return `<section class="card mb-3"><div class="card-body castaway-hero">
      ${UI.avatar(id, 128)}
      <h1 class="castaway-name">${esc(castaway.name)}</h1>
      <div class="d-flex flex-wrap justify-content-center align-items-center gap-2">${UI.tribeBadge(stats.tribe)}${status()}</div>
    </div></section>`;
  }

  function statTile(label, value) {
    return `<div class="player-stat"><div class="eyebrow">${label}</div><div class="fw-semibold">${value}</div></div>`;
  }

  function statsRow() {
    const totals = played.map((e) => ({ episode: e, points: e.castawayPoints[id].total }));
    const best = totals.reduce((top, t) => (!top || t.points > top.points ? t : top), null);
    const average = totals.length ? Math.round(totals.reduce((sum, t) => sum + t.points, 0) / totals.length) : null;
    return `<div class="stat-grid mb-4">
      ${statTile("Season points", UI.pointsHtml(stats.seasonPoints))}
      ${statTile("Times picked", timesPicked)}
      ${statTile("Best episode", best ? `${UI.pointsHtml(best.points)} <span class="eyebrow">Ep ${best.episode.number}</span>` : "–")}
      ${statTile("Average", average === null ? "–" : UI.pointsHtml(average))}
    </div>`;
  }

  // One row per episode: points, expanding to the itemized breakdown and a link to the episode.
  function episodeRow(e) {
    const score = e.castawayPoints[id];
    const pickers = LEAGUE.players.filter((p) => pickedIn(e, p.id)).length;
    return `<li class="history-row">
      <details class="expandable">
        <summary class="d-flex align-items-center gap-3">
          <span class="history-ep eyebrow">Ep ${e.number}</span>
          <span class="flex-grow-1 min-w-0 text-truncate">${esc(e.title || `Episode ${e.number}`)}</span>
          ${pickers ? `<span class="eyebrow text-nowrap">${plural(pickers, "pick")}</span>` : ""}
          ${UI.pointsHtml(score.total, "fw-semibold")}
          <span class="chevron" aria-hidden="true">›</span>
        </summary>
        <div class="history-breakdown pe-4 mt-2 mb-1">
          <ul class="list-unstyled breakdown mb-2">${score.items.map(UI.breakdownItem).join("")}</ul>
          ${UI.episodeLink(e.number, "See episode")}
        </div>
      </details>
    </li>`;
  }

  function episodesSection() {
    const body = played.length
      ? `<ul class="list-unstyled mb-0">${played.map(episodeRow).join("")}</ul>`
      : `<p class="small text-body-secondary mb-0">No episodes scored yet.</p>`;
    return `<h2 class="section-title mb-2">Episode by episode</h2>
      <section class="card mb-4"><div class="card-body">${body}</div></section>`;
  }

  // Each player who picked this castaway: how often, and what those weeks earned them.
  function pickedBySection() {
    const rows = LEAGUE.players
      .map((p) => {
        const weeks = completed.filter((e) => pickedIn(e, p.id));
        return { player: p, count: weeks.length, points: weeks.reduce((sum, e) => sum + e.playerPoints[p.id].total, 0) };
      })
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count || b.points - a.points)
      .map(
        (r) => `<li class="d-flex align-items-center justify-content-between gap-3 py-1">
          <a class="castaway-link fw-semibold" href="index.html#${esc(r.player.id)}">${esc(r.player.name)}</a>
          <span class="text-nowrap small">${plural(r.count, "week")} ${UI.pointsHtml(r.points, "fw-semibold ms-2")}</span>
        </li>`,
      );
    const next = season.nextEpisode;
    const thisWeek = next ? LEAGUE.players.filter((p) => pickedIn(next, p.id)).map((p) => esc(p.name)) : [];
    const thisWeekNote = thisWeek.length
      ? `<p class="small text-body-secondary mb-0 ${rows.length ? "mt-2" : ""}">Picked for Episode ${next.number} by ${thisWeek.join(", ")}.</p>`
      : "";
    const body = rows.length || thisWeekNote
      ? `${rows.length ? `<ul class="list-unstyled mb-0">${rows.join("")}</ul>` : ""}${thisWeekNote}`
      : `<p class="small text-body-secondary mb-0">Nobody has picked ${esc(short)} yet.</p>`;
    return `<h2 class="section-title mb-2">Picked by</h2>
      <section class="card mb-4"><div class="card-body">${body}</div></section>`;
  }

  // Starting tribe, then every move in order. Hidden for castaways who never moved.
  function tribeSection() {
    const moves = completed.flatMap((e) =>
      e.timeline.filter((ev) => ev.type === "moveTribe" && ev.castaways.includes(id)).map((ev) => ({ episode: e.number, tribe: ev.tribe })),
    );
    if (moves.length === 0) return "";
    const steps = moves
      .map((m) => `<span class="text-body-secondary" aria-hidden="true">→</span><span class="visually-hidden">then</span>
        <span class="d-inline-flex align-items-center gap-1">${UI.tribeBadge(m.tribe)}<span class="eyebrow">Ep ${m.episode}</span></span>`)
      .join("");
    return `<h2 class="section-title mb-2">Tribe history</h2>
      <section class="card mb-4"><div class="card-body d-flex flex-wrap align-items-center gap-2">
        ${UI.tribeBadge(castaway.tribe)}${steps}
      </div></section>`;
  }

  app.innerHTML = `${UI.errorsHtml()}
    ${backLink()}
    ${hero()}
    ${statsRow()}
    ${episodesSection()}
    ${pickedBySection()}
    ${tribeSection()}`;
})();
