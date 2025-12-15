/* fishbone.js (v6)
   Fixes the issues you reported by switching to BONE-RELATIVE positioning:

   - Category labels are rendered into a wrapper-level labels layer and positioned at the bone end.
   - Heading blocks are rendered into a wrapper-level blocks layer and positioned from bone geometry.
   - Each heading has a parameter t in [0..1] along its category bone.
   - Dragging projects the pointer onto the bone line -> updates t (so headings/ribs stay attached).
   - Floating +Heading/+Bullet toolbar anchors to the selected block (no weird “far away” controls).
   - Always 6 categories; no category deletion.
*/

(function () {
  const $ = (id) => document.getElementById(id);

  let model = defaultModel();
  let selected = { catId: null, blockId: null };

  const svg = $("bonesSvg");
  const wrapper = $("diagramWrapper");
  const labelsLayer = $("labelsLayer");
  const blocksLayer = $("blocksLayer");
  const floatingTools = $("floatingTools");
  const btnAddHeading = $("btnAddHeading");
  const btnAddBullet = $("btnAddBullet");

  const effectTextEl = $("effectText");
  const effectBox = $("effectBox");
  const effectDrag = $("effectDrag");

  let gStatic = null;
  let gRibs = null;

  // catId -> { xSpine,ySpine,xEdge,yEdge, side }
  const catBones = new Map();

  // drag state
  let drag = null; // { catId, blockId }
  let effectDragState = null;
  let effectResizeObs = null;

  function defaultModel() {
    return {
      version: 6,
      effectText: "Add your problem here",
      effectPos: { dx: 0, dy: 0 },
      effectSize: { w: 180, h: 110 },
      appearance: {
        boneColor: "#c00000",
        boneThickness: 10,
        fontSize: 12,
        arrowWidth: 140,
        labelWidth: 200,
        ribLength: 150,
        blockWidth: 300,
        boneSlant: 120
      },
      categories: [
        // 6 classic categories
        { id: uid(), side: "top",    label: "People",      blocks: [mkBlock(0.26)] },
        { id: uid(), side: "top",    label: "Methods",     blocks: [mkBlock(0.36)] },
        { id: uid(), side: "top",    label: "Machines",    blocks: [mkBlock(0.26)] },
        { id: uid(), side: "bottom", label: "Materials",   blocks: [mkBlock(0.26)] },
        { id: uid(), side: "bottom", label: "Measurement", blocks: [mkBlock(0.36)] },
        { id: uid(), side: "bottom", label: "Environment", blocks: [mkBlock(0.26)] },
      ]
    };
  }

  function mkBlock(t) {
    return { id: uid(), title: "", bullets: [""], t: clamp(t ?? 0.3, 0.08, 0.92) };
  }

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  // ---------------- Appearance ----------------
  function applyAppearance() {
    const a = model.appearance || {};
    document.documentElement.style.setProperty("--bone", a.boneColor || "#c00000");
    document.documentElement.style.setProperty("--bone-thickness", String(a.boneThickness ?? 10));
    document.documentElement.style.setProperty("--diagram-font", (a.fontSize ?? 12) + "px");
    document.documentElement.style.setProperty("--arrow-width", (a.arrowWidth ?? 180) + "px");
    document.documentElement.style.setProperty("--label-width", (a.labelWidth ?? 200) + "px");
    document.documentElement.style.setProperty("--rib-length", (a.ribLength ?? 150) + "px");
    document.documentElement.style.setProperty("--block-width", (a.blockWidth ?? 300) + "px");
    document.documentElement.style.setProperty("--bone-slant", (a.boneSlant ?? 200) + "px");

    // effect position
    const dx = model.effectPos?.dx ?? 0;
    const dy = model.effectPos?.dy ?? 0;
    effectBox.style.marginLeft = dx + "px";
    effectBox.style.marginTop = dy + "px";

    // effect size
    const w = clamp(Number(model.effectSize?.w ?? 180), 120, 800);
    const h = clamp(Number(model.effectSize?.h ?? 110), 70, 700);
    effectTextEl.style.width = w + "px";
    effectTextEl.style.height = h + "px";
  }

  // ---------------- Render ----------------
  function renderAll() {
    applyAppearance();
    effectTextEl.textContent = model.effectText || "";

    renderLabels();
    renderBlocks();

    requestAnimationFrame(() => {
      drawStaticBones();
      drawRibs();
      positionLabels();
      positionBlocks();
      updateFloatingTools();
    });
  }

  function catsBySide(side) {
    return model.categories.filter(c => c.side === side);
  }

  // Labels rendered into wrapper-level layer (fixes floating/region coordinate bug)
  function renderLabels() {
    labelsLayer.innerHTML = "";
    model.categories.forEach(cat => {
      const el = document.createElement("div");
      el.className = "catLabel";
      el.dataset.catId = cat.id;
      el.contentEditable = "true";
      el.spellcheck = false;
      el.textContent = cat.label || "";
      el.addEventListener("input", () => { cat.label = el.textContent.trim() || "Category"; });
      labelsLayer.appendChild(el);
    });
  }

  // Blocks rendered into wrapper-level blocksLayer (bone-relative positioning)
  function renderBlocks() {
    blocksLayer.innerHTML = "";

    model.categories.forEach(cat => {
      cat.blocks.forEach(block => {
        const blockEl = document.createElement("div");
        blockEl.className = "block";
        blockEl.dataset.catId = cat.id;
        blockEl.dataset.blockId = block.id;

	if (block.w) blockEl.style.width = block.w + "px";

        blockEl.addEventListener("mousedown", (e) => {
          if (e.target?.classList?.contains("dragHandle")) return;
          select(cat.id, block.id);
        });

	// Persist per-block width when user resizes
	if ("ResizeObserver" in window) {
	  const ro = new ResizeObserver(() => {
	    const r = blockEl.getBoundingClientRect();
	    block.w = clamp(Math.round(r.width), 180, 520);
	    // Reposition so rib/placement stays consistent after resize
	    positionBlocks();
	    updateFloatingTools();
	  });
	  ro.observe(blockEl);
	}


        const titleRow = document.createElement("div");
        titleRow.className = "blockTitle";

        const handle = document.createElement("div");
        handle.className = "dragHandle";
        handle.textContent = "⠿";
        handle.title = "Drag along the category bone";
        handle.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        handle.setPointerCapture(e.pointerId);
        select(cat.id, block.id);
        startDrag(cat.id, block.id, e.pointerId, e);
        });

        const titleText = document.createElement("div");
        titleText.className = "titleText editable";
        titleText.contentEditable = "true";
        titleText.spellcheck = false;
	titleText.dataset.placeholder = "Add a heading…";
        titleText.textContent = block.title || "";
        titleText.addEventListener("input", () => { block.title = titleText.textContent.trim(); });

        // Make the delete button a separate, non-editable control
	const delBlock = document.createElement("span");
	delBlock.className = "delBtn";
	delBlock.textContent = "✕";
	delBlock.title = "Delete heading";
	delBlock.setAttribute("contenteditable", "false");
	delBlock.addEventListener("click", (e) => {
	  e.stopPropagation();
	  const ok = window.confirm("Delete this heading and all its bullets?");
	  if (!ok) return;
	  cat.blocks = cat.blocks.filter(b => b.id !== block.id);
	  if (selected.blockId === block.id) selected = { catId: null, blockId: null };
	  renderAll();
	});
	
	titleRow.appendChild(handle);
	titleRow.appendChild(titleText);
	titleRow.appendChild(delBlock);


        const ul = document.createElement("ul");
        ul.className = "bullets";

        (block.bullets || []).forEach((txt, i) => {
          const li = document.createElement("li");
          li.classList.add("editable");
	  li.contentEditable = "true";
	  li.dataset.placeholder = "Add a bullet…";
          li.spellcheck = false;
          li.textContent = txt || "";

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
            if (block.bullets.length === 0) block.bullets.push("");
            renderAll();
          });

          li.appendChild(del);
          ul.appendChild(li);
        });

        blockEl.appendChild(titleRow);
        blockEl.appendChild(ul);
        blocksLayer.appendChild(blockEl);
      });
    });

    refreshSelectionUI();
  }

  function select(catId, blockId) {
    selected = { catId, blockId };
    refreshSelectionUI();
    updateFloatingTools();
  }

  function refreshSelectionUI() {
    const all = blocksLayer.querySelectorAll(".block");
    all.forEach(b => b.classList.toggle("is-selected", b.dataset.blockId === selected.blockId));
  }

  // ---------------- Bones ----------------
  function ensureGroups() {
    if (!gStatic) { gStatic = document.createElementNS("http://www.w3.org/2000/svg", "g"); svg.appendChild(gStatic); }
    if (!gRibs) { gRibs = document.createElementNS("http://www.w3.org/2000/svg", "g"); svg.appendChild(gRibs); }
  }
  function clearGroup(g){ while(g.firstChild) g.removeChild(g.firstChild); }

  function drawStaticBones() {
    ensureGroups();
    clearGroup(gStatic);
    catBones.clear();

    const W = 1200, H = 720;
    const midY = Math.round(H * 0.5);

    const a = model.appearance || {};
    const stroke = a.boneColor || "#c00000";
    const thickness = Number(a.boneThickness ?? 10);
    const arrowW = Number(a.arrowWidth ?? 180);
    const slant = 120 + Number(a.boneSlant ?? 120);

    // More left padding so the left bones don’t clash with the edge
    const marginL = 160;

    const arrowX = W - arrowW;
    const spineStart = marginL;
    const spineEnd = arrowX;

    // spine
    addLine(gStatic, spineStart, midY, spineEnd, midY, stroke, thickness);

    // arrow
    const arrowTop = midY - 95;
    const arrowBot = midY + 95;
    const arrowTipX = W - 18;
    const arrowBodyX = arrowX;
    addFilledPath(gStatic, [
      `M ${arrowBodyX} ${arrowTop}`,
      `L ${arrowTipX} ${midY}`,
      `L ${arrowBodyX} ${arrowBot}`,
      `L ${arrowBodyX} ${arrowTop}`,
      "Z"
    ].join(" "), stroke);

    // tail
    addLine(gStatic, spineStart - 40, midY, spineStart, midY, stroke, Math.max(4, thickness - 4));

    // category bones: anchored at evenly spaced points along the spine band
    const topCats = catsBySide("top");
    const botCats = catsBySide("bottom");

    const topXs = spineAnchors(topCats.length, spineStart + 140, spineEnd - 30);
    const botXs = spineAnchors(botCats.length, spineStart + 140, spineEnd - 30);

    const yTop = 70;
    const yBot = H - 70;

    topCats.forEach((cat, i) => {
      const xSpine = topXs[i];
      const xEdge = clamp(xSpine - slant, 90, W - 40);
      addLine(gStatic, xSpine, midY, xEdge, yTop, stroke, thickness);
      catBones.set(cat.id, { xSpine, ySpine: midY, xEdge, yEdge: yTop, side:"top" });
    });

    botCats.forEach((cat, i) => {
      const xSpine = botXs[i];
      const xEdge = clamp(xSpine - slant, 90, W - 40);
      addLine(gStatic, xSpine, midY, xEdge, yBot, stroke, thickness);
      catBones.set(cat.id, { xSpine, ySpine: midY, xEdge, yEdge: yBot, side:"bottom" });
    });
  }

  function spineAnchors(n, startX, endX){
    if (n <= 1) return [ (startX+endX)/2 ];
    const step = (endX - startX) / (n - 1);
    return Array.from({length:n}, (_,i)=> startX + i*step);
  }

  // ribs from each block's bone point, extending left
  function drawRibs() {
    ensureGroups();
    clearGroup(gRibs);

    const a = model.appearance || {};
    const stroke = a.boneColor || "#c00000";
    const ribThickness = Math.max(2, Number(a.boneThickness ?? 10) - 4);
    const ribLen = Number(a.ribLength ?? 150);

    model.categories.forEach(cat => {
      const bone = catBones.get(cat.id);
      if (!bone) return;

      cat.blocks.forEach(block => {
        const t = clamp(Number(block.t ?? 0.3), 0.08, 0.92);
        const p = pointOnBone(bone, t);

        const x2 = p.x - 6;
        const x1 = x2 - ribLen;
        addLine(gRibs, x1, p.y, x2, p.y, stroke, ribThickness);
      });
    });
  }

  function pointOnBone(bone, t){
    return {
      x: bone.xSpine + t*(bone.xEdge - bone.xSpine),
      y: bone.ySpine + t*(bone.yEdge - bone.ySpine)
    };
  }

  // ---------------- Position labels & blocks (wrapper-relative) ----------------
  function positionLabels() {
    const wrapRect = wrapper.getBoundingClientRect();
    const W = 1200, H = 720;

    labelsLayer.querySelectorAll(".catLabel").forEach(el => {
      const catId = el.dataset.catId;
      const bone = catBones.get(catId);
      if (!bone) return;

      const xPx = (bone.xEdge / W) * wrapRect.width;
      const yPx = (bone.yEdge / H) * wrapRect.height;

      // attach just off the bone end
      const labelH = el.getBoundingClientRect().height || 40;
      const yOffset = (bone.side === "top") ? (-labelH + 6) : (-6);

      el.style.left = `${xPx}px`;
      el.style.top = `${yPx + yOffset}px`;
    });
  }

  function positionBlocks() {
  const wrapRect = wrapper.getBoundingClientRect();
  const W = 1200, H = 720;

  const a = model.appearance || {};
  const ribLen = Number(a.ribLength ?? 150);

  blocksLayer.querySelectorAll(".block").forEach(el => {
    const catId = el.dataset.catId;
    const blockId = el.dataset.blockId;

    const cat = model.categories.find(c => c.id === catId);
    const block = cat?.blocks.find(b => b.id === blockId);
    const bone = catBones.get(catId);
    if (!cat || !block || !bone) return;

    // ✅ blockW must be computed *here* (block is now defined)
    const blockW = block.w ? Number(block.w) : Number(a.blockWidth ?? 300);

    const t = clamp(Number(block.t ?? 0.3), 0.08, 0.92);
    const p = pointOnBone(bone, t);

    const xPx = (p.x / W) * wrapRect.width;
    const yPx = (p.y / H) * wrapRect.height;

    // block sits to the left of the rib start
    let left = xPx - ribLen - blockW - 12;
    left = clamp(left, 8, wrapRect.width - 8 - Math.min(blockW, wrapRect.width - 16));

    // align so title is above rib
    let top = yPx - 30;
    top = clamp(top, 8, wrapRect.height - 120);

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });
}


  // ---------------- Dragging along the bone ----------------
  function startDrag(catId, blockId, pointerId, startEvent) {
  const cat = model.categories.find(c => c.id === catId);
  const block = cat?.blocks.find(b => b.id === blockId);
  const bone = catBones.get(catId);
  if (!cat || !block || !bone) return;

  // pointer -> svg coords
  const wrapRect = wrapper.getBoundingClientRect();
  const W = 1200, H = 720;
  const px = startEvent.clientX - wrapRect.left;
  const py = startEvent.clientY - wrapRect.top;
  const x = (px / wrapRect.width) * W;
  const y = (py / wrapRect.height) * H;

  // projected t at grab moment
  const grabT = projectT({x,y}, {x:bone.xSpine,y:bone.ySpine}, {x:bone.xEdge,y:bone.yEdge});
  const currentT = clamp(Number(block.t ?? 0.3), 0.08, 0.92);

  drag = {
    catId,
    blockId,
    pointerId,
    // offset keeps the grabbed point aligned with the block so it doesn't jump
    tOffset: currentT - grabT
  };

  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragEnd, { once: true });
  document.addEventListener("pointercancel", onDragEnd, { once: true });
}



  function onDragMove(e) {
    if (!drag) return;
    const cat = model.categories.find(c => c.id === drag.catId);
    const block = cat?.blocks.find(b => b.id === drag.blockId);
    const bone = catBones.get(drag.catId);
    if (!cat || !block || !bone) return;

    // pointer -> svg coords
    const wrapRect = wrapper.getBoundingClientRect();
    const W = 1200, H = 720;
    const px = e.clientX - wrapRect.left;
    const py = e.clientY - wrapRect.top;

    const x = (px / wrapRect.width) * W;
    const y = (py / wrapRect.height) * H;

    // project point onto bone segment to find t
    const t = projectT({x,y}, {x:bone.xSpine,y:bone.ySpine}, {x:bone.xEdge,y:bone.yEdge});
    block.t = clamp(t + (drag.tOffset || 0), 0.08, 0.92);


    drawRibs();
    positionBlocks();
    updateFloatingTools();
  }

  function onDragEnd() {
  document.removeEventListener("pointermove", onDragMove);
  drag = null;
}


  function projectT(p, a, b){
    const abx = b.x - a.x, aby = b.y - a.y;
    const apx = p.x - a.x, apy = p.y - a.y;
    const denom = abx*abx + aby*aby;
    if (denom < 1e-6) return 0;
    return (apx*abx + apy*aby) / denom;
  }

  // ---------------- Floating tools near selection ----------------
  function updateFloatingTools() {
    if (!selected.catId || !selected.blockId) {
      floatingTools.style.display = "none";
      return;
    }

    const el = blocksLayer.querySelector(`.block[data-block-id="${cssEscape(selected.blockId)}"]`);
    if (!el) { floatingTools.style.display = "none"; return; }

    const wrapRect = wrapper.getBoundingClientRect();
    const r = el.getBoundingClientRect();

    // place near top-right of selected block
    const x = (r.right - wrapRect.left) + 8;
    const y = (r.top - wrapRect.top) - 6;

    floatingTools.style.left = `${clamp(x, 8, wrapRect.width - 160)}px`;
    floatingTools.style.top  = `${clamp(y, 8, wrapRect.height - 40)}px`;
    floatingTools.style.display = "flex";
  }

  btnAddHeading.addEventListener("click", () => {
    if (!selected.catId) return;
    const cat = model.categories.find(c => c.id === selected.catId);
    if (!cat) return;

    // place new heading near selected one (slightly different t so it’s visible)
    const sel = cat.blocks.find(b => b.id === selected.blockId);
    const baseT = sel ? Number(sel.t ?? 0.3) : 0.3;
    const newT = clamp(baseT + 0.10, 0.08, 0.92);

    const nb = { id: uid(), title: "New heading", bullets: ["New bullet…"], t: newT };
    cat.blocks.push(nb);
    select(cat.id, nb.id);
    renderAll();
  });

  btnAddBullet.addEventListener("click", () => {
    if (!selected.catId || !selected.blockId) return;
    const cat = model.categories.find(c => c.id === selected.catId);
    const block = cat?.blocks.find(b => b.id === selected.blockId);
    if (!cat || !block) return;

    if (!Array.isArray(block.bullets)) block.bullets = [];
    block.bullets.push("New bullet…");
    renderAll();
  });

  // ---------------- Effect box move + resize persist ----------------
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

  function setupEffectResizeObserver() {
    if (!("ResizeObserver" in window)) return;
    if (effectResizeObs) effectResizeObs.disconnect();
    effectResizeObs = new ResizeObserver(() => {
      const r = effectTextEl.getBoundingClientRect();
      model.effectSize = { w: clamp(Math.round(r.width), 120, 800), h: clamp(Math.round(r.height), 70, 700) };
    });
    effectResizeObs.observe(effectTextEl);
  }

  // ---------------- Side panel ----------------
  const sidePanel = $("sidePanel");
  $("openPanel").addEventListener("click", () => sidePanel.classList.add("open"));
  $("closePanel").addEventListener("click", () => sidePanel.classList.remove("open"));

  function syncControlsFromModel() {
    const a = model.appearance || {};
    $("boneColor").value = a.boneColor || "#c00000";
    $("boneThickness").value = String(a.boneThickness ?? 10);
    $("fontSize").value = String(a.fontSize ?? 12);
    $("arrowWidth").value = String(a.arrowWidth ?? 140);
    $("labelWidth").value = String(a.labelWidth ?? 200);
    $("ribLength").value = String(a.ribLength ?? 150);
    $("blockWidth").value = String(a.blockWidth ?? 300);
    $("boneSlant").value = String(a.boneSlant ?? 200);
  }

  function wireAppearanceControls() {
    $("boneColor").addEventListener("input", (e) => { model.appearance.boneColor = e.target.value; renderAll(); });
    $("boneThickness").addEventListener("input", (e) => { model.appearance.boneThickness = Number(e.target.value); renderAll(); });
    $("fontSize").addEventListener("input", (e) => { model.appearance.fontSize = Number(e.target.value); renderAll(); });
    $("arrowWidth").addEventListener("input", (e) => { model.appearance.arrowWidth = Number(e.target.value); renderAll(); });
    $("labelWidth").addEventListener("input", (e) => { model.appearance.labelWidth = Number(e.target.value); renderAll(); });
    $("ribLength").addEventListener("input", (e) => { model.appearance.ribLength = Number(e.target.value); renderAll(); });
    $("blockWidth").addEventListener("input", (e) => { model.appearance.blockWidth = Number(e.target.value); renderAll(); });
    $("boneSlant").addEventListener("input", (e) => { model.appearance.boneSlant = Number(e.target.value); renderAll(); });
  }

  // ---------------- Help modal ----------------
  const helpOverlay = $("helpOverlay");
  $("btnHelp").addEventListener("click", () => {
    helpOverlay.classList.add("open");
    helpOverlay.setAttribute("aria-hidden", "false");
  });
  $("helpClose").addEventListener("click", closeHelp);
  helpOverlay.addEventListener("click", (e) => { if (e.target === helpOverlay) closeHelp(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && helpOverlay.classList.contains("open")) closeHelp(); });

  function closeHelp() {
    helpOverlay.classList.remove("open");
    helpOverlay.setAttribute("aria-hidden", "true");
  }

  // ---------------- Export / import ----------------
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
        const def = defaultModel();

        // enforce exactly 6 categories; preserve order/labels if present
        const cats = Array.isArray(obj.categories) ? obj.categories : [];
        const fixed = def.categories.map((dc, i) => {
          const sc = cats[i] || {};
          return {
            id: String(sc.id || dc.id || uid()),
            side: dc.side,
            label: String(sc.label || dc.label),
            blocks: Array.isArray(sc.blocks) ? sc.blocks.map(sb => ({
              id: String(sb.id || uid()),
              title: String(sb.title || ""),
              bullets: Array.isArray(sb.bullets) ? sb.bullets.map(x => String(x)) : [""],
              t: clamp(Number(sb.t ?? 0.3), 0.08, 0.92)
            })) : [mkBlock(0.3)]
          };
        });

        model = {
          version: 6,
          effectText: String(obj.effectText || def.effectText),
          effectPos: obj.effectPos && typeof obj.effectPos === "object"
            ? { dx: Number(obj.effectPos.dx || 0), dy: Number(obj.effectPos.dy || 0) }
            : def.effectPos,
          effectSize: obj.effectSize && typeof obj.effectSize === "object"
            ? { w: Number(obj.effectSize.w || def.effectSize.w), h: Number(obj.effectSize.h || def.effectSize.h) }
            : def.effectSize,
          appearance: { ...def.appearance, ...(obj.appearance || {}) },
          categories: fixed
        };

        selected = { catId: null, blockId: null };
        syncControlsFromModel();
        renderAll();
      } catch (err) {
        console.error(err);
        alert("Could not read JSON.");
      }
    };
    reader.readAsText(file, "utf-8");
  });

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

  $("btnReset").addEventListener("click", () => {
    const ok = window.confirm("Reset to a fresh fishbone model?");
    if (!ok) return;
    model = defaultModel();
    selected = { catId: null, blockId: null };
    syncControlsFromModel();
    renderAll();
  });

  window.addEventListener("resize", () => {
    drawStaticBones();
    drawRibs();
    positionLabels();
    positionBlocks();
    updateFloatingTools();
  });

  // ---------------- Helpers ----------------
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

function addFilledPath(group, d, fill) {
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  p.setAttribute("fill", fill);
  group.appendChild(p);
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
  function cssEscape(s) { return String(s).replace(/"/g, '\\"'); }

  // ---------------- Init ----------------
  syncControlsFromModel();
  wireAppearanceControls();
  setupEffectResizeObserver();
  renderAll();

})();
