const STORAGE_KEY = "obsPortraitDeckState:v1";
const BASE_STAGE_WIDTH = 540;
const BASE_STAGE_HEIGHT = 960;
const DEFAULT_TEXT_BG = "#0f172a";
const DEFAULT_TEXT_COLOR = "#f8fafc";
const DISPLAY_WINDOW_NAME = "obsPortraitDisplay";
const DISPLAY_WINDOW_FEATURES_BASE = [
  "popup=1",
  `width=${BASE_STAGE_WIDTH}`,
  `height=${BASE_STAGE_HEIGHT}`,
  "resizable=yes",
  "scrollbars=no",
  "toolbar=0",
  "location=0",
  "status=0",
  "menubar=0",
];
const REMOTE_WINDOW_NAME = "obsPortraitRemote";
const REMOTE_WINDOW_FEATURES_BASE = [
  "popup=1",
  "resizable=yes",
  "scrollbars=no",
  "toolbar=0",
  "location=0",
  "status=0",
  "menubar=0",
  "width=720",
  "height=320",
];

const root = document.getElementById("app");
const params = new URLSearchParams(window.location.search);
const isDisplay = params.get("view") === "display";
const isRemote = params.get("view") === "remote";

let deckState = loadState();
let uiState = {
  selectedId: deckState.slides[deckState.currentIndex]?.id ?? null,
  replaceTargetId: null,
  restoreFocus: null,
  displayBlocked: false,
  remoteBlocked: false,
};
let displayWindowRef = null;
let remoteWindowRef = null;
let autoDisplayAttempted = false;
let autoRemoteAttempted = false;

render();
attachGlobalListeners();
maybeAutoOpenDisplayWindow();
maybeAutoOpenRemoteWindow();

function loadState() {
  if (typeof localStorage === "undefined") {
    return { slides: [], currentIndex: 0 };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { slides: [], currentIndex: 0 };
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.slides)) {
      return { slides: [], currentIndex: 0 };
    }
    return {
      slides: parsed.slides,
      currentIndex: clampIndex(parsed.currentIndex ?? 0, parsed.slides.length),
    };
  } catch (error) {
    console.warn("Failed to parse saved deck; starting fresh.", error);
    return { slides: [], currentIndex: 0 };
  }
}

function clampIndex(index, length) {
  if (length === 0) return 0;
  if (index < 0) return 0;
  if (index > length - 1) return length - 1;
  return index;
}

function persistAndRender(options = {}) {
  deckState.currentIndex = clampIndex(
    deckState.currentIndex,
    deckState.slides.length
  );

  if (!deckState.slides.length) {
    deckState.currentIndex = 0;
    uiState.selectedId = null;
  }

  if (!isDisplay && typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deckState));
  }

  if (options.restoreFocus) {
    uiState.restoreFocus = options.restoreFocus;
  }

  render();
}

function attachGlobalListeners() {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const next = JSON.parse(event.newValue);
        if (Array.isArray(next.slides)) {
          deckState = {
            slides: next.slides,
            currentIndex: clampIndex(
              next.currentIndex ?? deckState.currentIndex,
              next.slides.length
            ),
          };
          render();
        }
      } catch (error) {
        console.error("Unable to sync deck state", error);
      }
    }
  });

  if (isDisplay) {
    window.addEventListener("resize", () => fitDisplayStage());
    return;
  }

  if (isRemote) {
    root.addEventListener("click", handleRemoteClick);
    window.addEventListener("keydown", handleRemoteKeydown);
    return;
  }

  root.addEventListener("click", handleClick);
  root.addEventListener("input", handleInput);
  root.addEventListener("change", handleChange);
  root.addEventListener("submit", handleSubmit);

  window.addEventListener("keydown", (event) => {
    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName ?? ""
      )
    ) {
      return;
    }

    if (event.key === "ArrowRight" || event.key === " ") {
      event.preventDefault();
      moveSlide(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSlide(-1);
    }
  });
}

function handleClick(event) {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) return;

  const action = actionEl.dataset.action;
  const slideId = actionEl.dataset.id;

  switch (action) {
    case "openDisplay":
      openDisplayWindow();
      break;
    case "copyDisplayLink":
      copyDisplayLink();
      break;
    case "openRemote":
      openRemoteWindow();
      break;
    case "prev":
      moveSlide(-1);
      break;
    case "next":
      moveSlide(1);
      break;
    case "jumpTo":
      if (slideId) goToSlide(slideId);
      break;
    case "selectSlide":
      if (slideId) {
        uiState.selectedId = slideId;
        render();
      }
      break;
    case "deleteSlide":
      if (slideId) deleteSlide(slideId);
      break;
    case "duplicateSlide":
      if (slideId) duplicateSlide(slideId);
      break;
    case "moveUp":
      if (slideId) reorderSlide(slideId, -1);
      break;
    case "moveDown":
      if (slideId) reorderSlide(slideId, 1);
      break;
    case "clearDeck":
      clearDeck();
      break;
    case "loadSample":
      loadSampleDeck();
      break;
    case "exportDeck":
      exportDeck();
      break;
    case "replaceImage":
      if (slideId) {
        uiState.replaceTargetId = slideId;
        const input = document.querySelector('[data-role="replace-image"]');
        if (input) {
          input.value = "";
          input.click();
        }
      }
      break;
    default:
      break;
  }
}

function handleRemoteClick(event) {
  const actionEl = event.target.closest("[data-remote-action]");
  if (!actionEl) return;
  if (actionEl.dataset.hasSlide !== "true") return;
  const action = actionEl.dataset.remoteAction;
  if (action === "prev") {
    moveSlide(-1);
  } else if (action === "next") {
    moveSlide(1);
  } else if (action === "current") {
    const slideId = actionEl.dataset.id;
    if (slideId) {
      goToSlide(slideId);
    }
  }
}

function handleRemoteKeydown(event) {
  if (["ArrowRight", " "].includes(event.key)) {
    event.preventDefault();
    moveSlide(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveSlide(-1);
  }
}

function handleInput(event) {
  const field = event.target.dataset.editField;
  if (!field) return;
  const slideId = event.target.dataset.slideId;
  if (!slideId) return;
  const tag = event.target.tagName.toLowerCase();
  const type = event.target.type;
  const needsCaret =
    tag === "textarea" || type === "text" || type === "search";
  const restoreFocus = needsCaret
    ? {
        slideId,
        field,
        start: event.target.selectionStart,
        end: event.target.selectionEnd,
      }
    : null;
  updateSlideField(slideId, field, event.target.value, restoreFocus);
}

function handleChange(event) {
  const role = event.target.dataset.role;
  if (role === "image-input") {
    handleImageFiles(event.target.files);
    event.target.value = "";
    return;
  }

  if (role === "import-json") {
    handleImport(event.target.files?.[0]);
    event.target.value = "";
    return;
  }

  if (role === "replace-image") {
    if (uiState.replaceTargetId && event.target.files?.[0]) {
      replaceImage(uiState.replaceTargetId, event.target.files[0]);
    }
    uiState.replaceTargetId = null;
    event.target.value = "";
  }
}

function handleSubmit(event) {
  if (event.target.matches("#textSlideForm")) {
    event.preventDefault();
    const data = new FormData(event.target);
    const slide = {
      id: generateId(),
      type: "text",
      label: (data.get("title") || "Untitled Text Slide").trim(),
      title: (data.get("title") || "").trim(),
      body: (data.get("body") || "").trim(),
      footnote: (data.get("footnote") || "").trim(),
      eyebrow: (data.get("eyebrow") || "").trim(),
      background: data.get("background") || DEFAULT_TEXT_BG,
      textColor: data.get("textColor") || DEFAULT_TEXT_COLOR,
      align: data.get("align") || "center",
      createdAt: Date.now(),
    };
    deckState.slides.push(slide);
    uiState.selectedId = slide.id;
    persistAndRender();
    event.target.reset();
    event.target.elements.background.value = DEFAULT_TEXT_BG;
    event.target.elements.textColor.value = DEFAULT_TEXT_COLOR;
  }
}

function moveSlide(delta) {
  if (!deckState.slides.length) return;
  deckState.currentIndex = clampIndex(
    deckState.currentIndex + delta,
    deckState.slides.length
  );
  uiState.selectedId = deckState.slides[deckState.currentIndex]?.id ?? null;
  persistAndRender();
}

function goToSlide(slideId) {
  const index = deckState.slides.findIndex((slide) => slide.id === slideId);
  if (index === -1) return;
  deckState.currentIndex = index;
  uiState.selectedId = slideId;
  persistAndRender();
}

function deleteSlide(slideId) {
  const index = deckState.slides.findIndex((slide) => slide.id === slideId);
  if (index === -1) return;
  deckState.slides.splice(index, 1);
  if (deckState.currentIndex >= deckState.slides.length) {
    deckState.currentIndex = deckState.slides.length - 1;
  }
  if (uiState.selectedId === slideId) {
    uiState.selectedId = deckState.slides[deckState.currentIndex]?.id ?? null;
  }
  persistAndRender();
}

function duplicateSlide(slideId) {
  const index = deckState.slides.findIndex((slide) => slide.id === slideId);
  if (index === -1) return;
  const original = deckState.slides[index];
  const clone = JSON.parse(JSON.stringify(original));
  clone.id = generateId();
  clone.label = `${original.label || original.title || "Slide"} (copy)`;
  clone.createdAt = Date.now();
  deckState.slides.splice(index + 1, 0, clone);
  uiState.selectedId = clone.id;
  persistAndRender();
}

function reorderSlide(slideId, delta) {
  const index = deckState.slides.findIndex((slide) => slide.id === slideId);
  if (index === -1) return;
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= deckState.slides.length) return;
  const [slide] = deckState.slides.splice(index, 1);
  deckState.slides.splice(targetIndex, 0, slide);
  if (deckState.currentIndex === index) {
    deckState.currentIndex = targetIndex;
  }
  persistAndRender();
}

function clearDeck() {
  const confirmed = window.confirm(
    "Clear all slides? This removes the current deck from your browser storage."
  );
  if (!confirmed) return;
  deckState = { slides: [], currentIndex: 0 };
  uiState.selectedId = null;
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
  render();
}

function loadSampleDeck() {
  const samples = [
    {
      id: generateId(),
      type: "text",
      label: "Tonight's Headlines",
      eyebrow: "Tonight",
      title: "Headlines To Watch",
      body: "🏛️ Capitol Hill budget showdown\n🌐 TikTok ban showdown\n🚀 Falcon booster static fire",
      footnote: "Portrait Slide Deck",
      background: "#0f172a",
      textColor: "#f8fafc",
      align: "center",
      createdAt: Date.now(),
    },
    {
      id: generateId(),
      type: "text",
      label: "Upcoming Guests",
      eyebrow: "Guests",
      title: "On Deck This Hour",
      body: "• Dr. Alexis Monroe — AI & Policy\n• Brian Lopez — Primary map math\n• Jay Kincaid — Meme desk remix",
      background: "#0b3b5e",
      textColor: "#e2e8f0",
      align: "left",
      createdAt: Date.now(),
    },
    {
      id: generateId(),
      type: "text",
      label: "Call To Action",
      title: "Subscribe & Jump In Chat",
      body: "Drop your spicy takes live.\nWe read the best ones on-air every block.",
      footnote: "@YourHandle • Portrait Slide Deck",
      background: "#111827",
      textColor: "#fef3c7",
      align: "center",
      createdAt: Date.now(),
    },
  ];

  deckState = { slides: samples, currentIndex: 0 };
  uiState.selectedId = samples[0].id;
  persistAndRender();
}

function exportDeck() {
  if (!deckState.slides.length) return;
  const blob = new Blob([JSON.stringify(deckState, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `obs-portrait-deck-${timestamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function updateSlideField(slideId, field, value, restoreFocus = null) {
  const slide = deckState.slides.find((item) => item.id === slideId);
  if (!slide) return;
  slide[field] = value;
  if (field === "title" && !slide.label) {
    slide.label = value;
  }
  persistAndRender({ restoreFocus });
}

function handleImageFiles(fileList) {
  if (!fileList?.length) return;
  const files = Array.from(fileList).filter((file) =>
    file.type.startsWith("image/")
  );
  if (!files.length) return;
  Promise.all(files.map(fileToSlide))
    .then((newSlides) => {
      newSlides.forEach((slide) => deckState.slides.push(slide));
      uiState.selectedId = newSlides[newSlides.length - 1]?.id ?? null;
      persistAndRender();
    })
    .catch((error) => {
      console.error(error);
      window.alert("Unable to load one of those images. Try a different file.");
    });
}

function fileToSlide(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id: generateId(),
        type: "image",
        label: cleanLabel(file.name),
        imageData: reader.result,
        imageFit: "cover",
        createdAt: Date.now(),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function replaceImage(slideId, file) {
  const slide = deckState.slides.find((item) => item.id === slideId);
  if (!slide || slide.type !== "image" || !file) return;
  const reader = new FileReader();
  reader.onload = () => {
    slide.imageData = reader.result;
    slide.label = cleanLabel(file.name);
    persistAndRender();
  };
  reader.readAsDataURL(file);
}

function cleanLabel(name) {
  return name.replace(/\.[^/.]+$/, "");
}

function handleImport(file) {
  if (!file) return;
  file
    .text()
    .then((text) => JSON.parse(text))
    .then((data) => {
      if (!Array.isArray(data.slides)) {
        throw new Error("No slides found in file.");
      }
      const sanitized = data.slides
        .filter((slide) => slide && typeof slide === "object")
        .map((slide) => ({
          id: slide.id || generateId(),
          type: slide.type === "image" ? "image" : "text",
          label: slide.label || slide.title || "Slide",
          title: slide.title || "",
          body: slide.body || "",
          footnote: slide.footnote || "",
          eyebrow: slide.eyebrow || "",
          background: slide.background || DEFAULT_TEXT_BG,
          textColor: slide.textColor || DEFAULT_TEXT_COLOR,
          align: slide.align === "left" ? "left" : "center",
          imageData: slide.imageData || "",
          imageFit: slide.imageFit === "contain" ? "contain" : "cover",
          createdAt: slide.createdAt || Date.now(),
        }))
        .filter((slide) => {
          if (slide.type === "image") {
            return Boolean(slide.imageData);
          }
          return Boolean(slide.title || slide.body);
        });

      deckState = {
        slides: sanitized,
        currentIndex: clampIndex(data.currentIndex ?? 0, sanitized.length),
      };
      uiState.selectedId = deckState.slides[deckState.currentIndex]?.id ?? null;
      persistAndRender();
    })
    .catch((error) => {
      console.error(error);
      window.alert("Unable to import that file. Please choose a deck export.");
    });
}

function render() {
  if (isDisplay) {
    renderDisplay();
  } else if (isRemote) {
    renderRemote();
  } else {
    renderControl();
  }
}

function renderControl() {
  const { slides, currentIndex } = deckState;
  if (slides.length && !slides.find((slide) => slide.id === uiState.selectedId)) {
    uiState.selectedId = slides[currentIndex]?.id ?? slides[0]?.id ?? null;
  }
  const currentSlide = slides[currentIndex];
  const nextSlide = slides[currentIndex + 1];
  const selected = slides.find((slide) => slide.id === uiState.selectedId);
  const displayUrl = buildDisplayUrl();
  const remoteUrl = buildRemoteUrl();
  const warnings = [];
  if (uiState.displayBlocked) {
    warnings.push(
      '<p class="inline-warning" role="status">Your browser blocked the stage window. Click "Open display window" above to launch it manually.</p>'
    );
  }
  if (uiState.remoteBlocked) {
    warnings.push(
      '<p class="inline-warning" role="status">Your browser blocked the quick remote. Click "Open mini remote" above to pop it out.</p>'
    );
  }

  root.innerHTML = `
    <header class="panel">
      <div>
        <h1>Portrait Slide Deck</h1>
        <p class="muted">Keep this window as your control room. Add text or image slides, then open the display window in OBS as a Browser Source.</p>
      </div>
      <div class="import-export">
        <button type="button" class="btn accent" data-action="openDisplay">Open display window</button>
        <button type="button" class="btn ghost" data-action="copyDisplayLink">Copy display link</button>
        <button type="button" class="btn ghost" data-action="openRemote">Open mini remote</button>
      </div>
      ${warnings.join("")}
    </header>
    <main class="control-main">
      <section class="preview-column">
        <div class="panel preview-card">
          <div class="panel-header">
            <h3>Current Slide</h3>
            <span class="badge">${currentSlide ? currentSlide.type : "Idle"}</span>
          </div>
          ${
            currentSlide
              ? renderStage(currentSlide, "preview")
              : '<div class="stage-shell empty preview">Load or create a slide to get started.</div>'
          }
          <div class="nav-buttons">
            <button type="button" class="btn" data-action="prev">← Previous</button>
            <button type="button" class="btn" data-action="next">Next →</button>
            ${
              selected && selected.id !== currentSlide?.id
                ? `<button type="button" class="btn ghost" data-action="jumpTo" data-id="${selected.id}">Take selected live</button>`
                : ""
            }
          </div>
          <div class="controls-bar">
            <div class="stats">${
              slides.length
                ? `Slide ${currentIndex + 1} of ${slides.length}`
                : "No slides loaded"
            }</div>
            <div class="muted">Keyboard: ← and → (or space) to advance</div>
          </div>
        </div>
        <div class="panel preview-card">
          <div class="panel-header">
            <h3>Next Up</h3>
          </div>
          ${
            nextSlide
              ? renderStage(nextSlide, "preview")
              : '<div class="stage-shell empty preview">No slide queued after this one.</div>'
          }
        </div>
        <div class="panel">
          <h3>OBS Tip</h3>
          <p class="tips">
            Point a Browser Source at <strong>${displayUrl}</strong>. Set the source to
            <strong>1080x1920</strong>, enable <em>Refresh when scene becomes active</em>,
            and drag the source to fill your portrait half of the scene.
          </p>
          <p class="tips" style="margin-top:8px;">
            Need a quiet remote? Bookmark <strong>${remoteUrl}</strong> or use the mini window button above while producing.
          </p>
        </div>
      </section>
      <section class="deck-column">
        <div class="panel">
          <div class="panel-header">
            <h2>Build slides</h2>
            <div class="import-export">
              <label class="btn ghost" for="imageInput">Add image slides</label>
              <input class="hidden" type="file" accept="image/*" id="imageInput" multiple data-role="image-input" />
              <label class="btn ghost" for="importDeck">Import deck</label>
              <input class="hidden" type="file" accept="application/json" id="importDeck" data-role="import-json" />
            </div>
          </div>
          <form id="textSlideForm">
            <div class="form-grid">
              <div class="field">
                <label for="title">Title</label>
                <input id="title" name="title" type="text" placeholder="Segment headline" required />
              </div>
              <div class="field">
                <label for="eyebrow">Eyebrow (optional)</label>
                <input id="eyebrow" name="eyebrow" type="text" placeholder="Segment tag" />
              </div>
              <div class="field">
                <label for="footnote">Footer (optional)</label>
                <input id="footnote" name="footnote" type="text" placeholder="@YourHandle" />
              </div>
              <div class="field">
                <label for="align">Layout</label>
                <select id="align" name="align">
                  <option value="center" selected>Centered</option>
                  <option value="left">Left aligned</option>
                </select>
              </div>
              <div class="field">
                <label for="background">Background</label>
                <input id="background" name="background" type="color" value="${DEFAULT_TEXT_BG}" />
              </div>
              <div class="field">
                <label for="textColor">Text color</label>
                <input id="textColor" name="textColor" type="color" value="${DEFAULT_TEXT_COLOR}" />
              </div>
            </div>
            <div class="field">
              <label for="body">Body copy</label>
              <textarea id="body" name="body" placeholder="Supports multi-line text."></textarea>
            </div>
            <div class="nav-buttons" style="margin-top:12px;">
              <button class="btn accent" type="submit">Add text slide</button>
              <button class="btn ghost" type="button" data-action="loadSample">Load sample deck</button>
              <button class="btn danger" type="button" data-action="clearDeck">Clear deck</button>
            </div>
          </form>
        </div>
        <div class="panel">
          <div class="panel-header">
            <h2>Deck (${slides.length})</h2>
            <div class="import-export">
              <button class="btn ghost" type="button" data-action="exportDeck" ${
                slides.length ? "" : "disabled"
              }>Download deck JSON</button>
            </div>
          </div>
          ${
            selected
              ? renderEditor(selected)
              : '<p class="muted">Select a slide to tweak text, colors, or image fit.</p>'
          }
          ${
            slides.length
              ? `<ul class="slide-list">${slides
                  .map((slide, index) => renderSlideRow(slide, index))
                  .join("")}</ul>`
              : '<div class="empty-deck">No slides yet. Add a text slide or drop in PNG/JPG posters.</div>'
          }
        </div>
      </section>
    </main>
    <footer class="control-footer">
      Slides live entirely in this browser (localStorage). Export JSON backups whenever you dial in a rundown; importing reloads that order instantly.
    </footer>
    <input class="hidden" type="file" accept="image/*" data-role="replace-image" />
  `;
  restoreEditorFocus();
}

function renderDisplay() {
  const { slides, currentIndex } = deckState;
  const slide = slides[currentIndex];
  if (!slide) {
    root.innerHTML = `
      <div class="display-root">
        <div class="display-empty">Waiting for slides… keep the control window open and advance from there.</div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="display-root">
      ${renderStage(slide, "display")}
    </div>
  `;
  fitDisplayStage();
}

function renderRemote() {
  const { slides, currentIndex } = deckState;
  if (!slides.length) {
    root.innerHTML = `
      <div class="remote-root empty">
        <p>No slides yet. Keep the main control room open to add slides.</p>
      </div>
    `;
    return;
  }
  const prev = slides[currentIndex - 1];
  const current = slides[currentIndex];
  const next = slides[currentIndex + 1];
  root.innerHTML = `
    <div class="remote-root">
      ${prev ? renderRemoteCard(prev, "Previous", "prev") : renderRemoteSpacer()}
      ${renderRemoteCard(current, "Live", "current")}
      ${next ? renderRemoteCard(next, "Next Up", "next") : renderRemoteSpacer()}
    </div>
  `;
}

function renderStage(slide, variant = "preview") {
  if (!slide) {
    return `<div class="stage-shell empty ${variant}">No slide loaded.</div>`;
  }
  const classes = ["stage-shell"];
  if (variant === "preview") classes.push("preview");
  if (variant === "list") classes.push("list");
  if (variant === "display") classes.push("display-shell", "display");
  if (variant === "remote") classes.push("remote");

  const stageStyle =
    slide.type === "text"
      ? `style="background:${slide.background || DEFAULT_TEXT_BG};color:${
          slide.textColor || DEFAULT_TEXT_COLOR
        }"`
      : "";

  return `
    <div class="${classes.join(" ")}">
      <div class="slide-stage" ${stageStyle}>
        ${
          slide.type === "image"
            ? `<img src="${slide.imageData}" alt="${escapeHtml(
                slide.label || "Slide"
              )}" data-fit="${slide.imageFit || "cover"}" />`
            : renderTextSlide(slide)
        }
      </div>
    </div>
  `;
}

function renderTextSlide(slide) {
  const align = slide.align === "left" ? "left" : "center";
  const eyebrow = slide.eyebrow
    ? `<div class="eyebrow">${escapeHtml(slide.eyebrow)}</div>`
    : "";
  const title = slide.title
    ? `<h1>${escapeHtml(slide.title)}</h1>`
    : "";
  const body = slide.body
    ? `<div class="body-copy">${formatMultiline(slide.body)}</div>`
    : "";
  const footnote = slide.footnote
    ? `<div class="footnote">${escapeHtml(slide.footnote)}</div>`
    : "";
  return `<div class="text-slide" data-align="${align}">${eyebrow}${title}${body}${footnote}</div>`;
}

function renderRemoteCard(slide, label, action) {
  const meta = `<div class="remote-card-meta">${escapeHtml(
    formatRemoteLabel(slide.label || slide.title || "Slide")
  )}</div>`;
  const stage = renderStage(slide, "remote");
  return `
    <button
      type="button"
      class="remote-card"
      data-remote-action="${action}"
      data-has-slide="true"
      data-id="${slide.id}"
    >
      <span class="remote-card-label">${label}</span>
      ${stage}
      ${meta}
    </button>
  `;
}

function renderRemoteSpacer() {
  return `<div class="remote-spacer" aria-hidden="true"></div>`;
}

function renderSlideRow(slide, index) {
  const isActive = deckState.currentIndex === index;
  const isSelected = uiState.selectedId === slide.id;
  return `
    <li class="slide-row ${isActive ? "active" : ""} ${
      isSelected ? "selected" : ""
    }">
      <button type="button" class="row-main" data-action="selectSlide" data-id="${slide.id}">
        ${renderStage(slide, "list")}
        <div class="row-meta">
          <strong>${escapeHtml(slide.label || slide.title || "Slide")}</strong>
          <span>${slide.type === "image" ? "Image" : "Text"} • Slide ${
    index + 1
  }</span>
        </div>
      </button>
      <div class="row-actions">
        <button type="button" data-action="jumpTo" data-id="${slide.id}">Go</button>
        <button type="button" data-action="moveUp" data-id="${slide.id}">↑</button>
        <button type="button" data-action="moveDown" data-id="${slide.id}">↓</button>
        <button type="button" data-action="duplicateSlide" data-id="${slide.id}">Dup</button>
        <button type="button" data-action="deleteSlide" data-id="${slide.id}">✕</button>
      </div>
    </li>
  `;
}

function renderEditor(slide) {
  if (slide.type === "image") {
    return `
      <div class="panel" style="margin-bottom:16px;">
        <div class="panel-header">
          <h3>Edit image slide</h3>
          <span class="badge image">Image</span>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Label</label>
            <input type="text" data-edit-field="label" data-slide-id="${slide.id}" value="${escapeAttr(
      slide.label || ""
    )}" />
          </div>
          <div class="field">
            <label>Fit</label>
            <select data-edit-field="imageFit" data-slide-id="${slide.id}">
              <option value="cover" ${
                slide.imageFit !== "contain" ? "selected" : ""
              }>Cover</option>
              <option value="contain" ${
                slide.imageFit === "contain" ? "selected" : ""
              }>Contain</option>
            </select>
          </div>
        </div>
        <div class="nav-buttons" style="margin-top:12px;">
          <button type="button" class="btn ghost" data-action="replaceImage" data-id="${
            slide.id
          }">Replace image</button>
          <button type="button" class="btn" data-action="jumpTo" data-id="${slide.id}">Go live</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-header">
        <h3>Edit text slide</h3>
        <span class="badge text">Text</span>
      </div>
      <div class="form-grid">
        <div class="field">
          <label>Label</label>
          <input type="text" data-edit-field="label" data-slide-id="${slide.id}" value="${escapeAttr(
    slide.label || ""
  )}" />
        </div>
        <div class="field">
          <label>Title</label>
          <input type="text" data-edit-field="title" data-slide-id="${slide.id}" value="${escapeAttr(
    slide.title || ""
  )}" />
        </div>
        <div class="field">
          <label>Eyebrow</label>
          <input type="text" data-edit-field="eyebrow" data-slide-id="${
            slide.id
          }" value="${escapeAttr(slide.eyebrow || "")}" />
        </div>
        <div class="field">
          <label>Footer</label>
          <input type="text" data-edit-field="footnote" data-slide-id="${
            slide.id
          }" value="${escapeAttr(slide.footnote || "")}" />
        </div>
        <div class="field">
          <label>Layout</label>
          <select data-edit-field="align" data-slide-id="${slide.id}">
            <option value="center" ${
              slide.align !== "left" ? "selected" : ""
            }>Centered</option>
            <option value="left" ${
              slide.align === "left" ? "selected" : ""
            }>Left</option>
          </select>
        </div>
        <div class="field">
          <label>Background</label>
          <input type="color" data-edit-field="background" data-slide-id="${
            slide.id
          }" value="${escapeAttr(slide.background || DEFAULT_TEXT_BG)}" />
        </div>
        <div class="field">
          <label>Text color</label>
          <input type="color" data-edit-field="textColor" data-slide-id="${
            slide.id
          }" value="${escapeAttr(slide.textColor || DEFAULT_TEXT_COLOR)}" />
        </div>
      </div>
      <div class="field" style="margin-top:12px;">
        <label>Body copy</label>
        <textarea data-edit-field="body" data-slide-id="${slide.id}">${escapeHtml(
    slide.body || ""
  )}</textarea>
      </div>
    </div>
  `;
}

function buildDisplayUrl() {
  const href = window.location.href;
  const [base] = href.split("?");
  return `${base}?view=display`;
}

function buildRemoteUrl() {
  const href = window.location.href;
  const [base] = href.split("?");
  return `${base}?view=remote`;
}

function openDisplayWindow() {
  ensureDisplayWindow({ focus: true });
}

function openRemoteWindow() {
  ensureRemoteWindow({ focus: true });
}

async function copyDisplayLink() {
  const url = buildDisplayUrl();
  try {
    await navigator.clipboard.writeText(url);
  } catch (error) {
    console.warn("Clipboard copy failed", error);
    window.prompt("Copy this URL manually:", url); // fallback
  }
}

function formatMultiline(text) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function formatRemoteLabel(text) {
  if (!text) return "Slide";
  const trimmed = text.trim();
  if (trimmed.length <= 28) return trimmed;
  return `${trimmed.slice(0, 25)}…`;
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function generateId() {
  if (window.crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `slide-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function fitDisplayStage() {
  const shell = document.querySelector(".stage-shell.display-shell");
  if (!shell) return;
  const scale = Math.min(
    window.innerWidth / BASE_STAGE_WIDTH,
    window.innerHeight / BASE_STAGE_HEIGHT
  );
  shell.style.setProperty("--scale", scale.toString());
}

function restoreEditorFocus() {
  if (!uiState.restoreFocus) return;
  const { slideId, field, start, end } = uiState.restoreFocus;
  const selector = `[data-slide-id="${slideId}"][data-edit-field="${field}"]`;
  const el = root.querySelector(selector);
  if (el) {
    el.focus();
    if (
      typeof start === "number" &&
      typeof end === "number" &&
      el.setSelectionRange
    ) {
      el.setSelectionRange(start, end);
    }
  }
  uiState.restoreFocus = null;
}

function ensureDisplayWindow({ focus = false, markBlocked = true } = {}) {
  if (isDisplay) return false;
  const url = buildDisplayUrl();
  if (displayWindowRef && displayWindowRef.closed) {
    displayWindowRef = null;
  }
  if (displayWindowRef) {
    try {
      displayWindowRef.location.replace(url);
      resizeDisplayWindow(displayWindowRef);
    } catch (error) {
      console.warn("Unable to refresh display window", error);
      displayWindowRef = null;
    }
  }
  if (!displayWindowRef) {
    try {
      displayWindowRef = window.open(
        url,
        DISPLAY_WINDOW_NAME,
        buildDisplayWindowFeatures()
      );
      resizeDisplayWindow(displayWindowRef);
    } catch (error) {
      console.warn("Display window blocked", error);
      displayWindowRef = null;
    }
  }
  if (displayWindowRef) {
    uiState.displayBlocked = false;
    if (focus) {
      try {
        displayWindowRef.focus();
      } catch (error) {
        console.warn("Unable to focus display window", error);
      }
    }
    return true;
  }
  if (markBlocked && !uiState.displayBlocked) {
    uiState.displayBlocked = true;
    render();
  }
  return false;
}

function ensureRemoteWindow({ focus = false, markBlocked = true } = {}) {
  if (isDisplay || isRemote) return false;
  const url = buildRemoteUrl();
  if (remoteWindowRef && remoteWindowRef.closed) {
    remoteWindowRef = null;
  }
  if (remoteWindowRef) {
    try {
      remoteWindowRef.location.replace(url);
      resizeRemoteWindow(remoteWindowRef);
    } catch (error) {
      console.warn("Unable to refresh remote window", error);
      remoteWindowRef = null;
    }
  }
  if (!remoteWindowRef) {
    try {
      remoteWindowRef = window.open(
        url,
        REMOTE_WINDOW_NAME,
        buildRemoteWindowFeatures()
      );
      resizeRemoteWindow(remoteWindowRef);
    } catch (error) {
      console.warn("Remote window blocked", error);
      remoteWindowRef = null;
    }
  }
  if (remoteWindowRef) {
    uiState.remoteBlocked = false;
    if (focus) {
      try {
        remoteWindowRef.focus();
      } catch (error) {
        console.warn("Unable to focus remote window", error);
      }
    }
    return true;
  }
  if (markBlocked && !uiState.remoteBlocked) {
    uiState.remoteBlocked = true;
    render();
  }
  return false;
}

function maybeAutoOpenDisplayWindow() {
  if (isDisplay || autoDisplayAttempted) return;
  autoDisplayAttempted = true;
  if (document.readyState === "complete") {
    ensureDisplayWindow();
  } else {
    window.addEventListener(
      "load",
      () => {
        ensureDisplayWindow();
      },
      { once: true }
    );
  }
}

function maybeAutoOpenRemoteWindow() {
  if (isDisplay || isRemote || autoRemoteAttempted) return;
  autoRemoteAttempted = true;
  if (document.readyState === "complete") {
    ensureRemoteWindow();
  } else {
    window.addEventListener(
      "load",
      () => {
        ensureRemoteWindow();
      },
      { once: true }
    );
  }
}

function buildDisplayWindowFeatures() {
  const left = Number.isFinite(window.screenX)
    ? Math.max(0, Math.round(window.screenX + 60))
    : 120;
  const top = Number.isFinite(window.screenY)
    ? Math.max(0, Math.round(window.screenY + 40))
    : 80;
  return [...DISPLAY_WINDOW_FEATURES_BASE, `left=${left}`, `top=${top}`].join(
    ","
  );
}

function resizeDisplayWindow(win) {
  if (!win?.resizeTo) return;
  try {
    win.resizeTo(
      Math.round(BASE_STAGE_WIDTH),
      Math.round(BASE_STAGE_HEIGHT)
    );
  } catch (error) {
    console.warn("Unable to resize display window", error);
  }
}

function buildRemoteWindowFeatures() {
  const left = Number.isFinite(window.screenX)
    ? Math.max(0, Math.round(window.screenX + 80))
    : 160;
  const top = Number.isFinite(window.screenY)
    ? Math.max(0, Math.round(window.screenY + 120))
    : 120;
  return [...REMOTE_WINDOW_FEATURES_BASE, `left=${left}`, `top=${top}`].join(
    ","
  );
}

function resizeRemoteWindow(win) {
  if (!win?.resizeTo) return;
  try {
    win.resizeTo(720, 320);
  } catch (error) {
    console.warn("Unable to resize remote window", error);
  }
}
