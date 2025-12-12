/* fishbone.js (v2)
   - Thick spine + arrow + diagonal bones
   - Horizontal "sub-bones" per heading (auto-follow heading position)
   - Drag headings vertically (grab the heading title)
   - Collapsible side settings panel (colours/font/thickness/etc.)
*/

(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Model ----------
  let model = defaultModel();

  function defaultModel() {
    return {
      version: 2,
      effectText: ">40% A&E attendances for HIO (>20 attendances) are for avoidable reasons which can be supported in the community",
      appearance: {
        boneColor: "#c00000",
        boneThickness: 10,
        fontSize: 12,
        arrowWidth: 240,
        labelWidth: 200
      },
      topCategories: [
        makeCategory("Relationships & Culture", 0),
        makeCategory("Communication & Coordination", 0),
        makeCategory("Processes & Procedures", 0)
      ],
      bottomCategories: [
        makeCategory("Resources & Infrastructure", 0),
        makeCategory("Methods & Ways of Working", 0),
        makeCategory("Environment & External Factors", 0)
      ]
    };
  }

  function makeCategory(label, initialYOffset) {
    return {
      id: uid(),
      label: label || "New category",
      blocks: [
        {
          id: uid(),
          title: "Heading",
          bullets: ["Add bullet point…"],
          yOffset: initialYOffset || 0
        }
      ]
    };
  }

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  // ---------- DOM ----------
  const svg = $("bonesSvg");
  const wrapper = $("diagramWrapper");
  const rowTop = $("rowTop");
  const rowBottom = $("rowBottom");
  const effectTextEl = $("effectText");

  // SVG groups so we can redraw parts efficiently
  let gStatic = null;
  let gHeading = null;

  // Drag state
  let drag = null; // { block, el, startY, startOffset, contentEl, side }

  // ---------- Rendering ----------
  function applyAppearance() {
    const a = model.appearance || {};
    document.documentElement.style.setProperty("--bone", a.boneColor || "#c00000");
    document.documentElement.style.setProperty("--bone-thickness", String(a.boneThickness ?? 10));
    document.documentElement.style.setProperty("--diagram-font", (a.fontSize ?? 12) + "px");
    document.documentElement.style.setProperty("--arrow-width", (a.arrowWidth ?? 240) + "px");
    document.documentElement.style.setProperty("--label-width", (a.labelWidth ?? 200) + "px");
  }

  function renderAll() {
    applyAppearance();
    effectTextEl.textContent = model.effectText || "";

    renderRegions(rowTop, model.topCategories, "top");
    renderRegions(rowBottom, model.bottomCategories, "bottom");

    requestAnimationFrame(() => {
      drawStaticBones();
      drawHeadingBones(); // follow headings
    });
  }

  function renderRegions(container, categories, side) {
    container.innerHTML = "";
    container.style.gridTemplateColumns = `repeat(${Math.max(1, categories.length)}, 1fr)`;

    categories.forEach((cat) => {
      const region = document.createElement("div");
      region.className = "region";
      region.dataset.side = side;
      region.dataset.catId = cat.id;

      // Label
      const label = document.createElement("div");
      label.className = `catLabel ${side}`;
      label.contentEditable = "true";
      label.spellcheck = false;
      label.textContent = cat.label || "";
      label.addEventListener("input", () => {
        cat.label = label.textContent.trim() || "Category";
      });

      // Controls
      const controls = document.createElement("div");
      controls.className = "regionControls";

      const btnAddHeading = mkBtn("+ Heading", () => {
        const base = suggestedYOffsetForNewBlock(cat, region);
        cat.blocks.push({ id: uid(), title: "New heading", bullets: ["New bullet…"], yOffset: base });
        renderAll();
      });

      const btnAddBullet = mkBtn("+ Bullet", () => {
        if (!cat.blocks.length) cat.blocks.push({ id: uid(), title: "Heading", bullets: [], yOffset: 0 });
        cat.blocks[cat.blocks.length - 1].bullets.push("New bullet…");
        renderAll();
      });

      const btnRemoveCat = mkBtn("Remove", () => {
        const ok = window.confirm(`Remove category “${cat.label}”?`);
        if (!ok) return;
        if (side === "top") model.topCategories = model.topCategories.filter(c => c.id !== cat.id);
        else model.bottomCategories = model.bottomCategories.filter(c => c.id !== cat.id);
        renderAll();
      }, true);

      controls.appendChild(btnAddHeading);
      controls.appendChild(btnAddBullet);
      controls.appendChild(btnRemoveCat);

      // Content area (positioned)
      const content = document.createElement("div");
      content.className = "content";

      // Place blocks (absolute within content)
      cat.blocks.forEach((block, idx) => {
        const blockEl = document.createElement("div");
        blockEl.className = "block";
        blockEl.dataset.blockId = block.id;
        blockEl.style.top = `${clamp(block.yOffset, -20, 9999)}px`;

        // Title (draggable)
        const title = document.createElement("div");
        title.className = "blockTitle";
        title.contentEditable = "true";
        title.spellcheck = false;
        title.textContent = block.title || "";
        title.dataset.blockId = block.id;

        title.addEventListener("input", () => {
          block.title = title.textContent.trim() || "Heading";
        });

        // Drag on mousedown (only if not currently editing selection)
        title.addEventListener("mousedown", (e) => {
          // prevent dragging when user tries to select text with mouse
          // allow drag if click near left edge or with Alt key
          const nearLeft = (e.offsetX ?? 0) < 12;
          if (!nearLeft && !e.altKey) return;
          e.preventDefault();
          startDrag(block, blockEl, content, side, e.clientY);
        });

        const delBlock = document.createElement("span");
        delBlock.className = "del";
        delBlock.textContent = "✕";
        delBlock.title = "Delete heading";
        delBlock.addEventListener("click", (e) => {
          e.stopPropagation();
          const ok = window.confirm("Delete this heading and all its bullets?");
          if (!ok) return;
          cat.blocks = cat.blocks.filter(b => b.id !== block.id);
          renderAll();
        });
        title.appendChild(delBlock);

        // Bullets
        const ul = document.createElement("ul");
        ul.className = "bullets";
        (block.bullets || []).forEach((txt, i) => {
          const li = document.createElement("li");
          li.contentEditable = "true";
          li.spellcheck = false;
          li.textContent = txt;

          li.addEventListener("input", () => {
            block.bullets[i] = li.textContent.trim();
          });

          const del = document.createElement("span");
          del.className = "del";
          del.textContent = "✕";
          del.title = "Delete bullet";
          del.addEventListener("click", (e) => {
            e.stopPropagation();
            block.bullets.splice(i, 1);
            if (block.bullets.length === 0) block.bullets.push("New bullet…");
            renderAll();
          });

          li.appendChild(del);
          ul.appendChild(li);
        });

        blockEl.appendChild(title);
        blockEl.appendChild(ul);
        content.appendChild(blockEl);

        // If new block has undefined offset, stack it
        if (block.yOffset == null) block.yOffset = idx * 85;
      });

      region.appendChild(label);
      region.appendChild(controls);
      region.appendChild(content);
      container.appendChild(region);
    });
  }

  function mkBtn(text, onClick, danger=false) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = danger ? "chipBtn danger" : "chipBtn";
    b.textContent = text;
    b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function suggestedYOffsetForNewBlock(cat, regionEl) {
    // try to place beneath the lowest existing block
    const content = regionEl.querySelector(".content");
    if (!content) return 0;
    const blocks = content.querySelectorAll(".block");
    let maxBottom = 0;
    blocks.forEach(b => {
      const r = b.getBoundingClientRect();
      const c = content.getBoundingClientRect();
      maxBottom = Math.max(maxBottom, (r.bottom - c.top));
    });
    return Math.round(maxBottom + 18);
  }

  // ---------- Dragging ----------
  function startDrag(block, blockEl, contentEl, side, startClientY) {
    drag = {
      block,
      blockEl,
      contentEl,
      side,
      startY: startClientY,
      startOffset: block.yOffset || 0
    };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup", onDragEnd, { once: true });
  }

  function onDragMove(e) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const newOffset = drag.startOffset + dy;

    // clamp inside content box
    const contentRect = drag.contentEl.getBoundingClientRect();
    // allow a little negative so user can nudge near top
    const min = -10;
    const max = Math.max(min, contentRect.height - 40);

    drag.block.yOffset = clamp(newOffset, min, max);
    drag.blockEl.style.top = `${drag.block.yOffset}px`;

    // bones should follow live without rerender
    drawHeadingBones();
  }

  function onDragEnd() {
    document.removeEventListener("mousemove", onDragMove);
    drag = null;
    // final tidy redraw
    drawHeadingBones();
  }

  // ---------- Bones drawing ----------
  function ensureGroups() {
    if (!gStatic) {
      gStatic = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(gStatic);
    }
    if (!gHeading) {
      gHeading = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(gHeading);
    }
  }

  function clearGroup(g) {
    while (g.firstChild) g.removeChild(g.firstChild);
  }

  function drawStaticBones() {
    ensureGroups();
    clearGroup(gStatic);

    const W = 1200, H = 720;
    const midY = Math.round(H * 0.5);

    const a = model.appearance || {};
    const boneStroke = a.boneColor || cssVar("--bone");
    const boneStrokeDark = cssVar("--bone-dark");
    const thickness = Number(a.boneThickness ?? 10);

    const marginL = 60;
    const arrowW = Number(a.arrowWidth ?? 240);
    const arrowX = W - arrowW;
    const spineStart = marginL;
    const spineEnd = arrowX - 24;

    // Spine
    addLine(gStatic, spineStart, midY, spineEnd, midY, boneStroke, thickness);

    // Arrow head
    const arrowTop = midY - 95;
    const arrowBot = midY + 95;
    const arrowTipX = W - 18;
    const arrowBodyX = arrowX;

    addPath(gStatic, [
      `M ${arrowBodyX} ${arrowTop}`,
      `L ${arrowTipX} ${midY}`,
      `L ${arrowBodyX} ${arrowBot}`,
      `L ${arrowBodyX} ${arrowTop}`,
      "Z"
    ].join(" "), boneStroke, boneStrokeDark);

    // Left small tail
    addLine(gStatic, spineStart - 40, midY, spineStart, midY, boneStroke, Math.max(4, thickness - 4));

    // Diagonals aligned to category boundaries (DOM-based)
    drawSideSeparators(gStatic, "top", spineStart, spineEnd, midY, thickness, boneStroke);
    drawSideSeparators(gStatic, "bottom", spineStart, spineEnd, midY, thickness, boneStroke);
  }

  function drawSideSeparators(group, side, spineStart, spineEnd, midY, thickness, stroke) {
    const W = 1200, H = 720;
    const row = side === "top" ? rowTop : rowBottom;
    const wrapRect = wrapper.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    const yEdge = side === "top" ? 40 : (H - 40);

    // Build boundary x positions from grid regions
    const regions = row.querySelectorAll(".region");
    const boundariesPx = [];
    boundariesPx.push(rowRect.left - wrapRect.left + 10);
    regions.forEach(r => {
      const rr = r.getBoundingClientRect();
      boundariesPx.push(rr.right - wrapRect.left - 10);
    });

    // If we can't measure yet, fallback to uniform
    if (!rowRect.width || boundariesPx.length < 2) {
      const n = Math.max(1, regions.length || 3);
      const step = (spineEnd - spineStart) / (n + 1);
      for (let i = 0; i <= n; i++) {
        const t = i / (n + 0.5);
        const xEdge = spineStart + t * (spineEnd - spineStart) * 0.55;
        const xSpine = spineStart + step * (i + 0.8);
        addLine(group, xSpine, midY, xEdge, yEdge, stroke, thickness);
      }
      return;
    }

    boundariesPx.forEach((xEdgePx, idx) => {
      const xEdge = pxToSvgX(xEdgePx, wrapRect.width);
      const t = idx / Math.max(1, boundariesPx.length - 1);
      const xSpine = spineStart + t * (spineEnd - spineStart) * 0.92 + 18;
      addLine(group, xSpine, midY, xEdge, yEdge, stroke, thickness);
    });

    function pxToSvgX(px, wrapW) {
      const W = 1200;
      return clamp((px / wrapW) * W, 0, W);
    }
  }

  // Horizontal “heading bones” (follow heading positions)
  function drawHeadingBones() {
    ensureGroups();
    clearGroup(gHeading);

    const a = model.appearance || {};
    const stroke = a.boneColor || cssVar("--bone");
    const thickness = Math.max(2, Number(a.boneThickness ?? 10) - 4);

    const wrapRect = wrapper.getBoundingClientRect();
    const wrapW = wrapRect.width;
    const W = 1200;

    // For each block title, draw a small horizontal rib behind it
    const titles = wrapper.querySelectorAll(".blockTitle[data-block-id]");
    titles.forEach((t) => {
      const r = t.getBoundingClientRect();

      // Ignore if not visible
      if (r.width < 2 || r.height < 2) return;

      // Convert to svg coords
      const y = ((r.top + r.height * 0.65) - wrapRect.top) / wrapRect.height * 720;
      const xLeft = ((r.left - wrapRect.left) / wrapW) * W;

      // Start a bit left of the text, extend right
      const start = clamp(xLeft - 18, 0, W);
      const len = 130;
      const end = clamp(start + len, 0, W);

      addLine(gHeading, start, y, end, y, stroke, thickness);
    });
  }

  function addLine(group, x1, y1, x2, y2, stroke, width) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", String(width));
    el.setAttribute("stroke-linecap", "butt");
    group.appendChild(el);
  }

  function addPath(group, d, fill, stroke) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", fill);
    group.appendChild(p);

    const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
    outline.setAttribute("d", d);
    outline.setAttribute("fill", "none");
    outline.setAttribute("stroke", stroke);
    outline.setAttribute("stroke-width", "2");
    group.appendChild(outline);
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#c00000";
  }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  // ---------- Interactions ----------
  $("addTopBtn").addEventListener("click", () => {
    model.topCategories.push(makeCategory("New top category", 0));
    renderAll();
  });

  $("addBottomBtn").addEventListener("click", () => {
    model.bottomCategories.push(makeCategory("New bottom category", 0));
    renderAll();
  });

  effectTextEl.addEventListener("input", () => {
    model.effectText = effectTextEl.textContent.trim();
  });

  // ---------- Side panel ----------
  const sidePanel = $("sidePanel");
  $("openPanel").addEventListener("click", () => sidePanel.classList.add("open"));
  $("closePanel").addEventListener("click", () => sidePanel.classList.remove("open"));

  // Controls (sync from model -> UI)
  function syncControlsFromModel() {
    const a = model.appearance || {};
    $("boneColor").value = a.boneColor || "#c00000";
    $("boneThickness").value = String(a.boneThickness ?? 10);
    $("fontSize").value = String(a.fontSize ?? 12);
    $("arrowWidth").value = String(a.arrowWidth ?? 240);
    $("labelWidth").value = String(a.labelWidth ?? 200);
  }

  function wireAppearanceControls() {
    $("boneColor").addEventListener("input", (e) => {
      model.appearance.boneColor = e.target.value;
      applyAppearance();
      drawStaticBones();
      drawHeadingBones();
    });

    $("boneThickness").addEventListener("input", (e) => {
      model.appearance.boneThickness = Number(e.target.value);
      applyAppearance();
      drawStaticBones();
      drawHeadingBones();
    });

    $("fontSize").addEventListener("input", (e) => {
      model.appearance.fontSize = Number(e.target.value);
      applyAppearance();
      drawHeadingBones();
    });

    $("arrowWidth").addEventListener("input", (e) => {
      model.appearance.arrowWidth = Number(e.target.value);
      applyAppearance();
      drawStaticBones();
      drawHeadingBones();
    });

    $("labelWidth").addEventListener("input", (e) => {
      model.appearance.labelWidth = Number(e.target.value);
      applyAppearance();
    });
  }

  // ---------- Export / import ----------
  $("btnExportJSON").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fishbone-model.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  $("fileImportJSON").addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result || ""));
        if (!obj || !Array.isArray(obj.topCategories) || !Array.isArray(obj.bottomCategories)) {
          alert("That JSON does not look like a fishbone model.");
          return;
        }

        // light sanitisation
        model = {
          version: 2,
          effectText: String(obj.effectText || ""),
          appearance: { ...defaultModel().appearance, ...(obj.appearance || {}) },
          topCategories: (obj.topCategories || []).map(sanitizeCategory),
          bottomCategories: (obj.bottomCategories || []).map(sanitizeCategory)
        };

        syncControlsFromModel();
        renderAll();
      } catch (err) {
        console.error(err);
        alert("Could not read JSON.");
      }
    };
    reader.readAsText(file, "utf-8");
  });

  function sanitizeCategory(cat) {
    const c = {
      id: String(cat.id || uid()),
      label: String(cat.label || "Category"),
      blocks: Array.isArray(cat.blocks) ? cat.blocks : []
    };
    c.blocks = c.blocks.map(b => ({
      id: String(b.id || uid()),
      title: String(b.title || "Heading"),
      bullets: Array.isArray(b.bullets) ? b.bullets.map(x => String(x)) : ["New bullet…"],
      yOffset: typeof b.yOffset === "number" ? b.yOffset : 0
    }));
    if (!c.blocks.length) c.blocks.push({ id: uid(), title: "Heading", bullets: ["New bullet…"], yOffset: 0 });
    return c;
  }

  // PNG export
  $("btnExportPNG").addEventListener("click", async () => {
    wrapper.classList.add("export-clean");
    try {
      const canvas = await html2canvas(wrapper, { scale: 2 });
      const a = document.createElement("a");
      a.download = "fishbone-diagram.png";
      a.href = canvas.toDataURL("image/png");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (e) {
      console.error(e);
      alert("Could not export PNG.");
    } finally {
      wrapper.classList.remove("export-clean");
    }
  });

  // PDF export
  $("btnExportPDF").addEventListener("click", async () => {
    wrapper.classList.add("export-clean");
    try {
      const opt = {
        margin: 8,
        filename: "fishbone-diagram.pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }
      };
      await html2pdf().from(wrapper).set(opt).save();
    } catch (e) {
      console.error(e);
      alert("Could not export PDF.");
    } finally {
      wrapper.classList.remove("export-clean");
    }
  });

  // Reset
  $("btnReset").addEventListener("click", () => {
    const ok = window.confirm("Reset to a fresh fishbone model?");
    if (!ok) return;
    model = defaultModel();
    syncControlsFromModel();
    renderAll();
  });

  // Re-align on resize
  window.addEventListener("resize", () => {
    drawStaticBones();
    drawHeadingBones();
  });

  // ---------- Init ----------
  syncControlsFromModel();
  wireAppearanceControls();
  renderAll();

})();
