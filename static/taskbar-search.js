(() => {
  const root = document.querySelector(".taskbar-search");
  if (!root) {
    return;
  }

  const input = root.querySelector(".taskbar-search-input");
  const results = root.querySelector(".taskbar-search-results");
  const resultList = document.createElement("div");
  const clearButton = document.createElement("button");
  let controller = null;
  let searchTimer = 0;
  let dragStart = null;
  let staticSearchIndexPromise = null;

  resultList.className = "taskbar-search-results-list";
  resultList.setAttribute("role", "list");
  results.removeAttribute("role");
  results.replaceChildren(resultList);

  const scrollbar = document.createElement("div");
  scrollbar.className = "win-scrollbar taskbar-search-scrollbar";
  scrollbar.hidden = true;
  scrollbar.innerHTML = `
    <button class="scroll-button scroll-button-up" type="button" aria-label="Scroll up"></button>
    <div class="scroll-track"><div class="scroll-thumb"></div></div>
    <button class="scroll-button scroll-button-down" type="button" aria-label="Scroll down"></button>
  `;
  results.append(scrollbar);

  const upButton = scrollbar.querySelector(".scroll-button-up");
  const downButton = scrollbar.querySelector(".scroll-button-down");
  const track = scrollbar.querySelector(".scroll-track");
  const thumb = scrollbar.querySelector(".scroll-thumb");

  clearButton.className = "taskbar-search-clear";
  clearButton.type = "button";
  clearButton.setAttribute("aria-label", "Clear search");
  clearButton.textContent = "x";
  input.after(clearButton);

  const TASKBAR_GAP = 54;
  const basePath = normalizeBasePath(document.querySelector('meta[name="heretic-base-path"]')?.content || "");
  const staticSearchIndexUrl = document.querySelector('meta[name="heretic-search-index"]')?.content || "";

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

  function compactText(...values) {
    return values
      .map((value) => String(value || ""))
      .join(" ")
      .replace(/\*+/g, "")
      .replace(/■/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function searchTokens(value) {
    return compactText(value).toLocaleLowerCase().match(/[\p{L}\p{N}_']+/gu) || [];
  }

  function clippedExcerpt(text, query, tokens) {
    const source = compactText(text);
    if (!source) {
      return "";
    }
    const folded = source.toLocaleLowerCase();
    const queryIndex = folded.indexOf(query);
    const indexes = queryIndex >= 0 ? [queryIndex] : tokens
      .map((token) => folded.indexOf(token))
      .filter((index) => index >= 0);
    const start = Math.max(0, (indexes.length ? Math.min(...indexes) : 0) - 48);
    const end = Math.min(source.length, start + 180);
    let excerpt = source.slice(start, end).trim();
    if (start > 0) {
      excerpt = `...${excerpt}`;
    }
    if (end < source.length) {
      excerpt = `${excerpt}...`;
    }
    return excerpt;
  }

  function resultScore(item, query, tokens) {
    const title = compactText(item.title).toLocaleLowerCase();
    const meta = compactText(item.meta).toLocaleLowerCase();
    const text = compactText(item.text).toLocaleLowerCase();
    const haystack = `${title} ${meta} ${text}`;
    if (!tokens.every((token) => haystack.includes(token))) {
      return null;
    }

    let score = 0;
    if (title === query) {
      score += 300;
    } else if (title.startsWith(query)) {
      score += 220;
    } else if (title.includes(query)) {
      score += 160;
    } else if (meta.includes(query)) {
      score += 80;
    } else if (text.includes(query)) {
      score += 40;
    }

    tokens.forEach((token) => {
      if (title.startsWith(token)) {
        score += 60;
      } else if (title.includes(token)) {
        score += 45;
      } else if (meta.includes(token)) {
        score += 25;
      } else if (text.includes(token)) {
        score += 10;
      }
    });
    return score;
  }

  function matchStaticResults(items, query, limit) {
    const queryText = compactText(query).toLocaleLowerCase();
    const tokens = searchTokens(query);
    if (!queryText || !tokens.length) {
      return [];
    }

    const seen = new Set();
    const matched = [];
    items.forEach((item) => {
      if (!item.title || !item.href) {
        return;
      }
      const key = [item.type || "", String(item.title).toLocaleLowerCase(), item.href].join("\u0000");
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      const score = resultScore(item, queryText, tokens);
      if (score === null) {
        return;
      }
      matched.push({
        score,
        type: item.type || "Result",
        title: compactText(item.title),
        meta: compactText(item.meta),
        excerpt: clippedExcerpt(item.text, queryText, tokens),
        href: item.href,
      });
    });

    matched.sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.type !== right.type) {
        return left.type.localeCompare(right.type);
      }
      return left.title.localeCompare(right.title);
    });
    return matched.slice(0, limit).map(({ score: _score, ...item }) => item);
  }

  function loadStaticSearchIndex() {
    if (!staticSearchIndexPromise) {
      staticSearchIndexPromise = fetch(staticSearchIndexUrl).then((response) => {
        if (!response.ok) {
          throw new Error(`Search index failed: ${response.status}`);
        }
        return response.json();
      }).then((payload) => payload.items || []);
    }
    return staticSearchIndexPromise;
  }

  // Keep the results panel above the on-screen keyboard. On mobile the panel is
  // fixed to the bottom of the layout viewport, but the keyboard does not shrink
  // the layout viewport (notably on iOS), so the panel would hide behind it. The
  // VisualViewport API reports the keyboard inset, letting us lift the panel and
  // cap its height to the visible area.
  function positionResults() {
    if (results.hidden) {
      return;
    }
    const viewport = window.visualViewport;
    const isFixed = getComputedStyle(results).position === "fixed";
    if (!viewport || !isFixed) {
      results.style.bottom = "";
      results.style.maxHeight = "";
      return;
    }
    const keyboardInset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    results.style.bottom = `${keyboardInset + TASKBAR_GAP}px`;
    results.style.maxHeight = `${Math.max(120, Math.round(viewport.height - TASKBAR_GAP - 12))}px`;
    refreshScrollbar();
  }

  function setOpen(open) {
    root.classList.toggle("is-open", open);
    input.setAttribute("aria-expanded", String(open));
    results.hidden = !open;
    if (open) {
      positionResults();
      requestAnimationFrame(refreshScrollbar);
    } else {
      results.style.bottom = "";
      results.style.maxHeight = "";
    }
  }

  function syncClearButton() {
    root.classList.toggle("has-value", Boolean(input.value.trim()));
  }

  function clearResults() {
    resultList.replaceChildren();
    setOpen(false);
  }

  function resultText(value) {
    return String(value || "").trim();
  }

  function renderMessage(message) {
    const item = document.createElement("div");
    item.className = "taskbar-search-message";
    item.textContent = message;
    resultList.replaceChildren(item);
    setOpen(true);
  }

  function renderResults(items) {
    resultList.replaceChildren();
    if (!items.length) {
      renderMessage("No results");
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item) => {
      const link = document.createElement("a");
      link.className = "taskbar-search-result";
      link.href = siteHref(item.href);
      link.setAttribute("role", "listitem");

      const title = document.createElement("span");
      title.className = "taskbar-search-result-title";
      title.textContent = resultText(item.title);
      link.append(title);

      const meta = document.createElement("span");
      meta.className = "taskbar-search-result-meta";
      const type = resultText(item.type);
      const context = resultText(item.meta);
      meta.textContent = [type, context].filter(Boolean).join(" / ");
      link.append(meta);

      fragment.append(link);
    });
    resultList.append(fragment);
    setOpen(true);
  }

  function scrollStep() {
    return Math.max(64, Math.floor(resultList.clientHeight * 0.35));
  }

  function updateThumb() {
    const maxScroll = Math.max(0, resultList.scrollHeight - resultList.clientHeight);
    const trackHeight = track.clientHeight;
    const thumbHeight = Math.max(24, Math.floor(resultList.clientHeight / resultList.scrollHeight * trackHeight));
    const travel = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = maxScroll ? Math.round(resultList.scrollTop / maxScroll * travel) : 0;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
  }

  function refreshScrollbar() {
    if (results.hidden) {
      return;
    }
    const isScrollable = resultList.scrollHeight - resultList.clientHeight > 1;
    results.classList.toggle("has-search-scrollbar", isScrollable);
    scrollbar.hidden = !isScrollable;
    if (isScrollable) {
      updateThumb();
    }
  }

  async function runSearch(query) {
    if (staticSearchIndexUrl) {
      try {
        const items = await loadStaticSearchIndex();
        if (input.value.trim() !== query) {
          return;
        }
        renderResults(matchStaticResults(items, query, 30));
      } catch (_error) {
        renderMessage("Search unavailable");
      }
      return;
    }

    if (controller) {
      controller.abort();
    }
    controller = new AbortController();

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=30`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      const payload = await response.json();
      if (input.value.trim() !== query) {
        return;
      }
      renderResults(payload.results || []);
    } catch (error) {
      if (error.name === "AbortError") {
        return;
      }
      renderMessage("Search unavailable");
    }
  }

  function scheduleSearch() {
    window.clearTimeout(searchTimer);
    const query = input.value.trim();
    syncClearButton();
    if (query.length < 2) {
      clearResults();
      return;
    }
    searchTimer = window.setTimeout(() => runSearch(query), 160);
  }

  root.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  clearButton.addEventListener("click", () => {
    input.value = "";
    syncClearButton();
    clearResults();
    input.focus();
  });

  upButton.addEventListener("click", () => resultList.scrollBy({ top: -scrollStep(), behavior: "auto" }));
  downButton.addEventListener("click", () => resultList.scrollBy({ top: scrollStep(), behavior: "auto" }));
  track.addEventListener("click", (event) => {
    if (event.target !== track) {
      return;
    }
    const thumbRect = thumb.getBoundingClientRect();
    resultList.scrollBy({ top: event.clientY < thumbRect.top ? -resultList.clientHeight : resultList.clientHeight, behavior: "auto" });
  });
  thumb.addEventListener("pointerdown", (event) => {
    dragStart = { y: event.clientY, scrollTop: resultList.scrollTop };
    thumb.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  thumb.addEventListener("pointermove", (event) => {
    if (!dragStart) {
      return;
    }
    const maxScroll = resultList.scrollHeight - resultList.clientHeight;
    const travel = Math.max(1, track.clientHeight - thumb.offsetHeight);
    resultList.scrollTop = dragStart.scrollTop + (event.clientY - dragStart.y) * maxScroll / travel;
  });
  thumb.addEventListener("pointerup", () => {
    dragStart = null;
  });
  thumb.addEventListener("pointercancel", () => {
    dragStart = null;
  });
  resultList.addEventListener("scroll", updateThumb, { passive: true });
  window.addEventListener("resize", () => {
    positionResults();
    refreshScrollbar();
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", positionResults);
    window.visualViewport.addEventListener("scroll", positionResults);
  }
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(refreshScrollbar);
    observer.observe(results);
    observer.observe(resultList);
  }

  input.addEventListener("input", scheduleSearch);
  input.addEventListener("focus", scheduleSearch);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
    }
    if (event.key === "Escape") {
      clearResults();
      input.blur();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) {
      clearResults();
    }
  });

  syncClearButton();
})();
