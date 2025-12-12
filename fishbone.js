/* fishbone.js
   Fishbone editor with “bones-first” layout and in-diagram editing.

   - Thick red spine + ribs + arrow, similar to the provided reference image.
   - Regions are editable directly on the diagram (contenteditable).
   - Hover controls per region: +Heading, +Bullet, Remove category.
   - JSON import/export + PNG/PDF export.
*/

(function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Model ----------
  // Each category has blocks; each block has title + bullets.
  let model = defaultModel();

  function defaultModel() {
    return {
      version: 1,
      effectText: ">40% A&E attendances for HIO (>20 attendances) are for avoidable reasons which can be supported in the community",
      topCategories: [
        makeCategory("Relationships & Culture"),
        makeCategory("Communication & Coordination"),
        makeCategory("Processes & Procedures")
      ],
      bottomCategories: [
        makeCategory("Resources & Infrastructure"),
        makeCategory("Methods & Ways of Working"),
        makeCategory("Environment & External Factors")
      ]
    };
  }

  function makeCategory(label) {
    return {
      id: cryptoId(),
      label: label || "New category",
      blocks: [
        {
          id: cryptoId(),
          title: "Heading",
          bullets: ["Add bullet point…"]
        }
      ]
    };
  }

  function cryptoId() {
    // Simple ID (works on GitHub Pages without extra libs)
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  // ---------- Rendering ----------
  const svg = $("bonesSvg");
  const rowTop = $("rowTop");
  const rowBottom = $("rowBottom");
  const effectTextEl = $("effectText");

  function renderAll() {
    effectTextEl.textContent = model.effectText || "";

    // Build region grids
    renderRegions(rowTop, model.topCategories, "top");
    renderRegions(rowBottom, model.bottomCategories, "bottom");

    // Draw bones after DOM exists
    requestAnimationFrame(drawBones);
  }

  function renderRegions(container, categories, side) {
    container.innerHTML = "";
    container.style.gridTemplateColumns = `repeat(${Math.max(1, categories.length)}, 1fr)`;

    categories.forEach((cat, idx) => {
      const region = document.createElement("div");
      region.className = "region";
      region.dataset.side = side;
      region.dataset.catId = cat.id;

      // Category label
      const label = document.createElement("div");
      label.className = `catLabel ${side}`;
      label.contentEditable = "true";
      label.spellcheck = false;
      label.textContent = cat.label || "";
      label.addEventListener("input", () => {
        cat.label = label.textContent.trim() || "Category";
      });

      // Region hover controls
      const controls = document.createElement("div");
      controls.className = "regionControls";

      const btnAddHeading = document.createElement("button");
      btnAddHeading.className = "chipBtn";
      btnAddHeading.type = "button";
      btnAddHeading.textContent = "+ Heading";
      btnAddHeading.addEventListener("click", (e) => {
        e.stopPropagation();
        cat.blocks.push({ id: cryptoId(), title: "New heading", bullets: ["New bullet…"] });
        renderAll();
      });

      const btnAddBullet = document.createElement("button");
      btnAddBullet.className = "chipBtn";
      btnAddBullet.type = "button";
      btnAddBullet.textContent = "+ Bullet";
      btnAddBullet.addEventListener("click", (e) => {
        e.stopPropagation();
        // Add bullet to the last block (simple behaviour, easy UX)
        if (!cat.blocks.length) cat.blocks.push({ id: cryptoId(), title: "Heading", bullets: [] });
        cat.blocks[cat.blocks.length - 1].bullets.push("New bullet…");
        renderAll();
      });

      const btnRemoveCat = document.createElement("button");
      btnRemoveCat.className = "chipBtn danger";
      btnRemoveCat.type = "button";
      btnRemoveCat.textContent = "Remove";
      btnRemoveCat.addEventListener("click", (e) => {
        e.stopPropagation();
        const ok = window.confirm(`Remove category “${cat.label}”?`);
        if (!ok) return;
        if (side === "top") {
          model.topCategories = model.topCategories.filter(c => c.id !== cat.id);
        } else {
          model.bottomCategories = model.bottomCategories.filter(c => c.id !== cat.id);
        }
        renderAll();
      });

      controls.appendChild(btnAddHeading);
      controls.appendChild(btnAddBullet);
      controls.appendChild(btnRemoveCat);

      // Content blocks
      const content = document.createElement("div");
      content.className = "content";

      cat.blocks.forEach((block) => {
        const blockEl = document.createElement("div");
        blockEl.className = "block";
        blockEl.dataset.blockId = block.id;

        const title = document.createElement("div");
        title.className = "blockTitle";
        title.contentEditable = "true";
        title.spellcheck = false;
        title.textContent = block.title || "";
        title.addEventListener("input", () => {
          block.title = title.textContent.trim() || "Heading";
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

        const ul = document.createElement("ul");
        ul.className = "bullets";

        (block.bullets || []).forEach((txt, i) => {
          const li = document.createElement("li");
          li.contentEditable = "true";
          li.spellcheck = false;
          li.textContent = txt;

          li.addEventListener("input", () => {
            block.bullets[i] = li.textContent.trim() || "";
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
      });

      region.appendChild(label);
      region.appendChild(controls);
      region.appendChild(content);
      container.appendChild(region);
    });
  }

  // ---------- Bones SVG ----------
  function drawBones() {
    // Coordinate system: 1200 x 720
    // We draw:
    // - spine (thick red horizontal)
    // - angled separators (thick red diagonals)
    // - arrow head and fill (solid red)
    // - optional small ribs (thin grey) are skipped to keep the look close to your example
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const W = 1200, H = 720;
    const midY = Math.round(H * 0.5);

    const marginL = 60;
    const arrowW = 240;
    const arrowX = W - arrowW;
    const spineStart = marginL;
    const spineEnd = arrowX - 24;

    const boneStroke = cssVar("--bone");
    const boneStrokeDark = cssVar("--bone-dark");

    // Spine
    line(spineStart, midY, spineEnd, midY, boneStroke, 10);

    // Arrow body + head
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const arrowTop = midY - 95;
    const arrowBot = midY + 95;
    const arrowTipX = W - 18;
    const arrowBodyX = arrowX;
    const d = [
      `M ${arrowBodyX} ${arrowTop}`,
      `L ${arrowTipX} ${midY}`,
      `L ${arrowBodyX} ${arrowBot}`,
      `L ${arrowBodyX} ${arrowTop}`,
      "Z"
    ].join(" ");
    arrow.setAttribute("d", d);
    arrow.setAttribute("fill", boneStroke);
    svg.appendChild(arrow);

    // Arrow outline (slightly darker)
    const arrowOutline = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowOutline.setAttribute("d", d);
    arrowOutline.setAttribute("fill", "none");
    arrowOutline.setAttribute("stroke", boneStrokeDark);
    arrowOutline.setAttribute("stroke-width", "2");
    svg.appendChild(arrowOutline);

    // Diagonal separators for TOP and BOTTOM
    // We mimic the reference: big diagonal ribs that divide the regions.
    const nTop = Math.max(1, model.topCategories.length);
    const nBottom = Math.max(1, model.bottomCategories.length);

    // We draw boundaries = number of categories (like your example), plus one “extra” at far left.
    drawSideSeparators("top", nTop);
    drawSideSeparators("bottom", nBottom);

    // A small “tail” line at the very left (thin red horizontal) like the example sometimes shows
    line(spineStart - 40, midY, spineStart, midY, boneStroke, 6);

    // helper: for nicer diagonals we base endpoints on region grid positions from DOM
    // If DOM is available, align diagonals to the column boundaries so bones match layout.
    function drawSideSeparators(side, n) {
      const row = side === "top" ? rowTop : rowBottom;
      const rect = row.getBoundingClientRect();
      const wrap = $("diagramWrapper").getBoundingClientRect();

      // Fallback if DOM not measurable
      if (!rect.width) {
        const step = (spineEnd - spineStart) / (n + 1);
        for (let i = 0; i <= n; i++) {
          const xSpine = spineStart + step * (i + 0.7);
          const yEdge = side === "top" ? 35 : (H - 35);
          const xEdge = spineStart + (i * (spineEnd - spineStart) / (n + 1)) * 0.55;
          line(xSpine, midY, xEdge, yEdge, boneStroke, 10);
        }
        return;
      }

      // Determine column boundary x positions from actual grid
      const cols = row.querySelectorAll(".region");
      const boundaries = [];

      // left boundary
      boundaries.push(rect.left - wrap.left + 10);

      // internal boundaries: use each region's right edge
      cols.forEach((c) => {
        const r = c.getBoundingClientRect();
        boundaries.push(r.right - wrap.left - 10);
      });

      // For each boundary draw a diagonal from spine to edge
      boundaries.forEach((xEdge, idx) => {
        // Map xEdge (in wrapper px space) to SVG space
        const xEdgeSvg = pxToSvgX(xEdge);
        const yEdgeSvg = side === "top" ? 40 : (H - 40);

        // Anchor on spine: spread anchors across spine
        const t = idx / Math.max(1, boundaries.length - 1);
        const xSpineSvg = spineStart + t * (spineEnd - spineStart) * 0.92 + 18;

        line(xSpineSvg, midY, xEdgeSvg, yEdgeSvg, boneStroke, 10);
      });
    }

    function pxToSvgX(px) {
      // wrapper client width -> svg width
      const wrap = $("diagramWrapper").getBoundingClientRect();
      const x = (px / wrap.width) * W;
      return clamp(x, 0, W);
    }
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#c00000";
  }

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function line(x1, y1, x2, y2, stroke, width) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", "line");
    el.setAttribute("x1", x1);
    el.setAttribute("y1", y1);
    el.setAttribute("x2", x2);
    el.setAttribute("y2", y2);
    el.setAttribute("stroke", stroke);
    el.setAttribute("stroke-width", String(width));
    el.setAttribute("stroke-linecap", "butt");
    svg.appendChild(el);
  }

  // ---------- On-canvas add category buttons ----------
  $("addTopBtn").addEventListener("click", () => {
    model.topCategories.push(makeCategory("New top category"));
    renderAll();
  });
  $("addBottomBtn").addEventListener("click", () => {
    model.bottomCategories.push(makeCategory("New bottom category"));
    renderAll();
  });

  // ---------- Effect text editing ----------
  effectTextEl.addEventListener("input", () => {
    model.effectText = effectTextEl.textContent.trim();
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
        model = obj;
        // safety defaults
        model.effectText = model.effectText || "";
        model.topCategories = model.topCategories.map(sanitizeCategory);
        model.bottomCategories = model.bottomCategories.map(sanitizeCategory);
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
      id: String(cat.id || cryptoId()),
      label: String(cat.label || "Category"),
      blocks: Array.isArray(cat.blocks) ? cat.blocks : []
    };
    c.blocks = c.blocks.map(b => ({
      id: String(b.id || cryptoId()),
      title: String(b.title || "Heading"),
      bullets: Array.isArray(b.bullets) ? b.bullets.map(x => String(x)) : []
    }));
    if (!c.blocks.length) c.blocks.push({ id: cryptoId(), title: "Heading", bullets: ["New bullet…"] });
    return c;
  }

  // PNG export
  $("btnExportPNG").addEventListener("click", async () => {
    const wrap = $("diagramWrapper");
    wrap.classList.add("export-clean");
    try {
      const canvas = await html2canvas(wrap, { scale: 2 });
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
      wrap.classList.remove("export-clean");
    }
  });

  // PDF export (landscape)
  $("btnExportPDF").addEventListener("click", async () => {
    const wrap = $("diagramWrapper");
    wrap.classList.add("export-clean");
    try {
      const opt = {
        margin: 8,
        filename: "fishbone-diagram.pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }
      };
      await html2pdf().from(wrap).set(opt).save();
    } catch (e) {
      console.error(e);
      alert("Could not export PDF.");
    } finally {
      wrap.classList.remove("export-clean");
    }
  });

  // Reset
  $("btnReset").addEventListener("click", () => {
    const ok = window.confirm("Reset to a fresh fishbone model?");
    if (!ok) return;
    model = defaultModel();
    renderAll();
  });

  // Keep bones aligned on resize
  window.addEventListener("resize", () => {
    drawBones();
  });

  // ---------- Init ----------
  renderAll();

})();
