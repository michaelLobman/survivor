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

  // One switcher bar: ‹ › step between episodes; tapping the name opens the full list.
  function switcher() {
    const index = completed.indexOf(episode);
    const step = (target, symbol, label) =>
      target
        ? `<a class="ep-step" href="?ep=${target.number}" aria-label="${label}: Episode ${target.number}">${symbol}</a>`
        : `<span class="ep-step is-disabled" aria-hidden="true">${symbol}</span>`;
    const options = completed
      .map((e) => {
        const current = e === episode;
        return `<li><a class="ep-menu-option${current ? " active" : ""}" href="?ep=${e.number}"${current ? ' aria-current="page"' : ""}>
          <span class="ep-menu-number">Ep ${e.number}</span><span>${esc(e.title || `Episode ${e.number}`)}</span>
        </a></li>`;
      })
      .join("");
    return `<nav class="card ep-switcher mb-3" aria-label="Episodes"><div class="card-body d-flex align-items-center gap-2">
      ${step(completed[index - 1], "‹", "Previous")}
      <details class="ep-menu flex-grow-1">
        <summary class="text-center">
          <span class="d-block eyebrow">Episode ${episode.number} · ${episode.remainingAtLock} castaways</span>
          <h1 class="ep-switcher-title">${esc(episode.title || `Episode ${episode.number}`)} <span class="ep-menu-caret" aria-hidden="true">▾</span></h1>
        </summary>
        <ul class="ep-menu-list list-unstyled">${options}</ul>
      </details>
      ${step(completed[index + 1], "›", "Next")}
    </div></nav>`;
  }

  // --- Episode dashboard: what happened, in show order, with faces ---
  const timeline = episode.timeline;
  const ofType = (...types) => timeline.filter((ev) => types.includes(ev.type));

  const PERSON_SIZE = 36;
  const person = (id, size = PERSON_SIZE) => UI.castawayPerson(id, size);

  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

  // Points for one event; "each" when it credited several castaways.
  function eventPoints(ev) {
    if (ev.points === null) return "";
    const each = ev.castaways.length > 1 ? ` <span class="eyebrow">each</span>` : "";
    return `<span class="text-nowrap">${UI.pointsHtml(ev.points, "fw-semibold")}${each}</span>`;
  }

  // A left/right row: who (and what) on the left, points on the right. The right side is
  // centered on the first line (one face tall), so it stays put when names wrap.
  function row(left, right, faceSize = PERSON_SIZE) {
    return `<li class="dash-row py-1" style="--face-size:${faceSize}px">${left}<span class="dash-row-end">${right}</span></li>`;
  }

  // Overlapping faces on one line, however many there are. Each column is at most
  // FACE_STEP wide and shrinks when space runs short, so faces overlap more instead of wrapping.
  const FACE_SIZE = 32;
  const FACE_STEP = 24;
  function facepile(ids) {
    const overlapped = ids.length > 1 ? `repeat(${ids.length - 1}, minmax(0, ${FACE_STEP}px)) ` : "";
    const columns = `${overlapped}${FACE_SIZE}px`;
    const faces = ids.map((id) => `<a class="facepile-face" href="${UI.castawayHref(id)}">${UI.avatar(id, FACE_SIZE, { named: true })}</a>`);
    return `<span class="facepile" style="grid-template-columns:${columns}">${faces.join("")}</span>`;
  }

  // A few people by name; past that, faces only, so a whole tribe fits on one line.
  const MAX_NAMED = 3;
  function people(ids) {
    if (ids.length > MAX_NAMED) return facepile(ids);
    return `<span class="d-flex flex-wrap gap-3">${ids.map((id) => person(id)).join("")}</span>`;
  }

  // A group row: a heading line (e.g. the tribe) with points, and the people below.
  function groupRow(head, right, ids) {
    return `<li>
      <div class="d-flex align-items-center justify-content-between gap-3">${head}${right}</div>
      <div class="mt-2">${people(ids)}</div>
    </li>`;
  }

  const groupList = (rows) => (rows.length ? `<ul class="list-unstyled mb-0 group-list">${rows.join("")}</ul>` : "");

  // A tribe win lists everyone it credited under the tribe. An individual win reads
  // like the other dashboard rows: names left, points right.
  function challengeRow(ev) {
    if (ev.tribe) return groupRow(UI.tribeBadge(ev.tribe), eventPoints(ev), ev.castaways);
    return row(people(ev.castaways), eventPoints(ev));
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
        if (votes.votes) parts.push(`${plural(votes.votes, "vote")} ${UI.pointsHtml(votes.points)}`);
        if (voted) parts.push(`voted out ${UI.pointsHtml(ev.points)}`);
        const idolLine = ev.withIdol ? `<div class="probst-line">Went home with an idol in their pocket.</div>` : "";
        const total = voted ? ev.points + votes.points : null;
        return `<div class="dash-section d-flex align-items-center gap-3">
          <a class="is-out" href="${UI.castawayHref(id)}" tabindex="-1" aria-hidden="true">${UI.avatar(id, 64)}</a>
          <div class="flex-grow-1">
            <div class="eyebrow">${voted ? "The tribe has spoken" : "Left the game"}</div>
            <a class="dash-name castaway-link" href="${UI.castawayHref(id)}">${esc(UI.castawayById.get(id).name)}</a>
            <div class="small">${parts.join(" · ") || "No points either way"}</div>
            ${idolLine}
          </div>
          ${total === null ? "" : UI.pointsHtml(total, "fs-5 fw-semibold")}
        </div>`;
      })
      .join("");
  }

  // One section per challenge type, each win its own row (in show order within a type).
  const CHALLENGE_TYPES = [
    ["reward", "Reward"],
    ["rewardGuest", "Chosen for reward"],
    ["immunity", "Immunity"],
  ];
  function challengeSections() {
    const sections = CHALLENGE_TYPES.map(([type, label]) => section(label, groupList(ofType(type).map(challengeRow)))).join("");
    return sections ? `<p class="probst-line mb-2">Let's get it on!</p>${sections}` : "";
  }

  function tribalSection() {
    const votes = Object.entries(voteTally())
      .sort(([, a], [, b]) => b.votes - a.votes)
      .map(([id, t]) =>
        row(
          person(id, 32),
          `<span class="text-nowrap small">${plural(t.votes, "vote")} ${UI.pointsHtml(t.points, "fw-semibold ms-2")}</span>`,
          32,
        ),
      );
    // Idols and Shots in the Dark: who was protected, and how many votes it cancelled.
    const protectionRows = (type, label) =>
      ofType(type).flatMap((ev) =>
        ev.castaways.map((id) => {
          const cancelled = ev.count ? ` · ${plural(ev.count, "vote")} cancelled` : "";
          return row(
            person(id, 32),
            `<span class="text-nowrap small">${label}${cancelled} ${UI.pointsHtml(ev.points, "fw-semibold ms-2")}</span>`,
            32,
          );
        }),
      );
    const rows = [...votes, ...protectionRows("idolCancel", "Idol"), ...protectionRows("shotInTheDark", "Shot in the Dark")];
    if (rows.length === 0) return "";
    const probstLines = (type, line) =>
      ofType(type)
        .flatMap((ev) => ev.castaways)
        .map((id) => `<p class="probst-line mb-0 mt-2">${line(esc(UI.shortName(id)))}</p>`)
        .join("");
    const idolLines = probstLines("idolCancel", (name) => `Any votes cast for ${name} will not count.`);
    const shotLines = probstLines("shotInTheDark", (name) => `${name}, you are safe.`);
    const closing = `<p class="probst-line mb-0 mt-2">Grab your torches, head back to camp. Goodnight.</p>`;
    return section("Tribal council", `<p class="probst-line mb-2">I'll read the votes…</p>${list(rows)}${idolLines}${shotLines}${closing}`);
  }

  function peopleSection(label, types) {
    const rows = ofType(...types).flatMap((ev) =>
      ev.castaways.map((id) => row(person(id), ev.points === null ? "" : UI.pointsHtml(ev.points, "fw-semibold"))),
    );
    return section(label, list(rows));
  }

  // The merge: a move that puts everyone still in the game on one tribe. Castaways who
  // left earlier in this episode aren't in the game anymore, so they don't count.
  function isMerge(ev) {
    const before = timeline.slice(0, timeline.indexOf(ev));
    const gone = before.filter((e) => e.type === "votedOut" || e.type === "leftGame").reduce((n, e) => n + e.castaways.length, 0);
    return ev.castaways.length > 1 && ev.castaways.length === episode.remainingAtLock - gone;
  }
  const mergeEvent = ofType("moveTribe").find(isMerge) || null;
  const individualStarts = ofType("individualGame").length > 0;

  // The episode's headline when it happens, so it sits at the top of the dashboard.
  function mergeSection() {
    if (!mergeEvent) return "";
    const phase = individualStarts ? `<p class="small text-body-secondary mb-0 mt-2">Individual immunity from here on.</p>` : "";
    return section(
      "The merge",
      `<div class="d-flex align-items-center justify-content-between gap-3">
        <span class="d-flex align-items-center gap-2"><span class="dash-name">Merged into</span>${UI.tribeBadge(mergeEvent.tribe)}</span>
        <span class="eyebrow">${mergeEvent.castaways.length} castaways</span>
      </div>
      <p class="probst-line mb-0 mt-2">Drop your buffs.</p>
      <div class="mt-2">${facepile(mergeEvent.castaways)}</div>
      ${phase}`,
    );
  }

  // Moves grouped by destination: one person reads "Lewis → Toka"; a swap reads
  // "Moved to Toka" with everyone below.
  function movesSection() {
    const byTribe = new Map();
    ofType("moveTribe")
      .filter((ev) => ev !== mergeEvent)
      .forEach((ev) => byTribe.set(ev.tribe, [...(byTribe.get(ev.tribe) || []), ...ev.castaways]));
    const rows = [...byTribe].map(([tribe, ids]) => {
      if (ids.length === 1) {
        return row(
          `<span class="d-flex align-items-center gap-2">${person(ids[0])}<span class="text-body-secondary" aria-hidden="true">→</span><span class="visually-hidden">moved to</span>${UI.tribeBadge(tribe)}</span>`,
          "",
        );
      }
      return groupRow(`<span class="d-flex align-items-center gap-2"><span class="text-body-secondary">Moved to</span>${UI.tribeBadge(tribe)}</span>`, "", ids);
    });
    return section("Tribe changes", groupList(rows));
  }

  function dashboard() {
    return `<section class="card mb-4 episode-dashboard"><div class="card-body">
      ${peopleSection("Sole Survivor", ["soleSurvivor"])}
      ${mergeSection()}
      ${bootsSection()}
      ${challengeSections()}
      ${tribalSection()}
      ${peopleSection("Advantages found", ["advantage"])}
      ${peopleSection("Opted out of a challenge", ["optOut"])}
      ${movesSection()}
      ${individualStarts && !mergeEvent ? section("Phase change", `<span class="small">Immunity is back up for grabs.</span>`) : ""}
    </div></section>`;
  }

  // One expandable score row: summary on top, itemized points inside.
  // `castawayId` adds a link to that castaway's page under the breakdown.
  function scoreCard({ summary, score, castawayId = null, extraClass = "" }) {
    if (score.items.length === 0) {
      return `<div class="card mb-2${extraClass}"><div class="card-body d-flex align-items-center gap-3">${summary}${UI.pointsHtml(score.total, "fs-5 fw-semibold")}<span class="chevron-spacer"></span></div></div>`;
    }
    return `<details class="card expandable mb-2${extraClass}">
      <summary class="card-body d-flex align-items-center gap-3">
        ${summary}${UI.pointsHtml(score.total, "fs-5 fw-semibold")}<span class="chevron" aria-hidden="true">›</span>
      </summary>
      <div class="card-body pt-0">
        <ul class="list-unstyled breakdown mb-0">${score.items.map(UI.breakdownItem).join("")}</ul>
        ${castawayId ? `<div class="mt-2">${UI.castawayLink(castawayId)}</div>` : ""}
      </div>
    </details>`;
  }

  // Players ranked by this episode's points, each with their pick. A Probst line
  // separates the top scorer(s) from everyone else, like the losers of a challenge.
  function playerScores() {
    const ranked = LEAGUE.players
      .map((p) => ({ player: p, pick: episode.picks[p.id], score: episode.playerPoints[p.id] }))
      .sort((a, b) => b.score.total - a.score.total);
    const topCount = ranked.filter((r) => r.score.total === ranked[0].score.total).length;
    const divider = `<p class="probst-line my-2">Got nothing for you.</p>`;
    return ranked
      .map(({ player, pick, score }, i) =>
        (i === topCount ? divider : "") +
        scoreCard({
          score,
          castawayId: pick?.castaway,
          summary: `<span class="flex-grow-1 min-w-0">
            <span class="d-block fw-semibold">${esc(player.name)}</span>
            <span class="d-block mt-1">${UI.pickChip(pick, 28)}</span>
          </span>`,
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
          castawayId: id,
          summary: `<span class="flex-grow-1 d-flex align-items-center gap-3">${UI.avatar(id, 36)}<span class="fw-semibold">${esc(UI.shortName(id))}</span></span>`,
        }),
      )
      .join("");
  }

  // Players | Castaways switch: one scores section, two views.
  // Episodes before the league started (or that nobody picked) have no player scores,
  // so they show castaway scores alone with a note instead of an empty Players list.
  const anyPicks = Object.values(episode.picks).some(Boolean);

  function noPicksNote() {
    const firstPicked = season.episodes.find((e) => Object.values(e.picks).some(Boolean));
    return firstPicked && firstPicked.number > episode.number
      ? `Picks begin in Episode ${firstPicked.number}.`
      : "Nobody picked this episode.";
  }

  function scoresSection() {
    if (!anyPicks) {
      return `<h2 class="section-title mb-1">Castaway scores</h2>
        <p class="small text-body-secondary mb-2">${noPicksNote()}</p>
        ${castawayScores()}`;
    }
    return `<div class="d-flex justify-content-between align-items-center mb-2">
        <h2 class="section-title">Scores</h2>
        <div class="segmented" role="group" aria-label="Show scores for">
          <button type="button" class="segmented-option active" aria-pressed="true" data-view="players">Players</button>
          <button type="button" class="segmented-option" aria-pressed="false" data-view="castaways">Castaways</button>
        </div>
      </div>
      <div data-scores="players">${playerScores()}</div>
      <div data-scores="castaways" hidden>${castawayScores()}</div>`;
  }

  app.innerHTML = `${UI.errorsHtml()}
    ${switcher()}
    ${dashboard()}
    ${scoresSection()}`;

  document.querySelectorAll(".segmented-option").forEach((button) =>
    button.addEventListener("click", () => {
      document.querySelectorAll(".segmented-option").forEach((b) => {
        const selected = b === button;
        b.classList.toggle("active", selected);
        b.setAttribute("aria-pressed", String(selected));
      });
      document.querySelectorAll("[data-scores]").forEach((list) => {
        list.hidden = list.dataset.scores !== button.dataset.view;
      });
    }),
  );

  // Close the episode list when tapping anywhere else, or on Escape.
  const menu = document.querySelector(".ep-menu");
  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !menu.open) return;
    menu.open = false;
    menu.querySelector("summary").focus(); // back to where the keyboard user started
  });
})();
