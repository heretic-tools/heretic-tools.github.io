(() => {
  const launchers = Array.from(document.querySelectorAll(".launcher"));
  const basePath = normalizeBasePath(document.querySelector('meta[name="heretic-base-path"]')?.content || "");

  function normalizeBasePath(value) {
    const path = String(value || "").trim().replace(/\/+$/, "");
    return path && path !== "/" ? `/${path.replace(/^\/+/, "")}` : "";
  }

  function siteHref(path) {
    if (!path || !path.startsWith("/") || path.startsWith("//")) {
      return path;
    }
    return `${basePath}${path}`;
  }

  function selectLauncher(button) {
    launchers.forEach((item) => item.setAttribute("aria-pressed", "false"));
    button.setAttribute("aria-pressed", "true");
    history.replaceState(null, "", `#${button.dataset.route}`);
  }

  launchers.forEach((button) => {
    button.addEventListener("click", () => {
      selectLauncher(button);
      if (button.dataset.route === "codex") {
        window.location.href = siteHref("/codex");
      }
    });
  });

  const activeRoute = window.location.hash.replace("#", "");
  const activeButton = launchers.find((button) => button.dataset.route === activeRoute);
  if (activeButton) {
    selectLauncher(activeButton);
  }

  window.setupWinScrollbars();
  window.addEventListener("load", window.setupWinScrollbars);
})();
