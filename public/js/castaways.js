// Castaways: a photo grid, still-in-the-game first, then those who are out.
// Each tile opens that castaway's own page.
(() => {
  const { season, esc } = UI;
  const app = document.getElementById("app");
  const { inGame, out } = UI.castawayOrder;

  // After the merge everyone left shares one tribe: show it once in the header, not on every tile.
  const remainingTribes = new Set(inGame.map((id) => season.castaways[id].tribe));
  const sharedTribe = remainingTribes.size === 1 ? [...remainingTribes][0] : null;

  function tile(id) {
    const stats = season.castaways[id];
    let detail = "";
    if (!stats.active) detail = `<span class="eyebrow">Out · Ep ${stats.eliminatedIn}</span>`;
    else if (!sharedTribe) detail = UI.tribeBadge(stats.tribe);
    return `<li>
      <a class="castaway-tile${stats.active ? "" : " is-out"}" href="${UI.castawayHref(id)}">
        ${UI.avatar(id, 80)}
        <span class="castaway-tile-name">${esc(UI.shortName(id))}</span>
        ${UI.pointsHtml(stats.seasonPoints, "small fw-semibold")}
        ${detail}
      </a>
    </li>`;
  }

  const grid = (ids) => `<ul class="castaway-grid">${ids.map(tile).join("")}</ul>`;

  app.innerHTML = `${UI.errorsHtml()}
    <div class="d-flex justify-content-between align-items-baseline mb-2">
      <h1 class="section-title">Remaining</h1>
      <span class="d-flex align-items-center gap-2">${sharedTribe ? UI.tribeBadge(sharedTribe) : ""}<span class="eyebrow">${inGame.length} castaways</span></span>
    </div>
    <div class="mb-4">${grid(inGame)}</div>
    ${out.length ? `<h2 class="section-title mb-2">Eliminated</h2>${grid(out)}` : ""}`;
})();
