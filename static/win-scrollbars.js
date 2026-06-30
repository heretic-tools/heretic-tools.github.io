(() => {
  function setupWinScrollbars() {
    document.querySelectorAll(".panel").forEach((panel) => {
      const content = panel.querySelector(".panel-content");
      if (!content || panel.dataset.scrollbarReady === "true") {
        return;
      }

      panel.dataset.scrollbarReady = "true";
      const scrollbar = document.createElement("div");
      scrollbar.className = "win-scrollbar";
      scrollbar.hidden = true;
      scrollbar.innerHTML = `
        <button class="scroll-button scroll-button-up" type="button" aria-label="Scroll up"></button>
        <div class="scroll-track"><div class="scroll-thumb"></div></div>
        <button class="scroll-button scroll-button-down" type="button" aria-label="Scroll down"></button>
      `;
      panel.appendChild(scrollbar);

      const upButton = scrollbar.querySelector(".scroll-button-up");
      const downButton = scrollbar.querySelector(".scroll-button-down");
      const track = scrollbar.querySelector(".scroll-track");
      const thumb = scrollbar.querySelector(".scroll-thumb");

      function scrollStep() {
        return Math.max(64, Math.floor(content.clientHeight * 0.35));
      }

      function measureBaseMaxScroll() {
        const hadScrollbar = panel.classList.contains("is-scrollable");
        if (hadScrollbar) {
          panel.classList.remove("is-scrollable");
        }
        const maxScroll = content.scrollHeight - content.clientHeight;
        if (hadScrollbar) {
          panel.classList.add("is-scrollable");
        }
        return maxScroll;
      }

      function updateThumb() {
        const maxScroll = Math.max(0, content.scrollHeight - content.clientHeight);
        const trackHeight = track.clientHeight;
        const thumbHeight = Math.max(24, Math.floor(content.clientHeight / content.scrollHeight * trackHeight));
        const travel = Math.max(0, trackHeight - thumbHeight);
        const thumbTop = maxScroll ? Math.round(content.scrollTop / maxScroll * travel) : 0;
        thumb.style.height = `${thumbHeight}px`;
        thumb.style.transform = `translateY(${thumbTop}px)`;
      }

      function refreshScrollbar() {
        const isScrollable = measureBaseMaxScroll() > 1;
        panel.classList.toggle("is-scrollable", isScrollable);
        scrollbar.hidden = !isScrollable;
        if (isScrollable) {
          updateThumb();
        }
      }

      upButton.addEventListener("click", () => content.scrollBy({ top: -scrollStep(), behavior: "auto" }));
      downButton.addEventListener("click", () => content.scrollBy({ top: scrollStep(), behavior: "auto" }));
      track.addEventListener("click", (event) => {
        if (event.target !== track) {
          return;
        }
        const thumbRect = thumb.getBoundingClientRect();
        content.scrollBy({ top: event.clientY < thumbRect.top ? -content.clientHeight : content.clientHeight, behavior: "auto" });
      });

      let dragStart = null;
      thumb.addEventListener("pointerdown", (event) => {
        dragStart = { y: event.clientY, scrollTop: content.scrollTop };
        thumb.setPointerCapture(event.pointerId);
        event.preventDefault();
      });
      thumb.addEventListener("pointermove", (event) => {
        if (!dragStart) {
          return;
        }
        const maxScroll = content.scrollHeight - content.clientHeight;
        const travel = Math.max(1, track.clientHeight - thumb.offsetHeight);
        content.scrollTop = dragStart.scrollTop + (event.clientY - dragStart.y) * maxScroll / travel;
      });
      thumb.addEventListener("pointerup", () => {
        dragStart = null;
      });
      thumb.addEventListener("pointercancel", () => {
        dragStart = null;
      });

      content.addEventListener("scroll", updateThumb, { passive: true });
      window.addEventListener("resize", refreshScrollbar);
      if ("ResizeObserver" in window) {
        const observer = new ResizeObserver(refreshScrollbar);
        observer.observe(panel);
        observer.observe(content);
      }
      requestAnimationFrame(refreshScrollbar);
    });
  }

  window.setupWinScrollbars = setupWinScrollbars;
})();
