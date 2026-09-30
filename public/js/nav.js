// Shared header and page nav, drawn into <div id="nav"> on every page.
(() => {
  const pages = [
    ["index.html", "Standings"],
    ["episodes.html", "Episodes"],
    ["castaways.html", "Castaways"],
    ["rules.html", "Rules"],
  ];
  const current = location.pathname.split("/").pop() || "index.html";

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
