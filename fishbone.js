/* fishbone.js (v3)
   Improvements:
   - One diagonal "main bone" per category (not between categories)
   - Heading drag via dedicated grab handle (no conflict with contenteditable)
   - Heading rib attaches to diagonal bone and stays attached while moving
   - Heading text sits above rib (no overlap)
   - Arrow/effect text is draggable (with its own handle)
*/

(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Model ----------
  let model = defaultModel();

  function defaultModel() {
    return {
      version: 3,
      effectText: ">40% A&E attendances for HIO (>20 attendances) are for avoidable reasons which can be supported in the community",
      effectPos: { dx: 0, dy: 0 }, // px offset applied to effect box (in wrapper coordinates)
      appearance: {
        boneColor: "#c00000",
        boneThickness: 10,
        fontSize: 12,
        arrowWidth: 240,
        labelWidth: 200,
        ribLength: 150,
        blockWidth: 260
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
  const effectBox = $("effectBox");
  const effectDrag = $("effectDrag");

  // SVG groups
  let gStatic = null;
  let gRibs = null;

  // Cached category bone definitions: catId -> { xSpine, ySpine, xEdge, yEdge }
  const catBones = new Map();

  // Drag state
  let headingDrag = null; // { block, blockEl, contentEl, catId, side, startY, startOffset }
  let effectDragState = null; // { startX, startY, startDx, startDy }

  // ---------- Appearance ----------
  function applyAppearance() {
    const a = model.appearance || {};
    document.documentElement.style.setProperty("--bone", a.boneColor || "#c00000");
    document.documentElement.style.setProperty("--bone-thickness", String(a.boneThickness ?? 10));
    document.documentElement.style.setProperty("--diagram-font", (a.fontSize ?? 12) + "px");
    document.documentElement.style.setProperty("--arrow-width", (a.arrowWidth ?? 240) + "px");
    document.documentElement.style.setProperty("--label-width", (a.labelWidth ?? 200) + "px");
    document.documentElement.style.setProperty("--rib-length", (a.ribLength ?? 150) + "px");
    document.documentElement.style.setProperty("--block-width", (a.blockWidth ?? 260) + "px");

    // effect box offset
    const dx = model.effectPos?.dx ?? 0;
    const dy = model.effectPos?.dy ?? 0;
    effectBox.style.marginLeft = dx + "px";
    effectBox.style.marginTop = dy + "px";
  }

  // ---------- Render ----------
  function renderAll() {
    applyAppearance();
    effectTextEl.textContent = model.effectText || "";

    renderRegions(rowTop, model.topCategories, "top");
    renderRegions(rowBottom, model.bottomCategories, "bottom");

    requestAnimationFrame(() => {
      drawStaticBones();   // builds catBones map
      positionAllBlocks(); // uses catBones to set block X positions
      drawHeadingRibs();   // draws ribs aligned to diagonal bones
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

      const label = document.createElement("div");
      label.className = `catLabel ${side}`;
      label.contentEditable = "true";
      label.spellcheck = false;
      label.textContent = cat.label || "";
      label.addEventListener("input", () => {
        cat.label = label.textContent.trim() || "Category";
      });

      const controls = document.createElement("div");
      controls.className = "regionControls";

      controls.appendChild(mkBtn("+ Heading", () => {
        cat.blocks.push({ id: uid(), title: "New heading", bullets: ["New bullet…"], yOffset: suggestNewYOffset(cat) });
        renderAll();
      }));

      controls.appendChild(mkBtn("+ Bullet", () => {
        if (!cat.blocks.length) cat.blocks.push({ id: uid(), title: "Heading", bullets: [], yOffset: 0 });
        cat.blocks[cat.blocks.length - 1].bullets.push("New bullet…");
        renderAll();
      }));

      controls.appendChild(mkBtn("Remove", () => {
        const ok = window.confirm(`Remove category “${cat.label}”?`);
        if (!ok) return;
        if (side === "top") model.topCategories = model.topCategories.filter(c => c.id !== cat.id);
        else model.bottomCategories = model.bottomCategories.filter(c => c.id !== cat.id);
        renderAll();
      }, true));

      const content = document.createElement("div");
      content.className = "content";

      cat.blocks.forEach((block, idx) => {
        if (block.yOffset == null) block.yOffset = idx * 90;

        const blockEl = document.createElement("div");
        blockEl.className = "block";
        blockEl.dataset.blockId = block.id;
        blockEl.dataset.catId = cat.id;
        blockEl.dataset.side = side;
        blockEl.style.top = clamp(block.yOffset, -10, 10000) + "px";

        const titleRow = document.createElement("div");
        titleRow.className = "blockTitle";

        const handle = document.createElement("div");
        handle.className = "dragHandle";
        handle.textContent = "⠿";
        handle.title = "Drag to move (stays on the category bone)";
        handle.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          startHeadingDrag(block, blockEl, content, cat.id, side, e.clientY);
        });

        const titleText = document.createElement("div");
        titleText.className = "titleText";
        titleText.contentEditable = "true";
        titleText.spellcheck = false;
        titleText.textContent = block.title || "";
        titleText.addEventListener("input", () => {
          block.title = titleText.textContent.trim() || "Heading";
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

        titleText.appendChild(delBlock);
        titleRow.appendChild(handle);
        titleRow.appendChild(titleText);

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

        blockEl.appendChild(titleRow);
        blockEl.appendChild(ul);
        content.appendChild(blockEl);
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

  function suggestNewYOffset(cat) {
    const ys = (cat.blocks || []).map(b => typeof b.yOffset === "number" ? b.yOffset : 0);
    if (!ys.length) return 0;
    return Math.max(...ys) + 110;
  }

  // ---------- Dragging headings (vertical only; X follows diagonal bone) ----------
  function startHeadingDrag(block, blockEl, contentEl, catId, side, startClientY) {
    headingDrag = {
      block,
      blockEl,
      contentEl,
      catId,
      side,
      startY: startClientY,
      startOffset: block.yOffset || 0
    };
    document.addEventListener("mousemove", onHeadingDragMove);
    document.addEventListener("mouseup", onHeadingDragEnd, { once: true });
  }

  function onHeadingDragMove(e) {
    if (!headingDrag) return;
    const dy = e.clientY - headingDrag.startY;

    const contentRect = headingDrag.contentEl.getBoundingClientRect();
    const min = -10;
    const max = Math.max(min, contentRect.height - 60);

    headingDrag.block.yOffset = clamp(headingDrag.startOffset + dy, min, max);
    headingDrag.blockEl.style.top = headingDrag.block.yOffset + "px";

    // Update X and ribs live
    positionBlocksForCategory(headingDrag.catId);
    drawHeadingRibs();
  }

  function onHeadingDragEnd() {
    document.removeEventListener("mousemove", onHeadingDragMove);
    headingDrag = null;
    drawHeadingRibs();
  }

  // ---------- Dragging effect box ----------
  effectDrag.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    effectDragState = {
      startX: e.clientX,
      startY: e.clientY,
      startDx: model.effectPos?.dx ?? 0,
      startDy: model.effectPos?.dy ?? 0
    };
    document.addEventListener("mousemove", onEffectMove);
    document.addEventListener("mouseup", onEffectUp, { once: true });
  });

  function onEffectMove(e) {
    if (!effectDragState) return;
    const dx = e.clientX - effectDragState.startX;
    const dy = e.clientY - effectDragState.startY;
    model.effectPos = { dx: effectDragState.startDx + dx, dy: effectDragState.startDy + dy };
    applyAppearance();
  }

  function onEffectUp() {
    document.removeEventListener("mousemove", onEffectMove);
    effectDragState = null;
  }

  effectTextEl.addEventListener("input", () => {
    model.effectText = effectTextEl.textContent.trim();
  });

  // ---------- Bones drawing ----------
  function ensureGroups() {
    if (!gStatic) {
      gStatic = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(gStatic);
    }
    if (!gRibs) {
      gRibs = document.createElementNS("http://www.w3.org/2000/svg", "g");
      svg.appendChild(gRibs);
    }
  }

  function clearGroup(g) { while (g.firstChild) g.removeChild(g.firstChild); }

  function drawStaticBones() {
    ensureGroups();
    clearGroup(gStatic);
    catBones.clear();

    const W = 1200, H = 720;
    const midY = Math.round(H * 0.5);
    const a = model.appearance || {};
    const stroke = a.boneColor || "#c00000";
    const thickness = Number(a.boneThickness ?? 10);
    const arrowW = Number(a.arrowWidth ?? 240);

    const marginL = 60;
    const arrowX = W - arrowW;
    const spineStart = marginL;
    const spineEnd = arrowX - 24;

    // Spine
    addLine(gStatic, spineStart, midY, spineEnd, midY, stroke, thickness);

    // Arrow
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
    ].join(" "), stroke, cssVar("--bone-dark"));

    // Left tail
    addLine(gStatic, spineStart - 40, midY, spineStart, midY, stroke, Math.max(4, thickness - 4));

    // One diagonal bone per category: use region centers (DOM) for alignment
    const wrapRect = wrapper.getBoundingClientRect();

    drawCategoryBones(model.topCategories, "top");
    drawCategoryBones(model.bottomCategories, "bottom");

    function drawCategoryBones(categories, side) {
      const row = side === "top" ? rowTop : rowBottom;
      const regions = Array.from(row.querySelectorAll(".region"));
      const yEdge = side === "top" ? 40 : (H - 40);

      categories.forEach((cat) => {
        const regionEl = regions.find(r => r.dataset.catId === cat.id);
        if (!regionEl) return;

        const rr = regionEl.getBoundingClientRect();
        const centerPx = (rr.left + rr.right) / 2 - wrapRect.left;

        // map wrapper px -> svg
        const xEdge = pxToSvgX(centerPx, wrapRect.width, W);

        // map that x into spine range (clamped)
        const xSpine = clamp(xEdge, spineStart + 20, spineEnd - 20);

        // draw diagonal
        addLine(gStatic, xSpine, midY, xEdge, yEdge, stroke, thickness);

        // cache bone definition for ribs/blocks
        catBones.set(cat.id, { xSpine, ySpine: midY, xEdge, yEdge });
      });
    }
  }

  // Ribs: for each heading block, compute x on diagonal at that y, then draw a horizontal rib.
  function drawHeadingRibs() {
    ensureGroups();
    clearGroup(gRibs);

    const a = model.appearance || {};
    const stroke = a.boneColor || "#c00000";
    const ribThickness = Math.max(2, Number(a.boneThickness ?? 10) - 4);
    const ribLen = Number(a.ribLength ?? 150);

    const wrapRect = wrapper.getBoundingClientRect();
    const W = 1200, H = 720;

    const blocks = wrapper.querySelectorAll(".block[data-cat-id]");
    blocks.forEach((blockEl) => {
      const catId = blockEl.dataset.catId;
      const bone = catBones.get(catId);
      if (!bone) return;

      const br = blockEl.getBoundingClientRect();

      // choose rib y just above the text baseline area
      // (we draw rib, then text sits slightly above it due to placement rules below)
      const yPx = br.top + 18 - wrapRect.top;
      const ySvg = (yPx / wrapRect.height) * H;

      const xOnBone = xAtY(bone, ySvg);

      // rib goes "away" from the bone into the region; simplest: to the right
      const x1 = xOnBone + 6;
      const x2 = x1 + ribLen;

      addLine(gRibs, x1, ySvg, x2, ySvg, stroke, ribThickness);
    });
  }

  // Position blocks so they track the diagonal bone (x is computed from y)
  function positionAllBlocks() {
    const cats = [...model.topCategories, ...model.bottomCategories];
    cats.forEach(c => positionBlocksForCategory(c.id));
  }

  function positionBlocksForCategory(catId) {
    const bone = catBones.get(catId);
    if (!bone) return;

    const wrapRect = wrapper.getBoundingClientRect();
    const W = 1200, H = 720;

    const blockEls = wrapper.querySelectorAll(`.block[data-cat-id="${cssEscape(catId)}"]`);
    blockEls.forEach((blockEl) => {
      const contentEl = blockEl.parentElement; // .content
      if (!contentEl) return;

      const contentRect = contentEl.getBoundingClientRect();

      // y in wrapper coords based on block top (relative within content)
      const topPxInContent = parseFloat(blockEl.style.top || "0");
      const yPxInWrapper = (contentRect.top - wrapRect.top) + topPxInContent + 18;
      const ySvg = (yPxInWrapper / wrapRect.height) * H;

      const xOnBoneSvg = xAtY(bone, ySvg);
      const xOnBonePx = (xOnBoneSvg / W) * wrapRect.width;

      // place block slightly to the right of bone, inside content
      let xPx = xOnBonePx - (contentRect.left - wrapRect.left) + 18;

      // keep inside content bounds
      const blockW = Number(model.appearance?.blockWidth ?? 260);
      const maxX = contentRect.width - Math.min(blockW, contentRect.width) - 4;
      xPx = clamp(xPx, 0, Math.max(0, maxX));

      blockEl.style.left = xPx + "px";

      // tweak: keep title text above rib (rib is drawn at y+something)
      // achieved by rib y based on block top + 18 and by layout of title row
    });
  }

  // Compute x coordinate on a diagonal bone at given y (in svg units)
  function xAtY(bone, y) {
    const { xSpine, ySpine, xEdge, yEdge } = bone;
    // param t from spine->edge based on y
    // y = ySpine + t*(yEdge - ySpine) => t = (y - ySpine)/(yEdge - ySpine)
    const denom = (yEdge - ySpine);
    if (Math.abs(denom) < 1e-6) return xSpine;
    const t = (y - ySpine) / denom;
    return xSpine + t * (xEdge - xSpine);
  }

  function pxToSvgX(px, wrapW, W) {
    return clamp((px / wrapW) * W, 0, W);
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

  function cssEscape(s) {
    // minimal escape for attribute selector use
    return String(s).replace(/"/g, '\\"');
  }

  // ---------- Side panel ----------
  const sidePanel = $("sidePanel");
  $("openPanel").addEventListener("click", () => sidePanel.classList.add("open"));
  $("closePanel").addEventListener("click", () => sidePanel.classList.remove("open"));

  function syncControlsFromModel() {
    const a = model.appearance || {};
    $("boneColor").value = a.boneColor || "#c00000";
    $("boneThickness").value = String(a.boneThickness ?? 10);
    $("fontSize").value = String(a.fontSize ?? 12);
    $("arrowWidth").value = String(a.arrowWidth ?? 240);
    $("labelWidth").value = String(a.labelWidth ?? 200);
    $("ribLength").value = String(a.ribLength ?? 150);
    $("blockWidth").value = String(a.blockWidth ?? 260);
  }

  function wireAppearanceControls() {
    $("boneColor").addEventListener("input", (e) => {
      model.appearance.boneColor = e.target.value;
      renderAll();
    });
    $("boneThickness").addEventListener("input", (e) => {
      model.appearance.boneThickness = Number(e.target.value);
      renderAll();
    });
    $("fontSize").addEventListener("input", (e) => {
      model.appearance.fontSize = Number(e.target.value);
      renderAll();
    });
    $("arrowWidth").addEventListener("input", (e) => {
      model.appearance.arrowWidth = Number(e.target.value);
      renderAll();
    });
    $("labelWidth").addEventListener("input", (e) => {
      model.appearance.labelWidth = Number(e.target.value);
      applyAppearance();
    });
    $("ribLength").addEventListener("input", (e) => {
      model.appearance.ribLength = Number(e.target.value);
      renderAll();
    });
    $("blockWidth").addEventListener("input", (e) => {
      model.appearance.blockWidth = Number(e.target.value);
      renderAll();
    });
  }

  // ---------- Add categories ----------
  $("addTopBtn").addEventListener("click", () => {
    model.topCategories.push(makeCategory("New top category", 0));
    renderAll();
  });
  $("addBottomBtn").addEventListener("click", () => {
    model.bottomCategories.push(makeCategory("New bottom category", 0));
    renderAll();
  });

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

        model = {
          version: 3,
          effectText: String(obj.effectText || ""),
          effectPos: obj.effectPos && typeof obj.effectPos === "object"
            ? { dx: Number(obj.effectPos.dx || 0), dy: Number(obj.effectPos.dy || 0) }
            : { dx: 0, dy: 0 },
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
    positionAllBlocks();
    drawHeadingRibs();
  });

  // ---------- Init ----------
  syncControlsFromModel();
  wireAppearanceControls();
  renderAll();

})();
