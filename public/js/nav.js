// Shared header and page nav, drawn into <div id="nav"> on every page.
(() => {
  const pages = [
    ["index.html", "Standings"],
    ["episodes.html", "Episodes"],
    ["castaways.html", "Castaways"],
    ["rules.html", "Rules"],
  ];
  // A castaway's own page belongs under Castaways.
  const SECTION_OF = { "castaway.html": "castaways.html" };
  const file = location.pathname.split("/").pop() || "index.html";
  const current = SECTION_OF[file] || file;

  const links = pages
    .map(([href, label]) => {
      const active = href === current;
      return `<a class="nav-link${active ? " active" : ""}" href="${href}"${active ? ' aria-current="page"' : ""}>${label}</a>`;
    })
    .join("");

  document.getElementById("nav").innerHTML = `
    <header class="site-header border-bottom">
      <div class="container app-container py-3">
        <a class="site-brand" href="index.html">
          ${UI.esc(LEAGUE.name)}${LEAGUE.tagline ? `<span class="visually-hidden">:</span> <span class="site-tagline">${UI.esc(LEAGUE.tagline)}</span>` : ""}
        </a>
        <nav class="nav site-nav mt-3" aria-label="Pages">${links}</nav>
      </div>
    </header>`;
})();
