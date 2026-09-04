(() => {
  "use strict";

  const glyphs = [
        { id:'A', base:['M22 103 Q42 74 50 18'], latin:['M50 18 L79 103','M35 68 L67 68'], formed:['M19 37 L76 37','M72 37 L72 86'] },
        { id:'B', base:['M29 18 L29 103'], latin:['M29 18 C55 18 69 24 69 36 C69 47 56 55 29 55','M29 55 C58 55 72 64 72 78 C72 92 58 102 29 102'], formed:['M29 56 L70 56','M68 25 L68 91'] },
        { id:'C', base:['M28 21 L28 99'], latin:['M28 21 L77 21','M28 99 L77 99'], formed:['M28 21 L72 21','M28 99 L72 99','M72 21 L72 43'] },
{ id:'D', base:['M28 20 L28 101'], latin:['M28 20 C97 18 97 101 28 101'], formed:['M28 20 L68 20 L68 88','M68 88 L60 94'] },
        { id:'E', base:['M28 19 L28 102'], latin:['M28 20 L75 20','M28 58 L66 58','M28 101 L75 101'], formed:['M28 32 L76 32','M28 59 L68 59','M28 89 L76 89'] },
        { id:'F', base:['M30 19 L30 102'], latin:['M30 20 L75 20','M30 58 L67 58'], formed:['M16 39 L75 39','M31 64 L66 64'] },
        { id:'G', base:['M28 34 C21 47 20 70 26 86'], latin:['M28 34 C38 17 62 16 77 29','M26 86 C36 102 58 106 71 96 C78 91 81 80 79 69','M79 69 L59 69'], formed:['M22 28 Q49 25 76 31','M70 40 L70 86 Q70 99 82 99'] },
        { id:'H', base:['M28 18 L28 103'], latin:['M74 18 L74 103','M28 60 L74 60'], formed:['M72 18 L72 103','M28 60 L72 60'] },
        { id:'I', base:['M51 20 L51 101'], latin:['M29 20 L73 20','M29 101 L73 101'], formed:['M20 41 L79 41','M25 68 L74 68'] },
        { id:'J', base:['M68 20 L68 78 Q68 102 44 102 Q26 102 22 88'], latin:['M36 20 L68 20'], formed:['M22 37 L73 37'] },
        { id:'K', base:['M29 18 L29 103'], latin:['M75 20 L29 65','M45 50 L79 103'], formed:['M29 55 L66 30','M29 82 L76 68'] },
        { id:'L', base:['M29 18 L29 101'], latin:['M29 101 L77 101'], formed:['M29 101 L77 101'] },
        { id:'M', base:['M28 20 L28 103'], latin:['M28 20 Q37 55 50 91 Q63 55 72 20','M72 20 L72 103'], formed:['M17 42 L82 42','M69 20 L69 72'] },
        { id:'N', base:['M27 18 L27 102'], latin:['M27 18 L74 102','M74 102 L74 18'], formed:['M27 18 L74 80','M74 18 L74 102'] },
        { id:'O', base:['M28 20 L28 100'], latin:['M28 20 L73 20 L73 100 L28 100'], formed:['M28 20 L73 20','M73 20 L73 100','M73 100 L28 100'] },
        { id:'P', base:['M28 18 L28 103'], latin:['M28 20 L69 20 L69 61 L28 61'], formed:['M28 31 L70 31 L70 72 L28 72'] },
        { id:'Q', base:['M29 28 L29 82'], latin:['M29 28 L29 18 L75 18 L75 101 L29 101 L29 82','M53 73 L81 104'], formed:['M29 28 L70 28 L70 82 L29 82','M49.5 82 L49.5 103'] },
        { id:'R', base:['M28 18 L28 103'], latin:['M28 20 L68 20 L68 59 L28 59','M48 59 L78 103'], formed:['M28 31 L72 31 L72 63 L28 63','M72 63 L72 96'] },
        { id:'S', base:['M39 52 C48 47 59 48 68 55'], latin:['M70 28 C64 20 55 17 45 18 C31 18 20 25 20 36 C20 45 28 50 39 52','M68 55 C78 62 79 74 74 85 C69 97 56 103 43 102 C31 101 22 96 17 88'], formed:['M29 34 L70 34 L70 48 Q70 53 68 55','M39 52 Q20 64 30 84 Q43 103 67 89'] },
        { id:'T', base:['M50 19 L50 102'], latin:['M22 20 L78 20'], formed:['M18 35 L82 35'] },
        { id:'U', base:['M27 18 L27 78'], latin:['M27 78 C27 94 37 103 50 103 C63 103 73 94 73 78 L73 18'], formed:['M27 78 L27 102 L74 102 L74 18'] },
        { id:'V', base:['M24 20 L51 101'], latin:['M51 101 L79 20'], formed:['M79 20 Q69 62 51 101'] },
        { id:'W', base:['M25 20 L43 101'], latin:['M43 101 L54 53 L67 101 L80 20'], formed:['M76 20 L33.5 58','M33.5 58 L70 58'] },
        { id:'X', base:['M24 20 L79 102'], latin:['M79 20 L24 102'], formed:['M41 71 L64 52'] },
        { id:'Y', base:['M50 61 Q49 89 66 101'], latin:['M23 20 L50 61','M78 20 L50 61'], formed:['M22 45 Q51 42 77 48','M50 44 L50 61'] },
        { id:'Z', base:['M79 20 L25 102'], latin:['M25 20 L79 20','M25 102 L79 102'], formed:['M16 43 L84 43','M22 86 L34 91'] }
      ];

  const NS = "http://www.w3.org/2000/svg";
  const RED_DOT_LETTERS = new Set(["C", "E", "J", "P", "V", "X"]);
  const INTERLEAVED_ORDER = [...Array(13).keys()].flatMap((i) => [i, i + 13]);
  const ORDER_RANK = new Map(INTERLEAVED_ORDER.map((index, rank) => [index, rank]));

  function createShell(root) {
    if (root.dataset.formalWaitingReady === "true") return;
    root.dataset.formalWaitingReady = "true";
    root.innerHTML = `
      <div class="mi-frame">
        <div class="mi-frame-inner">
          <header class="mi-header">
            <div class="mi-brand">Name Translator</div>
            <div class="mi-status" aria-live="polite">
              <span class="mi-phase-dot"></span>
              <span class="mi-status-text">English glyphs</span>
              <span class="mi-controls">
                <button class="mi-pause" type="button" title="Pause animation" aria-label="Pause animation">?</button>
                <button class="mi-replay" type="button" title="Replay animation" aria-label="Replay animation">?</button>
              </span>
            </div>
          </header>
          <main class="mi-stage">
            <div class="mi-grid" aria-label="Animated A to Z glyph transformation"></div>
          </main>
          <footer class="mi-footer">
            <div class="mi-card-icon" aria-hidden="true"></div>
            <div class="mi-prompt">TAKE YOUR TRACE CARD</div>
            <div class="mi-subprompt">CLEAR THE FIELD BEFORE THE NEXT RESIDUE</div>
          </footer>
        </div>
      </div>`;
  }

  function createPath(svg, d, cls) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", `mi-stroke ${cls}`);
    svg.appendChild(path);
    return path;
  }

  function buildGlyphs(root) {
    const grid = root.querySelector(".mi-grid");
    if (!grid || grid.childElementCount) return;

    glyphs.forEach((glyph) => {
      const cell = document.createElement("div");
      cell.className = "mi-glyph";
      cell.dataset.letter = glyph.id;

      const label = document.createElement("span");
      label.className = "mi-label";
      label.textContent = glyph.id;

      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "5 7 90 106");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", glyph.id);

      glyph.base.forEach((d) => createPath(svg, d, "mi-trace mi-base-trace"));
      glyph.latin.forEach((d) => createPath(svg, d, "mi-trace mi-latin-trace"));
      glyph.formed.forEach((d) => createPath(svg, d, "mi-trace mi-formed-trace"));
      glyph.latin.forEach((d) => createPath(svg, d, "mi-detail mi-latin"));
      glyph.formed.forEach((d) => createPath(svg, d, "mi-detail mi-formed"));
      glyph.base.forEach((d) => createPath(svg, d, "mi-base"));

      if (RED_DOT_LETTERS.has(glyph.id)) {
        const dot = document.createElementNS(NS, "circle");
        dot.setAttribute("class", "mi-red-dot");
        dot.setAttribute("cx", glyph.id === "J" ? "18" : glyph.id === "X" ? "67" : "84");
        dot.setAttribute("cy", glyph.id === "V" ? "106" : glyph.id === "X" ? "40" : "105");
        dot.setAttribute("r", "2.2");
        svg.appendChild(dot);
      }

      cell.append(label, svg);
      grid.appendChild(cell);
    });
  }

  function createAnimator(root) {
    createShell(root);
    buildGlyphs(root);

    const DESIGN_WIDTH = 1920;
    const DESIGN_HEIGHT = 1080;
    const fitFrame = () => {
      const width = root.clientWidth || window.innerWidth || DESIGN_WIDTH;
      const height = root.clientHeight || window.innerHeight || DESIGN_HEIGHT;
      const scale = Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
      root.style.setProperty("--mi-scale", String(Number.isFinite(scale) && scale > 0 ? scale : 1));
    };

    const statusText = root.querySelector(".mi-status-text");
    const pauseButton = root.querySelector(".mi-pause");
    const replayButton = root.querySelector(".mi-replay");
    const cells = [...root.querySelectorAll(".mi-glyph")];
    const baseGroups = cells.map((cell) => [...cell.querySelectorAll(".mi-base")]);
    const latinGroups = cells.map((cell) => [...cell.querySelectorAll(".mi-latin")]);
    const formedGroups = cells.map((cell) => [...cell.querySelectorAll(".mi-formed")]);
    const baseTraceGroups = cells.map((cell) => [...cell.querySelectorAll(".mi-base-trace")]);
    const latinTraceGroups = cells.map((cell) => [...cell.querySelectorAll(".mi-latin-trace")]);
    const formedTraceGroups = cells.map((cell) => [...cell.querySelectorAll(".mi-formed-trace")]);
    const dotGroups = cells.map((cell) => [...cell.querySelectorAll(".mi-red-dot")]);

    let generation = 0;
    let running = false;
    let paused = false;
    let activeAnimations = [];
    let visible = true;
    let mode = "waiting";
    fitFrame();
    window.addEventListener("resize", fitFrame);

    const setStatus = (text) => { if (statusText) statusText.textContent = text; };

    const wait = (ms, token) => new Promise((resolve) => {
      let elapsed = 0;
      let previous = performance.now();
      const tick = (now) => {
        if (token !== generation || !running) return resolve(false);
        if (paused) {
          previous = now;
          return requestAnimationFrame(tick);
        }
        elapsed += now - previous;
        previous = now;
        if (elapsed >= ms) return resolve(true);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    const preparePath = (path, pathVisible, isTrace = false) => {
      const length = Math.max(1, path.getTotalLength());
      path.dataset.length = String(length);
      path.style.strokeDasharray = `${length} ${length}`;
      path.style.strokeDashoffset = pathVisible ? "0" : `${length}`;
      path.style.opacity = pathVisible && !isTrace ? "1" : "0";
    };

    const prepareAll = () => {
      baseGroups.flat().forEach((path) => preparePath(path, false));
      latinGroups.flat().forEach((path) => preparePath(path, false));
      formedGroups.flat().forEach((path) => preparePath(path, false));
      baseTraceGroups.flat().forEach((path) => preparePath(path, false, true));
      latinTraceGroups.flat().forEach((path) => preparePath(path, false, true));
      formedTraceGroups.flat().forEach((path) => preparePath(path, false, true));
      dotGroups.flat().forEach((dot) => { dot.style.opacity = "0"; });
    };

    const cancelAnimations = () => {
      activeAnimations.forEach((animation) => animation.cancel());
      activeAnimations = [];
    };

    const animateEnglishWriting = async (token) => {
      const promises = [];

      cells.forEach((_cell, index) => {
        const rank = ORDER_RANK.get(index) ?? index;
        const paths = [...baseGroups[index], ...latinGroups[index]];
        const traces = [...baseTraceGroups[index], ...latinTraceGroups[index]];
        let strokeCursor = 0;

        paths.forEach((path, partIndex) => {
          const trace = traces[partIndex];
          const length = Number(path.dataset.length || path.getTotalLength());
          const traceLength = Number(trace?.dataset.length || length);
          const duration = Math.max(500, Math.min(920, length * 8));
          const delay = rank * 72 + strokeCursor;

          if (trace) {
            const traceAnimation = trace.animate([
              { strokeDashoffset: traceLength, opacity: 0 },
              { strokeDashoffset: traceLength * 0.72, opacity: 0.12, offset: 0.18 },
              { strokeDashoffset: traceLength * 0.24, opacity: 0.26, offset: 0.7 },
              { strokeDashoffset: 0, opacity: 0 }
            ], {
              duration: duration + 150,
              delay,
              easing: "cubic-bezier(.2,.58,.16,1)",
              fill: "forwards"
            });
            if (paused) traceAnimation.pause();
            activeAnimations.push(traceAnimation);
            promises.push(traceAnimation.finished.catch(() => null));
          }

          const inkAnimation = path.animate([
            { strokeDashoffset: length, opacity: 0.06 },
            { strokeDashoffset: length * 0.8, opacity: 0.2, offset: 0.18 },
            { strokeDashoffset: length * 0.38, opacity: 0.58, offset: 0.62 },
            { strokeDashoffset: 0, opacity: 1 }
          ], {
            duration,
            delay: delay + 95,
            easing: "cubic-bezier(.22,.68,.18,1)",
            fill: "forwards"
          });
          if (paused) inkAnimation.pause();
          activeAnimations.push(inkAnimation);
          promises.push(inkAnimation.finished.catch(() => null));

          strokeCursor += duration * 0.78;
        });
      });

      await Promise.all(promises);
      if (token !== generation || !running) return false;
      baseGroups.flat().forEach((path) => preparePath(path, true));
      latinGroups.flat().forEach((path) => preparePath(path, true));
      [...baseTraceGroups.flat(), ...latinTraceGroups.flat()].forEach((path) => { path.style.opacity = "0"; });
      return true;
    };

    const animateStructure = async (groups, traceGroups, reveal, token, reverse = false) => {
      const promises = [];
      groups.forEach((paths, index) => {
        const rank = ORDER_RANK.get(reverse ? 25 - index : index) ?? index;
        paths.forEach((path, partIndex) => {
          const trace = traceGroups[index][partIndex];
          const length = Number(path.dataset.length || path.getTotalLength());
          const traceLength = Number(trace?.dataset.length || length);
          const delay = rank * 58 + partIndex * 430;

          if (trace) {
            const traceFrames = reveal
              ? [
                  { strokeDashoffset: traceLength, opacity: 0 },
                  { strokeDashoffset: traceLength * 0.68, opacity: 0.16, offset: 0.2 },
                  { strokeDashoffset: 0, opacity: 0.3, offset: 0.82 },
                  { strokeDashoffset: 0, opacity: 0 }
                ]
              : [
                  { strokeDashoffset: 0, opacity: 0 },
                  { strokeDashoffset: traceLength * 0.16, opacity: 0.28, offset: 0.18 },
                  { strokeDashoffset: traceLength, opacity: 0 }
                ];
            const traceAnimation = trace.animate(traceFrames, {
              duration: reveal ? 820 : 680,
              delay,
              easing: reveal ? "cubic-bezier(.22,.64,.18,1)" : "cubic-bezier(.42,0,.74,.35)",
              fill: "forwards"
            });
            if (paused) traceAnimation.pause();
            activeAnimations.push(traceAnimation);
            promises.push(traceAnimation.finished.catch(() => null));
          }

          const inkFrames = reveal
            ? [
                { strokeDashoffset: length, opacity: 0.08 },
                { strokeDashoffset: length * 0.72, opacity: 0.2, offset: 0.22 },
                { strokeDashoffset: length * 0.28, opacity: 0.62, offset: 0.64 },
                { strokeDashoffset: 0, opacity: 1 }
              ]
            : [
                { strokeDashoffset: 0, opacity: 1 },
                { strokeDashoffset: length * 0.42, opacity: 0.48, offset: 0.55 },
                { strokeDashoffset: length, opacity: 0 }
              ];
          const animation = path.animate(inkFrames, {
            duration: reveal ? 690 : 610,
            delay: reveal ? delay + 105 : delay,
            easing: reveal ? "cubic-bezier(.24,.68,.2,1)" : "cubic-bezier(.4,0,.7,.34)",
            fill: "forwards"
          });
          if (paused) animation.pause();
          activeAnimations.push(animation);
          promises.push(animation.finished.catch(() => null));
        });
      });

      await Promise.all(promises);
      if (token !== generation || !running) return false;
      groups.flat().forEach((path) => {
        const length = Number(path.dataset.length || 1);
        path.style.strokeDashoffset = reveal ? "0" : `${length}`;
        path.style.opacity = reveal ? "1" : "0";
      });
      traceGroups.flat().forEach((path) => {
        const length = Number(path.dataset.length || 1);
        path.style.strokeDashoffset = reveal ? "0" : `${length}`;
        path.style.opacity = "0";
      });
      return true;
    };

    const animateDots = (show) => {
      dotGroups.flat().forEach((dot, index) => {
        const animation = dot.animate(
          [{ opacity: show ? 0 : 0.72 }, { opacity: show ? 0.72 : 0 }],
          { duration: 420, delay: index * 35, easing: "ease-out", fill: "forwards" }
        );
        if (paused) animation.pause();
        activeAnimations.push(animation);
      });
    };

    const run = async () => {
      generation += 1;
      const token = generation;
      running = true;
      cancelAnimations();
      prepareAll();

      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setStatus("Rebuilt characters");
        baseGroups.flat().forEach((path) => preparePath(path, true));
        latinGroups.flat().forEach((path) => preparePath(path, false));
        formedGroups.flat().forEach((path) => preparePath(path, true));
        return;
      }

      setStatus("Growing English glyphs");
      if (!await animateEnglishWriting(token)) return;
      animateDots(true);
      setStatus("English glyphs");

      while (token === generation && running) {
        if (!await wait(2200, token)) break;

        setStatus("Returning to fixed base strokes");
        animateDots(false);
        if (!await animateStructure(latinGroups, latinTraceGroups, false, token, true)) break;
        if (!await wait(620, token)) break;

        setStatus("Growing rebuilt characters");
        if (!await animateStructure(formedGroups, formedTraceGroups, true, token, false)) break;
        animateDots(true);
        setStatus("Rebuilt characters");
        if (!await wait(2400, token)) break;

        setStatus("Returning to fixed base strokes");
        animateDots(false);
        if (!await animateStructure(formedGroups, formedTraceGroups, false, token, true)) break;
        if (!await wait(620, token)) break;

        setStatus("Regrowing English glyphs");
        if (!await animateStructure(latinGroups, latinTraceGroups, true, token, false)) break;
        animateDots(true);
        setStatus("English glyphs");
      }
    };

    const setRootVisible = () => {
      root.style.opacity = visible && mode === "waiting" ? "1" : "0";
    };

    const pause = () => {
      paused = !paused;
      if (pauseButton) {
        pauseButton.textContent = paused ? "?" : "?";
        pauseButton.setAttribute("aria-label", paused ? "Resume animation" : "Pause animation");
        pauseButton.title = paused ? "Resume animation" : "Pause animation";
      }
      activeAnimations.forEach((animation) => paused ? animation.pause() : animation.play());
    };

    const replay = () => {
      paused = false;
      if (pauseButton) {
        pauseButton.textContent = "?";
        pauseButton.setAttribute("aria-label", "Pause animation");
        pauseButton.title = "Pause animation";
      }
      run();
    };

    if (pauseButton && pauseButton.dataset.bound !== "true") {
      pauseButton.dataset.bound = "true";
      pauseButton.addEventListener("click", pause);
    }
    if (replayButton && replayButton.dataset.bound !== "true") {
      replayButton.dataset.bound = "true";
      replayButton.addEventListener("click", replay);
    }

    return {
      start() {
        if (running) return;
        setRootVisible();
        run();
      },
      stop() {
        running = false;
        generation += 1;
        cancelAnimations();
      },
      resize() {
        fitFrame();
        return true;
      },
      setVisible(nextVisible) {
        visible = Boolean(nextVisible);
        setRootVisible();
      },
      setMode(nextMode) {
        const normalizedMode = nextMode === "writing" ? "writing" : "waiting";
        if (normalizedMode === mode) return;
        mode = normalizedMode;
        setRootVisible();
        if (mode === "waiting" && visible) replay();
      },
      destroy() {
        running = false;
        generation += 1;
        cancelAnimations();
        window.removeEventListener("resize", fitFrame);
        root.removeAttribute("data-formal-waiting-ready");
        root.innerHTML = "";
      },
      pause,
      replay,
    };
  }

  function createRenderer(canvas) {
    if (!canvas) throw new Error("MiZiWaitingScene requires a canvas");
    const host = canvas.closest("#waitingRitual") || canvas.parentElement || document.body;
    let root = host.querySelector("#mi-zi-waiting-motion");
    if (!root) {
      root = document.createElement("div");
      root.id = "mi-zi-waiting-motion";
      root.setAttribute("aria-hidden", "true");
      host.appendChild(root);
    }
    canvas.style.display = "none";
    return createAnimator(root);
  }

  let instance = null;
  window.MiZiWaitingScene = {
    init(canvas, options = {}) {
      if (instance) instance.destroy();
      instance = createRenderer(canvas, options);
      return instance;
    },
    start() { if (instance) instance.start(); },
    stop() { if (instance) instance.stop(); },
    resize() { if (instance) instance.resize(); },
    setVisible(isVisible, options) { if (instance) instance.setVisible(isVisible, options); },
    setMode(mode, options) { if (instance) instance.setMode(mode, options); },
    destroy() { if (instance) { instance.destroy(); instance = null; } },
    data: { glyphs },
  };
})();
