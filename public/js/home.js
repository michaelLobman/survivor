// Home: the upcoming episode, then standings as expandable player cards
// (stats, pick history with itemized points, most-picked castaways).
(() => {
  const { season, esc } = UI;
  const app = document.getElementById("app");
  const next = season.nextEpisode;
  const completed = season.episodes.filter((e) => e.completed);
  const lastCompleted = completed[completed.length - 1];
  // Episodes before the league started (nobody picked) are left out of player cards.
  // Orange on this page belongs to the top scorers card, so pick chips stay neutral.
  const QUIET = { quiet: true };
  // Standings mean nothing until an episode the league picked for has been scored.
  const leagueStarted = completed.some((e) => e.hasPicks);

  function championCard() {
    if (!season.winner) return "";
    const champ = season.standings[0];
    return `<section class="card mb-4"><div class="card-body d-flex align-items-center gap-3">
      <a href="${UI.castawayHref(season.winner)}" tabindex="-1" aria-hidden="true">${UI.avatar(season.winner, 64)}</a>
      <div>
        <div class="eyebrow">Sole Survivor: <a class="castaway-link" href="${UI.castawayHref(season.winner)}">${esc(UI.castawayById.get(season.winner).name)}</a></div>
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
          <a href="${UI.castawayHref(castaway)}" tabindex="-1" aria-hidden="true">${UI.avatar(castaway, 48)}</a>
          <div class="flex-grow-1">
            <div class="dash-name">${esc(p.name)}</div>
            <div class="small text-body-secondary">with <a class="castaway-link" href="${UI.castawayHref(castaway)}">${esc(UI.shortName(castaway))}</a></div>
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
      <p class="probst-line mb-2">That's how you do it on Survivor!</p>
      <ul class="list-unstyled mb-0">${rows}</ul>
    </div></section>`;
  }

  const isLocked = () => next && UI.isLocked(next);

  // Before lock, the message follows who has picked: everyone is in; one or two
  // stragglers are named; otherwise a general call to vote (the Picks list shows who's in).
  function openMessage() {
    const when = UI.dateTime(next.airsAt);
    const missing = LEAGUE.players.filter((p) => !next.picks[p.id]);
    const voteBy = `Cast your vote by ${when}. You cannot vote for yourself.`;
    if (missing.length === 0) {
      return { headline: `All ${LEAGUE.players.length} picks are in. Survivors ready?`, note: `Picks lock ${when}.` };
    }
    if (missing.length <= 2) {
      const names = missing.map((p) => esc(p.name)).join(" and ");
      return { headline: `Waiting on ${names}. Dig deep!`, note: voteBy };
    }
    return { headline: "It's time to vote.", note: voteBy };
  }

  // Two states: open for picks (with a countdown), then locked until results are posted.
  function episodeCard() {
    if (!next) return "";
    const locked = isLocked();
    const badge = locked
      ? `<span class="badge rounded-pill text-bg-secondary">Locked</span>`
      : `<span class="badge rounded-pill text-bg-warning">Locks in ${UI.timeUntil(next.airsAt)}</span>`;
    let body;
    if (locked) {
      body = `<p class="fw-semibold mb-1 mt-2">This is a live tribal.</p>
        <p class="small text-body-secondary mb-0">Picks are locked, and the decision is final. I'll go tally the votes.</p>`;
    } else {
      const { headline, note } = openMessage();
      body = `<p class="fw-semibold mb-1 mt-2">${headline}</p>
        <p class="small text-body-secondary mb-1">${note}</p>
        <p class="small text-body-secondary mb-0">
          Picking the eventual winner this week is worth ${UI.pointsHtml(Scoring.winnerBonus(next.remainingAtLock), "fw-semibold")} at the finale. Worth playing for?
        </p>`;
    }
    return `<section id="episode-card" class="card mb-4"><div class="card-body">
      <div class="d-flex justify-content-between align-items-center">
        <span class="eyebrow">Episode ${next.number}${next.title ? ` · ${esc(next.title)}` : ""}</span>
        ${badge}
      </div>
      ${body}
      ${upcomingPicks()}
    </div></section>`;
  }

  // Picks submitted for the upcoming episode, highest-ranked player first.
  function upcomingPicks() {
    const rows = season.standings
      .filter((row) => next.picks[row.player.id])
      .map(
        (row) => `<li>
          <span class="fw-semibold">${esc(row.player.name)}</span>
          ${UI.pickChip(next.picks[row.player.id], 24, { ...QUIET, link: true })}
        </li>`,
      );
    if (rows.length === 0) return "";
    return `<div class="upcoming-picks">
      <div class="eyebrow mb-1">Picks</div>
      <ul class="name-pick-list">${rows.join("")}</ul>
    </div>`;
  }

  // --- Player cards ---

  // How many recent weeks an open card shows before "All N weeks".
  const RECENT_WEEKS = 3;

  // Every scored week the league picked, newest first, with this player's pick (or none).
  // Points are what the pick scored; the Sole Survivor Bonus has its own section.
  const weeksFor = (playerId) =>
    completed
      .filter((e) => e.hasPicks)
      .reverse()
      .map((e) => {
        const pick = e.picks[playerId];
        return { episode: e, pick, points: pick ? e.castawayPoints[pick.castaway]?.total || 0 : 0 };
      });

  // One week: the pick and its points, linking to that episode with this player's score open.
  const weekRow = (week, playerId) => `<li class="week-item">
    <a class="week-row" href="episodes.html?ep=${week.episode.number}#${encodeURIComponent(playerId)}">
      <span class="history-ep eyebrow">Ep ${week.episode.number}</span>
      <span class="flex-grow-1 min-w-0">${UI.pickChip(week.pick, 28, QUIET)}</span>
      ${UI.pointsHtml(week.points, "fw-semibold")}
      <span class="chevron" aria-hidden="true">›</span>
    </a>
  </li>`;

  // The latest weeks, with older ones behind a button so the card stays short all season.
  function weeksSection(playerId) {
    const weeks = weeksFor(playerId);
    const rows = (list) => list.map((week) => weekRow(week, playerId)).join("");
    const older = weeks.slice(RECENT_WEEKS);
    const more = older.length
      ? `<details class="more-weeks">
          <summary class="ep-link mt-2">All ${weeks.length} weeks<span class="ep-link-arrow" aria-hidden="true">›</span></summary>
          <ul class="list-unstyled mb-0">${rows(older)}</ul>
        </details>`
      : "";
    return `<div class="mt-3">
      <div class="eyebrow mb-1">${weeks.length > 1 ? "Recent weeks" : "Last week"}</div>
      <ul class="list-unstyled mb-0">${rows(weeks.slice(0, RECENT_WEEKS))}</ul>
      ${more}
    </div>`;
  }

  const stakeRow = (castawayId, picks, points) => `<li>
    ${UI.pickChip({ castaway: castawayId }, 28, { ...QUIET, link: true })}
    <span class="small text-body-secondary text-nowrap">picked ${picks}×</span>
    ${UI.pointsHtml(points, "fw-semibold")}
  </li>`;

  // While the game is on: the bonus banked on each castaway still in. After the
  // finale: what the player was paid for picking the winner.
  function soleSurvivorBonus(playerId) {
    let rows;
    let note = "";
    if (season.winner) {
      const paid = completed.flatMap((e) => e.playerPoints[playerId].items).filter((item) => item.rule === "soleSurvivor");
      if (paid.length === 0) return "";
      rows = stakeRow(season.winner, paid.length, paid.reduce((sum, item) => sum + item.points, 0));
    } else {
      const stakes = season.winnerStakes[playerId];
      if (stakes.length === 0) return "";
      rows = stakes.map((s) => stakeRow(s.castaway, s.picks, s.points)).join("");
      note = `<p class="small text-body-secondary mb-0 mt-1">Paid at the finale if they win.</p>`;
    }
    return `<div class="eyebrow mb-1">Sole Survivor Bonus</div><ul class="stake-list">${rows}</ul>${note}`;
  }

  // Places gained or lost since last episode; nothing when unchanged.
  function movementHtml(movement) {
    if (!movement) return "";
    const n = Math.abs(movement);
    const up = movement > 0;
    return `<span class="small ${up ? "pts-pos" : "pts-neg"}">
      <span aria-hidden="true">${up ? "▲" : "▼"}${n}</span><span class="visually-hidden">${up ? "up" : "down"} ${n} ${n === 1 ? "place" : "places"}</span>
    </span>`;
  }

  // Shared ranks read "T4".
  const playersAtRank = new Map();
  season.standings.forEach((row) => playersAtRank.set(row.rank, (playersAtRank.get(row.rank) || 0) + 1));
  const rankLabel = (rank) => (playersAtRank.get(rank) > 1 ? `T${rank}` : String(rank));

  // Only the leader is highlighted (and nobody while everyone is tied); the arrows show movement.
  const everyoneTied = season.standings.every((row) => row.rank === 1);
  const rowState = (row) => (row.rank === 1 && !everyoneTied ? " is-leader" : "");

  // Collapsed row: the player's biggest winner bonus at stake. Muted, because it's
  // possible points, not points earned.
  function stakeHint(playerId) {
    const top = season.winnerStakes[playerId][0];
    if (!top) return "";
    return `<span class="d-block small text-body-secondary">${UI.points(top.points)} if ${esc(UI.shortName(top.castaway))} wins</span>`;
  }

  function playerCard(row) {
    const { player } = row;
    // Collapsed: rank, name, total, biggest bonus at stake. Expanded: the Sole Survivor
    // Bonus, then recent weeks. Upcoming picks are on the episode card.
    return `<details class="card expandable standings-row mb-2${rowState(row)}" id="${esc(player.id)}">
      <summary class="card-body standings-summary">
        <span class="standings-rank tabular">${rankLabel(row.rank)}</span>
        <span><span class="fw-semibold">${esc(player.name)}</span> ${movementHtml(row.movement)}${stakeHint(player.id)}</span>
        ${UI.pointsHtml(row.total, "fs-5 fw-semibold")}
        <span class="chevron" aria-hidden="true">›</span>
      </summary>
      <div class="card-body pt-0">
        ${soleSurvivorBonus(player.id)}
        ${weeksSection(player.id)}
      </div>
    </details>`;
  }

  function standings() {
    // A label, not a link: the top scorers card already links to the episode.
    const after = leagueStarted ? `<span class="eyebrow">After Episode ${lastCompleted.number}</span>` : "";
    const firstScored = next ? `Episode ${next.number} is` : "the first episode is";
    const notStarted = leagueStarted ? "" : `<p class="small text-body-secondary mb-2">Come on in! Standings start once ${firstScored} scored.</p>`;
    return `<div class="d-flex justify-content-between align-items-baseline mb-2">
        <h2 class="section-title">Standings</h2>
        ${after}
      </div>
      ${notStarted}
      ${leagueStarted ? season.standings.map(playerCard).join("") : ""}`;
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
