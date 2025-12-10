// fishbone.js
// Simple, browser-based fishbone / Ishikawa diagram editor
// Inspired by your driver diagram tool layout & behaviour.

(function () {
  // --- Data model ---

  let categories = [];
  let causes = [];
  let nextCategoryId = 1;
  let nextCauseId = 1;

  // Appearance
  const appearance = {
    boxHeight: 36,
    verticalGap: 14,
    fontSize: 13,
    fontBold: false
  };

  // Editing state
  let editingCategoryId = null;
  let editingCauseId = null;

  // --- DOM helpers ---
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // --- Basic model helpers ---

  function resetModel() {
    categories = [];
    causes = [];
    nextCategoryId = 1;
    nextCauseId = 1;
    editingCategoryId = null;
    editingCauseId = null;

    const titleInput = $("modelTitle");
    const problemInput = $("problemText");
    if (titleInput) titleInput.value = "";
    if (problemInput) problemInput.value = "";

    seedDefaultCategories();
    updateAllViews();
  }

  function seedDefaultCategories() {
    const defaults = [
      "People",
      "Process",
      "Equipment",
      "Environment",
      "Materials",
      "Measurement"
    ];
    defaults.forEach((name, idx) => {
      categories.push({
        id: String(nextCategoryId++),
        name,
        side: idx % 2 === 0 ? "top" : "bottom",
        color: ""
      });
    });
  }

  function getCategoryById(id) {
    return categories.find(c => c.id === id) || null;
  }

  function getCauseById(id) {
    return causes.find(c => c.id === id) || null;
  }

  function getCausesByCategory(categoryId) {
    return causes.filter(c => c.categoryId === categoryId);
  }

  function getChildCauses(parentId) {
    return causes.filter(c => c.parentId === parentId);
  }

  // --- Appearance helpers ---

  function applyAppearanceFromInputs() {
    const boxHeightInput = $("boxHeightInput");
    const verticalGapInput = $("verticalGapInput");
    const fontSizeInput = $("fontSizeInput");
    const fontBoldInput = $("fontBoldInput");

    if (boxHeightInput) {
      const v = Number(boxHeightInput.value);
      if (!isNaN(v) && v > 0) {
        appearance.boxHeight = v;
      }
    }
    if (verticalGapInput) {
      const v = Number(verticalGapInput.value);
      if (!isNaN(v) && v >= 0) {
        appearance.verticalGap = v;
      }
    }
    if (fontSizeInput) {
      const v = Number(fontSizeInput.value);
      if (!isNaN(v) && v > 0) {
        appearance.fontSize = v;
      }
    }
    if (fontBoldInput) {
      appearance.fontBold = !!fontBoldInput.checked;
    }

    updateDiagram();
  }

  // --- Category form ---

  function clearCategoryForm() {
    editingCategoryId = null;
    if ($("categoryNameInput")) $("categoryNameInput").value = "";
    if ($("categorySideSelect")) $("categorySideSelect").value = "top";
    if ($("categoryColorInput")) $("categoryColorInput").value = "";
    if ($("btnAddCategory")) $("btnAddCategory").textContent = "Add / update category";
  }

  function startEditCategory(categoryId) {
    const cat = getCategoryById(categoryId);
    if (!cat) return;

    editingCategoryId = cat.id;
    if ($("categoryNameInput")) $("categoryNameInput").value = cat.name;
    if ($("categorySideSelect")) $("categorySideSelect").value = cat.side || "top";
    if ($("categoryColorInput")) $("categoryColorInput").value = cat.color || "";
    if ($("btnAddCategory")) $("btnAddCategory").textContent = "Update category";
  }

  function addOrUpdateCategoryFromForm() {
    const nameInput = $("categoryNameInput");
    const sideSelect = $("categorySideSelect");
    const colorInput = $("categoryColorInput");
    if (!nameInput || !sideSelect) return;

    const name = (nameInput.value || "").trim();
    const side = sideSelect.value === "bottom" ? "bottom" : "top";
    const color = (colorInput && colorInput.value.trim()) || "";

    if (!name) {
      alert("Please enter a category name.");
      return;
    }

    if (editingCategoryId) {
      const cat = getCategoryById(editingCategoryId);
      if (cat) {
        cat.name = name;
        cat.side = side;
        cat.color = color;
      }
    } else {
      categories.push({
        id: String(nextCategoryId++),
        name,
        side,
        color
      });
    }

    editingCategoryId = null;
    if ($("btnAddCategory")) $("btnAddCategory").textContent = "Add / update category";
    clearCategoryForm();
    updateAllViews();
  }

  function deleteCategory(categoryId) {
    const cat = getCategoryById(categoryId);
    if (!cat) return;
    const usedCauses = getCausesByCategory(categoryId);
    const msg = usedCauses.length
      ? `Delete category "${cat.name}" and its ${usedCauses.length} cause(s)?`
      : `Delete category "${cat.name}"?`;
    if (!window.confirm(msg)) return;

    categories = categories.filter(c => c.id !== categoryId);
    causes = causes.filter(c => c.categoryId !== categoryId);

    if (editingCategoryId === categoryId) {
      clearCategoryForm();
    }
    if (editingCauseId && !getCauseById(editingCauseId)) {
      clearCauseForm();
    }

    updateAllViews();
  }

  // --- Cause form ---

  function populateCategorySelects() {
    const causeCategorySelect = $("causeCategorySelect");
    if (causeCategorySelect) {
      const current = causeCategorySelect.value;
      causeCategorySelect.innerHTML = "";
      categories.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.id;
        opt.textContent = cat.name;
        causeCategorySelect.appendChild(opt);
      });
      if (current && categories.some(c => c.id === current)) {
        causeCategorySelect.value = current;
      }
    }

    const parentSelect = $("causeParentSelect");
    if (parentSelect) {
      const current = parentSelect.value;
      parentSelect.innerHTML = "";
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "— None / main level —";
      parentSelect.appendChild(noneOpt);

      causes.forEach(cause => {
        const shortText =
          cause.text.length > 60 ? cause.text.slice(0, 57) + "…" : cause.text;
        const cat = getCategoryById(cause.categoryId);
        const opt = document.createElement("option");
        opt.value = cause.id;
        opt.textContent =
          `[${cat ? cat.name : "?"}] ${shortText}`;
        parentSelect.appendChild(opt);
      });

      if (current && causes.some(c => c.id === current)) {
        parentSelect.value = current;
      }
    }
  }

  function clearCauseForm() {
    editingCauseId = null;
    if ($("causeTextInput")) $("causeTextInput").value = "";
    if ($("causeParentSelect")) $("causeParentSelect").value = "";
    if ($("btnAddCause")) $("btnAddCause").textContent = "Add / update cause";
  }

  function startEditCause(causeId) {
    const cause = getCauseById(causeId);
    if (!cause) return;

    editingCauseId = cause.id;
    if ($("causeTextInput")) $("causeTextInput").value = cause.text;
    if ($("causeCategorySelect")) $("causeCategorySelect").value = cause.categoryId;
    if ($("causeParentSelect")) $("causeParentSelect").value = cause.parentId || "";
    if ($("btnAddCause")) $("btnAddCause").textContent = "Update cause";
  }

  function addOrUpdateCauseFromForm() {
    const textInput = $("causeTextInput");
    const categorySelect = $("causeCategorySelect");
    const parentSelect = $("causeParentSelect");
    if (!textInput || !categorySelect || !parentSelect) return;

    const text = (textInput.value || "").trim();
    const categoryId = categorySelect.value;
    const parentId = parentSelect.value || "";

    if (!categoryId) {
      alert("Please choose a category.");
      return;
    }
    if (!text) {
      alert("Please enter the cause / factor text.");
      return;
    }

    // Disallow parent from a different category (for simplicity)
    if (parentId) {
      const parent = getCauseById(parentId);
      if (parent && parent.categoryId !== categoryId) {
        alert("Parent cause must be in the same category.");
        return;
      }
      // Also prevent circular parent-child relationships in a simple way
      if (editingCauseId && parentId === editingCauseId) {
        alert("A cause cannot be its own parent.");
        return;
      }
    }

    if (editingCauseId) {
      const cause = getCauseById(editingCauseId);
      if (cause) {
        cause.text = text;
        cause.categoryId = categoryId;
        cause.parentId = parentId || "";
      }
    } else {
      causes.push({
        id: String(nextCauseId++),
        text,
        categoryId,
        parentId: parentId || ""
      });
    }

    editingCauseId = null;
    if ($("btnAddCause")) $("btnAddCause").textContent = "Add / update cause";
    clearCauseForm();
    populateCategorySelects();
    updateAllViews();
  }

  function deleteCause(causeId) {
    const cause = getCauseById(causeId);
    if (!cause) return;

    const childCount = getChildCauses(causeId).length;
    const msg = childCount
      ? `Delete cause and its ${childCount} sub-cause(s)?`
      : "Delete this cause?";
    if (!window.confirm(msg)) return;

    // remove cause + its direct children (and recursively grandchildren)
    function removeRec(id) {
      const directChildren = getChildCauses(id).map(c => c.id);
      causes = causes.filter(c => c.id !== id);
      directChildren.forEach(removeRec);
    }
    removeRec(causeId);

    if (editingCauseId === causeId) {
      clearCauseForm();
    }
    populateCategorySelects();
    updateAllViews();
  }

  // --- Diagram rendering ---

  function updateDiagram() {
    const canvas = $("fishboneCanvas");
    const grid = $("fishboneGrid");
    const svg = $("fishboneConnections");
    if (!canvas || !grid || !svg) return;

    // Clear grid
    grid.innerHTML = "";

    // Build rows
    const topRow = document.createElement("div");
    topRow.className = "fishbone-row fishbone-row-top";
    const spineRow = document.createElement("div");
    spineRow.className = "fishbone-row fishbone-row-spine";
    const bottomRow = document.createElement("div");
    bottomRow.className = "fishbone-row fishbone-row-bottom";

    // Add spine + effect
    const spine = document.createElement("div");
    spine.id = "fishboneSpine";
    spineRow.appendChild(spine);

    const effectBox = document.createElement("div");
    effectBox.id = "fishboneEffectBox";
    const problemInput = $("problemText");
    const modelTitleInput = $("modelTitle");
    const effectTitle = problemInput && problemInput.value.trim()
      ? problemInput.value.trim()
      : "Problem / effect";
    effectBox.textContent = effectTitle;
    spineRow.appendChild(effectBox);

    // Partition categories by side
    const topCategories = categories.filter(c => (c.side || "top") === "top");
    const bottomCategories = categories.filter(c => c.side === "bottom");

    // Guarantee at least one cell each side so layout is stable
    const maxCount = Math.max(
      topCategories.length || 1,
      bottomCategories.length || 1
    );

    function buildCells(rowElement, sideCategories, sideFlag) {
      for (let i = 0; i < maxCount; i++) {
        const cell = document.createElement("div");
        cell.className = "fishbone-category-cell";
        const cat = sideCategories[i];
        if (cat) {
          const box = document.createElement("div");
          box.className = "fishbone-category-box";
          box.setAttribute("data-category-id", cat.id);

          // Apply appearance
          box.style.minHeight = appearance.boxHeight + "px";
          box.style.fontSize = appearance.fontSize + "px";
          box.style.fontWeight = appearance.fontBold ? "600" : "400";
          box.style.marginTop = (appearance.verticalGap / 2) + "px";
          box.style.marginBottom = (appearance.verticalGap / 2) + "px";

          if (cat.color) {
            box.style.backgroundColor = cat.color;
          }

          const title = document.createElement("div");
          title.className = "category-title";
          title.textContent = cat.name;
          title.title = "Click to edit category";
          title.addEventListener("click", function (e) {
            e.stopPropagation();
            startEditCategory(cat.id);
          });
          box.appendChild(title);

          const ul = document.createElement("ul");
          const catCauses = getCausesByCategory(cat.id).filter(c => !c.parentId);
          catCauses.forEach(mainCause => {
            const li = document.createElement("li");
            li.textContent = mainCause.text;
            li.setAttribute("data-cause-id", mainCause.id);
            li.title = "Click to edit cause";
            li.addEventListener("click", function (e) {
              e.stopPropagation();
              startEditCause(mainCause.id);
            });

            const children = getChildCauses(mainCause.id);
            if (children.length) {
              const subUl = document.createElement("ul");
              children.forEach(child => {
                const subLi = document.createElement("li");
                subLi.textContent = child.text;
                subLi.setAttribute("data-cause-id", child.id);
                subLi.title = "Click to edit cause";
                subLi.addEventListener("click", function (e) {
                  e.stopPropagation();
                  startEditCause(child.id);
                });
                subUl.appendChild(subLi);
              });
              li.appendChild(subUl);
            }

            ul.appendChild(li);
          });
          box.appendChild(ul);

          // Color badge for quick recolour
          const badge = document.createElement("div");
          badge.className = "fishbone-category-badge";
          if (cat.color) {
            badge.style.backgroundColor = cat.color;
          }
          badge.title = "Click to toggle colour";
          badge.addEventListener("click", function (e) {
            e.stopPropagation();
            cycleCategoryColor(cat);
          });
          box.appendChild(badge);

          box.addEventListener("click", function () {
            startEditCategory(cat.id);
          });

          cell.appendChild(box);
        }
        rowElement.appendChild(cell);
      }
    }

    buildCells(topRow, topCategories, "top");
    buildCells(bottomRow, bottomCategories, "bottom");

    grid.appendChild(topRow);
    grid.appendChild(spineRow);
    grid.appendChild(bottomRow);

    // Set subtitle
    const subtitle = $("diagramSubtitle");
    if (subtitle && modelTitleInput && modelTitleInput.value.trim()) {
      subtitle.textContent = modelTitleInput.value.trim();
    } else if (subtitle) {
      subtitle.textContent =
        "Add categories and causes on the left, or edit directly from the diagram.";
    }

    // Draw connections after layout
    if (!window.requestAnimationFrame) {
      drawConnections();
    } else {
      window.requestAnimationFrame(drawConnections);
    }
  }

  function cycleCategoryColor(cat) {
    // Very simple colour toggling: no colour -> light blue -> light green -> no colour
    const palette = ["", "#e0f0ff", "#dff5e2"];
    const idx = palette.indexOf(cat.color || "");
    const nextIdx = idx === -1 ? 1 : (idx + 1) % palette.length;
    cat.color = palette[nextIdx];
    updateDiagram();
    updateTable();
  }

  function drawConnections() {
    const canvas = $("fishboneCanvas");
    const grid = $("fishboneGrid");
    const svg = $("fishboneConnections");
    const spine = $("fishboneSpine");
    if (!canvas || !grid || !svg || !spine) return;

    const canvasRect = canvas.getBoundingClientRect();
    const spineRect = spine.getBoundingClientRect();

    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }

    const w = canvasRect.width;
    const h = canvasRect.height;
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);

    const categoryBoxes = canvas.querySelectorAll(".fishbone-category-box");
    categoryBoxes.forEach(box => {
      const catId = box.getAttribute("data-category-id");
      const cat = getCategoryById(catId);
      if (!cat) return;

      const boxRect = box.getBoundingClientRect();

      const isTop = (cat.side || "top") === "top";
      const x1 = boxRect.left + boxRect.width / 2 - canvasRect.left;
      const y1 = isTop
        ? boxRect.bottom - canvasRect.top
        : boxRect.top - canvasRect.top;

      const x2 = x1;
      const y2 = spineRect.top + spineRect.height / 2 - canvasRect.top;

      const midY = (y1 + y2) / 2;

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      const d = isTop
        ? `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "#666");
      path.setAttribute("stroke-width", "2.0");
      path.setAttribute("stroke-linecap", "round");

      svg.appendChild(path);
    });
  }

  // --- Table rendering ---

  function updateTable() {
    const tbody = $("modelTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // Sort categories by side then name
    const sortedCats = categories.slice().sort((a, b) => {
      if (a.side === b.side) {
        return a.name.localeCompare(b.name);
      }
      return a.side === "top" ? -1 : 1;
    });

    sortedCats.forEach(cat => {
      // Category row
      const trCat = document.createElement("tr");
      trCat.innerHTML = `
        <td>Category</td>
        <td>${escapeHtml(cat.name)}</td>
        <td>${escapeHtml(cat.side || "top")}</td>
        <td></td>
        <td></td>
      `;
      trCat.addEventListener("click", () => {
        startEditCategory(cat.id);
      });
      tbody.appendChild(trCat);

      // Causes for category
      const catCauses = getCausesByCategory(cat.id);
      catCauses.forEach(cause => {
        const parent = cause.parentId ? getCauseById(cause.parentId) : null;
        const tr = document.createElement("tr");
        const isChild = !!cause.parentId;
        tr.innerHTML = `
          <td>${isChild ? "Sub-cause" : "Cause"}</td>
          <td>${escapeHtml(cat.name)}</td>
          <td>${escapeHtml(cat.side || "top")}</td>
          <td>${isChild ? "&mdash; " : ""}${escapeHtml(cause.text)}</td>
          <td>${parent ? escapeHtml(parent.text) : ""}</td>
        `;
        tr.addEventListener("click", () => {
          startEditCause(cause.id);
        });
        tbody.appendChild(tr);
      });
    });
  }

  // --- CSV export/import ---

  function exportCsv() {
    const rows = [];

    const title = $("modelTitle") ? $("modelTitle").value.trim() : "";
    const problem = $("problemText") ? $("problemText").value.trim() : "";

    rows.push({
      type: "meta",
      field: "title",
      value: title
    });
    rows.push({
      type: "meta",
      field: "problem",
      value: problem
    });

    categories.forEach(cat => {
      rows.push({
        type: "category",
        id: cat.id,
        name: cat.name,
        side: cat.side,
        color: cat.color || ""
      });
    });

    causes.forEach(cause => {
      rows.push({
        type: "cause",
        id: cause.id,
        categoryId: cause.categoryId,
        text: cause.text,
        parentId: cause.parentId || ""
      });
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "fishbone-model.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importCsv(file) {
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: function (results) {
        if (results.errors && results.errors.length) {
          console.error(results.errors);
          alert("Error parsing CSV: " + results.errors[0].message);
          return;
        }

        const data = results.data;
        const newCategories = [];
        const newCauses = [];
        let metaTitle = "";
        let metaProblem = "";

        data.forEach(row => {
          const type = (row.type || "").toLowerCase();
          if (type === "meta") {
            if (String(row.field || "").toLowerCase() === "title") {
              metaTitle = row.value || "";
            } else if (String(row.field || "").toLowerCase() === "problem") {
              metaProblem = row.value || "";
            }
          } else if (type === "category") {
            newCategories.push({
              id: row.id ? String(row.id) : String(newCategories.length + 1),
              name: row.name || "",
              side: row.side === "bottom" ? "bottom" : "top",
              color: row.color || ""
            });
          } else if (type === "cause") {
            newCauses.push({
              id: row.id ? String(row.id) : "",
              categoryId: row.categoryId ? String(row.categoryId) : "",
              text: row.text || "",
              parentId: row.parentId ? String(row.parentId) : ""
            });
          }
        });

        if (!newCategories.length) {
          alert("No categories found in CSV.");
          return;
        }

        // Basic validation to attach IDs
        let nextCatId = 1;
        newCategories.forEach(cat => {
          if (!cat.id) cat.id = String(nextCatId++);
        });

        let nextCId = 1;
        newCauses.forEach(c => {
          if (!c.id) c.id = String(nextCId++);
        });

        categories = newCategories;
        causes = newCauses.filter(c => c.text && c.categoryId);

        // Adjust next IDs
        nextCategoryId =
          Math.max.apply(
            null,
            categories.map(c => parseInt(c.id, 10) || 0)
          ) + 1;
        if (!isFinite(nextCategoryId)) nextCategoryId = categories.length + 1;

        nextCauseId =
          Math.max.apply(
            null,
            causes.map(c => parseInt(c.id, 10) || 0)
          ) + 1;
        if (!isFinite(nextCauseId)) nextCauseId = causes.length + 1;

        if ($("modelTitle")) $("modelTitle").value = metaTitle || "";
        if ($("problemText")) $("problemText").value = metaProblem || "";

        editingCategoryId = null;
        editingCauseId = null;
        clearCategoryForm();
        clearCauseForm();
        populateCategorySelects();
        updateAllViews();
      },
      error: function (err) {
        console.error(err);
        alert("Error reading CSV.");
      }
    });
  }

  // --- JSON export/import ---

  function exportJson() {
    const title = $("modelTitle") ? $("modelTitle").value.trim() : "";
    const problem = $("problemText") ? $("problemText").value.trim() : "";

    const payload = {
      version: 1,
      title,
      problem,
      appearance: { ...appearance },
      categories,
      causes
    };

    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "fishbone-model.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importJson(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const text = e.target.result;
        const obj = JSON.parse(text);
        if (!obj || !Array.isArray(obj.categories) || !Array.isArray(obj.causes)) {
          alert("JSON file does not look like a fishbone model.");
          return;
        }

        categories = obj.categories.map(c => ({
          id: String(c.id),
          name: c.name || "",
          side: c.side === "bottom" ? "bottom" : "top",
          color: c.color || ""
        }));

        causes = obj.causes.map(c => ({
          id: String(c.id),
          text: c.text || "",
          categoryId: String(c.categoryId),
          parentId: c.parentId ? String(c.parentId) : ""
        }));

        if (obj.appearance) {
          if (typeof obj.appearance.boxHeight === "number") {
            appearance.boxHeight = obj.appearance.boxHeight;
          }
          if (typeof obj.appearance.verticalGap === "number") {
            appearance.verticalGap = obj.appearance.verticalGap;
          }
          if (typeof obj.appearance.fontSize === "number") {
            appearance.fontSize = obj.appearance.fontSize;
          }
          if (typeof obj.appearance.fontBold === "boolean") {
            appearance.fontBold = obj.appearance.fontBold;
          }
        }

        if ($("modelTitle")) $("modelTitle").value = obj.title || "";
        if ($("problemText")) $("problemText").value = obj.problem || "";

        // update inputs
        if ($("boxHeightInput")) $("boxHeightInput").value = appearance.boxHeight;
        if ($("verticalGapInput")) $("verticalGapInput").value = appearance.verticalGap;
        if ($("fontSizeInput")) $("fontSizeInput").value = appearance.fontSize;
        if ($("fontBoldInput")) $("fontBoldInput").checked = appearance.fontBold;

        // Adjust next IDs
        nextCategoryId =
          Math.max.apply(
            null,
            categories.map(c => parseInt(c.id, 10) || 0)
          ) + 1;
        if (!isFinite(nextCategoryId)) nextCategoryId = categories.length + 1;

        nextCauseId =
          Math.max.apply(
            null,
            causes.map(c => parseInt(c.id, 10) || 0)
          ) + 1;
        if (!isFinite(nextCauseId)) nextCauseId = causes.length + 1;

        editingCategoryId = null;
        editingCauseId = null;
        clearCategoryForm();
        clearCauseForm();
        populateCategorySelects();
        updateAllViews();
      } catch (err) {
        console.error(err);
        alert("Error parsing JSON.");
      }
    };
    reader.onerror = function () {
      alert("Error reading JSON file.");
    };
    reader.readAsText(file, "utf-8");
  }

  // --- Export diagram as PNG / PDF ---

  function exportDiagramAsPng() {
    const wrapper = $("fishboneDiagramWrapper");
    if (!wrapper) return;

    wrapper.classList.add("export-clean");

    html2canvas(wrapper, { scale: 2 }).then(canvas => {
      const link = document.createElement("a");
      link.download = "fishbone-diagram.png";
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      wrapper.classList.remove("export-clean");
    }).catch(err => {
      console.error(err);
      wrapper.classList.remove("export-clean");
      alert("Error creating PNG.");
    });
  }

  function exportDiagramAsPdf() {
    const wrapper = $("fishboneDiagramWrapper");
    if (!wrapper) return;

    wrapper.classList.add("export-clean");

    const opt = {
      margin: 10,
      filename: "fishbone-diagram.pdf",
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "landscape" }
    };

    html2pdf()
      .from(wrapper)
      .set(opt)
      .save()
      .then(() => {
        wrapper.classList.remove("export-clean");
      })
      .catch(err => {
        console.error(err);
        wrapper.classList.remove("export-clean");
        alert("Error creating PDF.");
      });
  }

  // --- UI toggles & help ---

  function setupCollapsibles() {
    const headers = document.querySelectorAll(".collapsible-header");
    headers.forEach(header => {
      const targetId = header.getAttribute("data-target");
      if (!targetId) return;

      const target = $(targetId);
      if (!target) return;

      header.addEventListener("click", () => {
        const isCollapsed = target.classList.toggle("is-collapsed");
        const indicator = header.querySelector(".collapsible-indicator");
        if (indicator) {
          indicator.textContent = isCollapsed ? "Show" : "Hide";
        }
      });
    });
  }

  function toggleControlsVisibility() {
    const panel = $("controlsPanel");
    const btn = $("btnToggleControls");
    if (!panel || !btn) return;

    if (panel.style.display === "none") {
      panel.style.display = "";
      btn.textContent = "Hide controls";
    } else {
      panel.style.display = "none";
      btn.textContent = "Show controls";
    }
  }

  function toggleTableVisibility() {
    const section = $("tableSection");
    const indicator = $("tableIndicator");
    const btn = $("btnToggleTable");
    if (!section || !btn) return;

    if (section.style.display === "none") {
      section.style.display = "";
      btn.textContent = "Hide table";
      if (indicator) indicator.textContent = "Hide";
    } else {
      section.style.display = "none";
      btn.textContent = "Show table";
      if (indicator) indicator.textContent = "Show";
    }
  }

  function openHelp() {
    const modal = $("helpModal");
    if (modal) modal.classList.add("is-open");
  }

  function closeHelp() {
    const modal = $("helpModal");
    if (modal) modal.classList.remove("is-open");
  }

  // --- Main update ---

  function updateAllViews() {
    populateCategorySelects();
    updateDiagram();
    updateTable();
  }

  // --- Init ---

  document.addEventListener("DOMContentLoaded", function () {
    // Seed
    seedDefaultCategories();

    // Collapsible sections
    setupCollapsibles();

    // Buttons & events
    if ($("btnApplyAppearance")) {
      $("btnApplyAppearance").addEventListener("click", applyAppearanceFromInputs);
    }
    if ($("btnAddCategory")) {
      $("btnAddCategory").addEventListener("click", addOrUpdateCategoryFromForm);
    }
    if ($("btnResetCategory")) {
      $("btnResetCategory").addEventListener("click", clearCategoryForm);
    }

    if ($("btnAddCause")) {
      $("btnAddCause").addEventListener("click", addOrUpdateCauseFromForm);
    }
    if ($("btnResetCause")) {
      $("btnResetCause").addEventListener("click", clearCauseForm);
    }

    const csvInput = $("csvFileInput");
    if (csvInput) {
      csvInput.addEventListener("change", function () {
        if (csvInput.files && csvInput.files[0]) {
          importCsv(csvInput.files[0]);
          csvInput.value = "";
        }
      });
    }
    const jsonInput = $("jsonFileInput");
    if (jsonInput) {
      jsonInput.addEventListener("change", function () {
        if (jsonInput.files && jsonInput.files[0]) {
          importJson(jsonInput.files[0]);
          jsonInput.value = "";
        }
      });
    }

    if ($("btnExportCsv")) {
      $("btnExportCsv").addEventListener("click", exportCsv);
    }
    if ($("btnExportJson")) {
      $("btnExportJson").addEventListener("click", exportJson);
    }
    if ($("btnExportPng")) {
      $("btnExportPng").addEventListener("click", exportDiagramAsPng);
    }
    if ($("btnExportPdf")) {
      $("btnExportPdf").addEventListener("click", exportDiagramAsPdf);
    }
    if ($("btnClearAll")) {
      $("btnClearAll").addEventListener("click", function () {
        if (window.confirm("Clear the current fishbone diagram?")) {
          resetModel();
        }
      });
    }
    if ($("btnToggleControls")) {
      $("btnToggleControls").addEventListener("click", toggleControlsVisibility);
    }
    if ($("btnToggleTable")) {
      $("btnToggleTable").addEventListener("click", toggleTableVisibility);
    }
    if ($("btnHelp")) {
      $("btnHelp").addEventListener("click", openHelp);
    }
    if ($("helpCloseBtn")) {
      $("helpCloseBtn").addEventListener("click", closeHelp);
    }
    const helpModal = $("helpModal");
    if (helpModal) {
      helpModal.addEventListener("click", function (e) {
        if (e.target === helpModal) {
          closeHelp();
        }
      });
    }

    // Initial sync of appearance inputs from defaults
    if ($("boxHeightInput")) $("boxHeightInput").value = appearance.boxHeight;
    if ($("verticalGapInput")) $("verticalGapInput").value = appearance.verticalGap;
    if ($("fontSizeInput")) $("fontSizeInput").value = appearance.fontSize;
    if ($("fontBoldInput")) $("fontBoldInput").checked = appearance.fontBold;

    updateAllViews();
  });
})();
