/*
 * Shared display helpers. Scores the season once per page load and exposes
 * formatting helpers so every page renders castaways and points the same way.
 */
const UI = (() => {
  const season = Scoring.scoreSeason(LEAGUE);
  const castawayById = new Map(LEAGUE.castaways.map((c) => [c.id, c]));
  const tribeById = new Map(LEAGUE.tribes.map((t) => [t.id, t]));
  const playerById = new Map(LEAGUE.players.map((p) => [p.id, p]));

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  }

  function shortName(castawayId) {
    const c = castawayById.get(castawayId);
    return c.short || c.name.split(" ")[0];
  }

  function points(n) {
    if (n > 0) return `+${n}`;
    if (n < 0) return `−${Math.abs(n)}`;
    return "0";
  }

  // Every point value on the site goes through here, so they all look the same.
  function pointsHtml(n, extraClass = "") {
    const tone = n > 0 ? "pts-pos" : n < 0 ? "pts-neg" : "pts-zero";
    return `<span class="pts tabular ${tone} ${extraClass}">${points(n)}</span>`;
  }

  // Dark text on light tribe colors (Toka yellow), white on dark (Savu purple).
  function textOn(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#1f2328" : "#fff";
  }

  // A photo ringed in tribe color when `photo` is set in data.js, otherwise initials.
  // Decorative by default (a name sits beside it); `named` labels a face shown alone.
  function avatar(castawayId, size = 40, { named = false } = {}) {
    const c = castawayById.get(castawayId);
    const tribe = tribeById.get(season.castaways[castawayId].tribe);
    const bg = tribe ? tribe.color : "#3a3a40";
    const title = named ? ` title="${esc(c.name)}"` : "";
    if (c.photo) {
      const ring = Math.max(2, Math.round(size / 20));
      const alt = named ? esc(c.name) : "";
      return `<img class="avatar avatar-photo" src="${esc(c.photo)}" alt="${alt}"${title} loading="lazy" width="${size}" height="${size}" style="box-shadow:0 0 0 ${ring}px ${bg}">`;
    }
    const a11y = named ? `role="img" aria-label="${esc(c.name)}"${title}` : `aria-hidden="true"`;
    const initials = c.name
      .replace(/“.*?”\s*/g, "")
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("");
    return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${size * 0.38}px;background:${bg};color:${textOn(bg)}" ${a11y}>${esc(initials)}</span>`;
  }

  function tribeBadge(tribeId) {
    const tribe = tribeById.get(tribeId);
    if (!tribe) return `<span class="tribe-badge" style="background:var(--surface-raised)">No tribe</span>`;
    return `<span class="tribe-badge" style="background:${tribe.color}33"><span class="tribe-dot" style="background:${tribe.color}"></span>${esc(tribe.name)}</span>`;
  }

  function dateTime(date) {
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function timeUntil(date) {
    const minutes = Math.max(0, Math.floor((date - Date.now()) / 60000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  // One line of an itemized breakdown, e.g. "Immunity Individual game ×2   +20",
  // with the multiplier in muted italics.
  function breakdownItem(item) {
    let detail = "";
    if (item.count) detail = `×${item.count}`;
    else if (item.weight === "late" || item.weight === "early") {
      detail = `${Scoring.PHASES[item.phase].label} ×${item.multiplier}`;
    }
    const multiplier = detail ? ` <em class="multiplier">${esc(detail)}</em>` : "";
    return `<li><span>${esc(item.label)}${multiplier}</span>${pointsHtml(item.points)}</li>`;
  }

  // A player's pick: the castaway's face and name on an orange-tinted chip.
  // `quiet` drops the orange where another element is the page's highlight;
  // `points` adds what the pick scored, inside the chip so it reads as part of the pick.
  function pickChip(pick, size = 32, { quiet = false, points = null } = {}) {
    if (!pick) return `<span class="pick-chip is-empty">No pick</span>`;
    const scored = points === null ? "" : `<span class="pick-chip-points">${pointsHtml(points)}</span>`;
    return `<span class="pick-chip${quiet ? " is-quiet" : ""}">${avatar(pick.castaway, size)}<span class="pick-chip-name">${esc(shortName(pick.castaway))}</span>${scored}</span>`;
  }

  // Every link to an episode looks the same: orange text with a chevron.
  function episodeLink(number, label = `Episode ${number}`) {
    return `<a class="ep-link" href="episodes.html?ep=${number}">${esc(label)}<span class="ep-link-arrow" aria-hidden="true">›</span></a>`;
  }

  // Data mistakes are shown loudly at the top of every page.
  function errorsHtml() {
    if (season.errors.length === 0) return "";
    const items = season.errors.map((e) => `<li>${esc(e)}</li>`).join("");
    return `<div class="alert alert-danger" role="alert">
      <strong>Data problem in data.js.</strong> Scores may be wrong until this is fixed:
      <ul class="mb-0 mt-2 small">${items}</ul>
    </div>`;
  }

  return {
    season,
    castawayById,
    tribeById,
    playerById,
    esc,
    shortName,
    points,
    pointsHtml,
    avatar,
    tribeBadge,
    dateTime,
    timeUntil,
    breakdownItem,
    episodeLink,
    pickChip,
    errorsHtml,
  };
})();
