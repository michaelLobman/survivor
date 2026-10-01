// Castaways: a card per castaway, still-in-the-game first, then those who are out.
(() => {
  const { season, esc } = UI;
  const app = document.getElementById("app");

  // Season points broken down by episode, each with its itemized events.
  function seasonBreakdown(castawayId) {
    const episodes = season.episodes.filter((e) => e.completed && e.castawayPoints[castawayId]);
    if (episodes.length === 0) return `<p class="breakdown mb-0">No points yet.</p>`;
    return episodes
      .map((e) => {
        const score = e.castawayPoints[castawayId];
        return `<div class="mt-2">
          <div class="d-flex justify-content-between small fw-semibold">
            ${UI.episodeLink(e.number)}${UI.pointsHtml(score.total)}
          </div>
          <ul class="list-unstyled breakdown mb-0 ps-2">${score.items.map(UI.breakdownItem).join("")}</ul>
        </div>`;
      })
      .join("");
  }

  const byPoints = (a, b) => season.castaways[b.id].seasonPoints - season.castaways[a.id].seasonPoints;
  const inGame = LEAGUE.castaways.filter((c) => season.castaways[c.id].active).sort(byPoints);
  // After the merge everyone left shares one tribe: show it once in the header, not on every card.
  const remainingTribes = new Set(inGame.map((c) => season.castaways[c.id].tribe));
  const sharedTribe = remainingTribes.size === 1 ? [...remainingTribes][0] : null;

  function timesPicked(n) {
    if (n === 0) return "Not picked yet";
    return `Picked ${n} ${n === 1 ? "time" : "times"}`;
  }

  function card(c) {
    const stats = season.castaways[c.id];
    const showTribe = !(stats.active && sharedTribe);
    const status = stats.active ? "" : `<span class="small text-body-secondary">Out · Ep ${stats.eliminatedIn}</span>`;
    return `<div class="col-12 col-sm-6">
      <details class="card expandable${stats.active ? "" : " is-out"}">
        <summary class="card-body d-flex gap-3 align-items-center">
          ${UI.avatar(c.id, 80)}
          <span class="flex-grow-1 min-w-0">
            <span class="d-block fw-semibold text-truncate">${esc(c.name)}</span>
            ${showTribe ? `<span class="d-flex flex-wrap align-items-center gap-2 mt-1">${UI.tribeBadge(stats.tribe)} ${status}</span>` : ""}
            <span class="d-block eyebrow mt-1">${UI.pointsHtml(stats.seasonPoints)} season pts</span>
            <span class="d-block eyebrow">${timesPicked(stats.timesPicked)}</span>
          </span>
          <span class="chevron" aria-hidden="true">›</span>
        </summary>
        <div class="card-body pt-0">${seasonBreakdown(c.id)}</div>
      </details>
    </div>`;
  }

  const out = LEAGUE.castaways
    .filter((c) => !season.castaways[c.id].active)
    .sort((a, b) => season.castaways[b.id].eliminatedIn - season.castaways[a.id].eliminatedIn);

  app.innerHTML = `${UI.errorsHtml()}
    <div class="d-flex justify-content-between align-items-baseline mb-2">
      <h1 class="section-title">Remaining</h1>
      <span class="d-flex align-items-center gap-2">${sharedTribe ? UI.tribeBadge(sharedTribe) : ""}<span class="eyebrow">${inGame.length} castaways</span></span>
    </div>
    <div class="row g-2 mb-4 align-items-start">${inGame.map(card).join("")}</div>
    ${out.length ? `<h2 class="section-title mb-2">Eliminated</h2><div class="row g-2 align-items-start">${out.map(card).join("")}</div>` : ""}`;
})();
