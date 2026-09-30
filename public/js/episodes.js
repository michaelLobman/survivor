// Episodes: an episode dashboard, then player and castaway scores (switchable, expandable).
(() => {
  const { season, esc } = UI;
  const app = document.getElementById("app");
  const completed = season.episodes.filter((e) => e.completed);

  if (completed.length === 0) {
    app.innerHTML = UI.errorsHtml() + `<p class="text-body-secondary">No results yet. Check back after the first episode.</p>`;
    return;
  }

  const requested = Number(new URLSearchParams(location.search).get("ep"));
  const episode = completed.find((e) => e.number === requested) || completed[completed.length - 1];

  const pills = completed
    .map((e) => {
      const active = e === episode;
      return `<a class="ep-pill${active ? " active" : ""}" href="?ep=${e.number}"${active ? ' aria-current="page"' : ""}>
        <span class="ep-pill-number">Ep ${e.number}</span>
        ${e.title ? `<span class="ep-pill-title">${esc(e.title)}</span>` : ""}
      </a>`;
    })
    .join("");

  // --- Episode dashboard: what happened, in show order, with faces ---
  const timeline = episode.timeline;
  const ofType = (...types) => timeline.filter((ev) => types.includes(ev.type));

  function person(id, size = 36) {
    return `<span class="d-inline-flex align-items-center gap-2">${UI.avatar(id, size)}<span>${esc(UI.shortName(id))}</span></span>`;
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // Points for one event; "each" when it credited several castaways.
  function eventPoints(ev) {
    if (ev.points === null) return "";
    const each = ev.castaways.length > 1 ? ` <span class="eyebrow">each</span>` : "";
    return `<span class="text-nowrap">${UI.pointsHtml(ev.points, "fw-semibold")}${each}</span>`;
  }

  // A left/right row: who (and what) on the left, points on the right.
  function row(left, right) {
    return `<li class="d-flex align-items-center justify-content-between gap-3 py-1">${left}${right}</li>`;
  }

  // A tribe win shows the tribe plus overlapping faces of everyone it credited.
  function winners(ev) {
    const who = ev.tribe
      ? `<span class="d-flex flex-wrap align-items-center gap-2">${UI.tribeBadge(ev.tribe)}<span class="avatar-stack">${ev.castaways.map((id) => UI.avatar(id, 32)).join("")}</span></span>`
      : `<span class="d-flex flex-wrap gap-3">${ev.castaways.map((id) => person(id)).join("")}</span>`;
    return row(who, eventPoints(ev));
  }

  function section(label, body) {
    return body ? `<div class="dash-section"><div class="eyebrow mb-2">${label}</div>${body}</div>` : "";
  }

  const list = (rows) => (rows.length ? `<ul class="list-unstyled mb-0">${rows.join("")}</ul>` : "");

  // Each castaway's votes and the points those votes cost them.
  function voteTally() {
    const tally = {};
    ofType("votesAgainst").forEach((ev) =>
      ev.castaways.forEach((id) => {
        tally[id] = tally[id] || { votes: 0, points: 0 };
        tally[id].votes += ev.count;
        tally[id].points += ev.points;
      }),
    );
    return tally;
  }

  function bootsSection() {
    const tally = voteTally();
    return ofType("votedOut", "leftGame")
      .flatMap((ev) => ev.castaways.map((id) => ({ id, ev })))
      .map(({ id, ev }) => {
        const voted = ev.type === "votedOut";
        const votes = tally[id] || { votes: 0, points: 0 };
        const parts = [];
        if (votes.votes) parts.push(`${plural(votes.votes, "vote")} <em class="multiplier">${UI.points(votes.points)}</em>`);
        if (voted) parts.push(`voted out <em class="multiplier">${UI.points(ev.points)}</em>`);
        const total = voted ? ev.points + votes.points : null;
        return `<div class="dash-section d-flex align-items-center gap-3">
          <span class="is-out-photo">${UI.avatar(id, 64)}</span>
          <div class="flex-grow-1">
            <div class="eyebrow">${voted ? "Voted out" : "Left the game"}</div>
            <div class="dash-name">${esc(UI.castawayById.get(id).name)}</div>
            <div class="small">${parts.join(" · ") || "No points either way"}</div>
          </div>
          ${total === null ? "" : UI.pointsHtml(total, "fs-5 fw-semibold")}
        </div>`;
      })
      .join("");
  }

  function challengesSection() {
    const column = (label, events) =>
      events.length ? `<div class="col-12 col-sm-6"><div class="eyebrow mb-1">${label}</div>${list(events.map(winners))}</div>` : "";
    const cols =
      column("Reward", ofType("reward")) +
      column("Reward guests", ofType("rewardGuest")) +
      column("Immunity", ofType("immunity"));
    return cols ? `<div class="dash-section"><div class="row g-3">${cols}</div></div>` : "";
  }

  function tribalSection() {
    const votes = Object.entries(voteTally())
      .sort(([, a], [, b]) => b.votes - a.votes)
      .map(([id, t]) =>
        row(
          person(id, 32),
          `<span class="text-nowrap small">${plural(t.votes, "vote")} ${UI.pointsHtml(t.points, "fw-semibold ms-2")}</span>`,
        ),
      );
    const idols = ofType("idolCancel").flatMap((ev) =>
      ev.castaways.map((id) =>
        row(
          person(id, 32),
          `<span class="text-nowrap small">Idol · ${plural(ev.count, "vote")} cancelled ${UI.pointsHtml(ev.points, "fw-semibold ms-2")}</span>`,
        ),
      ),
    );
    return section("Tribal council", list([...votes, ...idols]));
  }

  function peopleSection(label, types) {
    const rows = ofType(...types).flatMap((ev) =>
      ev.castaways.map((id) => row(person(id), ev.points === null ? "" : UI.pointsHtml(ev.points, "fw-semibold"))),
    );
    return section(label, list(rows));
  }

  function movesSection() {
    const moves = ofType("moveTribe").map((ev) =>
      row(
        `<span class="d-flex align-items-center gap-2">${person(ev.castaways[0])}<span class="text-body-secondary">→</span>${UI.tribeBadge(ev.tribe)}</span>`,
        "",
      ),
    );
    return section("Tribe changes", list(moves));
  }

  // ‹ › buttons to step between episodes; disabled at either end.
  function stepper() {
    const index = completed.indexOf(episode);
    const step = (target, symbol, label) =>
      target
        ? `<a class="ep-step" href="?ep=${target.number}" aria-label="${label}: Episode ${target.number}">${symbol}</a>`
        : `<span class="ep-step is-disabled" aria-hidden="true">${symbol}</span>`;
    return `<div class="d-flex gap-2 flex-shrink-0">${step(completed[index - 1], "‹", "Previous")}${step(completed[index + 1], "›", "Next")}</div>`;
  }

  function dashboard() {
    return `<section class="card mb-4 episode-dashboard"><div class="card-body">
      <div class="d-flex align-items-start justify-content-between gap-3">
        <div>
          <div class="eyebrow">Episode ${episode.number} · ${episode.remainingAtLock} castaways at lock</div>
          <h1 class="h5 mt-1 mb-0">${esc(episode.title || `Episode ${episode.number}`)}</h1>
        </div>
        ${stepper()}
      </div>
      ${peopleSection("Sole Survivor", ["soleSurvivor"])}
      ${bootsSection()}
      ${challengesSection()}
      ${tribalSection()}
      ${peopleSection("Advantages found", ["advantage"])}
      ${movesSection()}
      ${ofType("individualGame").length ? section("Phase change", `<span class="small">The individual game begins.</span>`) : ""}
    </div></section>`;
  }

  // One expandable score row: summary on top, itemized points inside.
  function scoreCard({ summary, score, extraClass = "" }) {
    if (score.items.length === 0) {
      return `<div class="card mb-2${extraClass}"><div class="card-body d-flex align-items-center gap-3">${summary}${UI.pointsHtml(score.total, "fs-5 fw-semibold")}<span class="chevron-spacer"></span></div></div>`;
    }
    return `<details class="card expandable mb-2${extraClass}">
      <summary class="card-body d-flex align-items-center gap-3">
        ${summary}${UI.pointsHtml(score.total, "fs-5 fw-semibold")}<span class="chevron" aria-hidden="true">›</span>
      </summary>
      <div class="card-body pt-0"><ul class="list-unstyled breakdown mb-0">${score.items.map(UI.breakdownItem).join("")}</ul></div>
    </details>`;
  }

  // Players ranked by this episode's points, each with their pick.
  function playerScores() {
    return LEAGUE.players
      .map((p) => ({ player: p, pick: episode.picks[p.id], score: episode.playerPoints[p.id] }))
      .sort((a, b) => b.score.total - a.score.total)
      .map(({ player, pick, score }) =>
        scoreCard({
          score,
          summary: `<div class="flex-grow-1 min-w-0">
            <div class="fw-semibold">${esc(player.name)}</div>
            <div class="mt-1">${UI.pickChip(pick, 28)}</div>
          </div>`,
        }),
      )
      .join("");
  }

  // Every castaway's points this episode, whether or not anyone picked them.
  function castawayScores() {
    return Object.entries(episode.castawayPoints)
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([id, score]) =>
        scoreCard({
          score,
          summary: `<span class="flex-grow-1 d-flex align-items-center gap-3">${UI.avatar(id, 36)}<span class="fw-semibold">${esc(UI.shortName(id))}</span></span>`,
        }),
      )
      .join("");
  }

  // Players | Castaways switch: one scores section, two views.
  function scoresSection() {
    return `<div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="section-title">Scores</h2>
        <div class="segmented" role="tablist" aria-label="Show scores for">
          <button type="button" class="segmented-option active" role="tab" aria-selected="true" data-view="players">Players</button>
          <button type="button" class="segmented-option" role="tab" aria-selected="false" data-view="castaways">Castaways</button>
        </div>
      </div>
      <div data-scores="players">${playerScores()}</div>
      <div data-scores="castaways" hidden>${castawayScores()}</div>`;
  }

  app.innerHTML = `${UI.errorsHtml()}
    <nav class="ep-pills mb-3" aria-label="Choose an episode">${pills}</nav>
    ${dashboard()}
    ${scoresSection()}`;

  document.querySelectorAll(".segmented-option").forEach((button) =>
    button.addEventListener("click", () => {
      document.querySelectorAll(".segmented-option").forEach((b) => {
        const selected = b === button;
        b.classList.toggle("active", selected);
        b.setAttribute("aria-selected", String(selected));
      });
      document.querySelectorAll("[data-scores]").forEach((list) => {
        list.hidden = list.dataset.scores !== button.dataset.view;
      });
    }),
  );

  // Late in the season the picker is wider than the screen; bring the current episode into view.
  const activePill = document.querySelector(".ep-pill.active");
  if (activePill) activePill.scrollIntoView({ block: "nearest", inline: "center" });
})();
