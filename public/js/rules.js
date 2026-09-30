// Rules: generated from the scoring engine's tables, so the page can't drift from the math.
(() => {
  const { PHASES, RULES, FINAL_PHASE_SIZE, SOLE_SURVIVOR_PER_CASTAWAY } = Scoring;
  const app = document.getElementById("app");
  const phaseKeys = Object.keys(PHASES);

  const tiered = Object.values(RULES).filter((r) => r.weight !== "flat");
  const flat = Object.values(RULES).filter((r) => r.weight === "flat");

  const tieredRows = tiered
    .map((r) => {
      const cells = phaseKeys.map((k) => `<td class="text-end">${UI.pointsHtml(r.points * PHASES[k][r.weight])}</td>`).join("");
      return `<tr><td>${r.label}</td>${cells}</tr>`;
    })
    .join("");
  const flatRows = flat
    .map((r) => `<tr><td>${r.label}</td><td class="text-end">${UI.pointsHtml(r.points)} per vote</td></tr>`)
    .join("");

  app.innerHTML = `
    <h1 class="h5">How scoring works</h1>
    <p class="text-body-secondary small">
      Each week, pick one castaway. You score whatever they do that episode. Picks can repeat, and anyone can pick the same castaway.
    </p>

    <h2 class="section-title mt-4 mb-2">Game phases</h2>
    <ul class="small">
      <li><strong>Tribe game:</strong> immunity is won by tribes.</li>
      <li><strong>Individual game:</strong> immunity is won by individuals, 6 or more castaways left.</li>
      <li><strong>Final ${FINAL_PHASE_SIZE}:</strong> ${FINAL_PHASE_SIZE} or fewer castaways left.</li>
    </ul>
    <p class="small text-body-secondary">Most events are worth more as the game tightens. Getting voted out hurts most early.</p>

    <div class="card mb-4"><div class="table-responsive">
      <table class="table table-sm mb-0 small align-middle">
        <thead><tr><th>Event</th>${phaseKeys.map((k) => `<th class="text-end">${PHASES[k].label}</th>`).join("")}</tr></thead>
        <tbody>${tieredRows}</tbody>
      </table>
    </div></div>

    <div class="card mb-4"><div class="table-responsive">
      <table class="table table-sm mb-0 small align-middle">
        <thead><tr><th>Any phase</th><th class="text-end">Points</th></tr></thead>
        <tbody>${flatRows}</tbody>
      </table>
    </div></div>

    <h2 class="section-title mb-2">Sole Survivor bonus</h2>
    <p class="small">
      At the finale, every week you picked the eventual winner pays ${SOLE_SURVIVOR_PER_CASTAWAY === 1 ? "1 point" : `${SOLE_SURVIVOR_PER_CASTAWAY} points`}
      for each castaway still in the game when that week's picks locked. Backing the winner early pays the most.
    </p>

    <h2 class="section-title mb-2">Picks</h2>
    <ul class="small">
      <li>Picks lock when the episode starts airing (8 PM ET).</li>
      <li>No pick? Your previous pick carries over, as long as that castaway is still in the game.</li>
      <li>Everyone's picks are visible as soon as they're in.</li>
      <li>Final ties go to whoever picked the winner more often, then the best single episode.</li>
    </ul>`;
})();
