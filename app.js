// app.js — Concept Studio
// Talks directly to the Anthropic API from the browser using the user's own key.

const API_URL = "https://api.anthropic.com/v1/messages";
const LS_KEY = "concept-studio.apiKey";
const LS_MODEL = "concept-studio.model";

const state = {
  mode: "stage1",
  venue: "kingdom-arena",
  images: [], // { id, media_type, data (base64), url }
  streaming: false,
  renameFiles: [], // { file, orig, base, w, h }
};

// ---- element refs ----
const $ = (id) => document.getElementById(id);
const venueGrid = $("venueGrid");
const postTypeSel = $("postType");
const occasionEl = $("occasion");
const stage2Block = $("stage2Block");
const dropzone = $("dropzone");
const fileInput = $("fileInput");
const thumbs = $("thumbs");
const refNotesEl = $("refNotes");
const generateBtn = $("generateBtn");
const builderHint = $("builderHint");
const resultEl = $("result");
const outputTitle = $("outputTitle");
const copyBtn = $("copyBtn");
const csvBtn = $("csvBtn");
const capBtn = $("capBtn");
const svgBtn = $("svgBtn");
const dlAllBtn = $("dlAllBtn");
const briefFields = $("briefFields");
const planBlock = $("planBlock");
const planMonthEl = $("planMonth");
const planCountEl = $("planCount");
const planNotesEl = $("planNotes");
const renameBlock = $("renameBlock");
const renamePrefix = $("renamePrefix");
const renameStart = $("renameStart");
const renameDrop = $("renameDrop");
const renameInput = $("renameInput");
const sketchToggle = $("sketchToggle");
const sketchRatio = $("sketchRatio");

const SKETCH_SIZES = {
  feed: { label: "4:5 feed", w: 1080, h: 1350 },
  square: { label: "1:1 square", w: 1080, h: 1080 },
  story: { label: "9:16 story", w: 1080, h: 1920 },
};

sketchToggle.addEventListener("change", () => {
  sketchRatio.classList.toggle("hidden", !sketchToggle.checked);
});

// ---- init: venues + post types ----
function renderVenues() {
  venueGrid.innerHTML = "";
  Object.entries(VENUES).forEach(([key, v]) => {
    const btn = document.createElement("button");
    btn.className = "venue-card" + (key === state.venue ? " active" : "");
    btn.style.setProperty("--vac", v.accent);
    btn.innerHTML = `<div class="vc-name">${v.name}</div><div class="vc-meta">${v.city} · ${v.kind}</div>`;
    btn.addEventListener("click", () => {
      state.venue = key;
      renderVenues();
    });
    venueGrid.appendChild(btn);
  });
}

POST_TYPES.forEach((t) => {
  const opt = document.createElement("option");
  opt.value = t;
  opt.textContent = t;
  postTypeSel.appendChild(opt);
});

renderVenues();

// ---- stage toggle ----
document.querySelectorAll(".stage-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".stage-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    state.mode = tab.dataset.mode;
    const m = state.mode;
    stage2Block.classList.toggle("hidden", m !== "stage2");
    planBlock.classList.toggle("hidden", m !== "plan");
    renameBlock.classList.toggle("hidden", m !== "rename");
    briefFields.classList.toggle("hidden", m === "plan" || m === "rename");
    generateBtn.classList.toggle("hidden", m === "rename");
    generateBtn.textContent =
      m === "stage1" ? "Generate concepts" : m === "stage2" ? "Build brief" : "Plan the month";
    if (m === "rename") {
      if (!renamePrefix.value) renamePrefix.value = VENUES[state.venue]?.name || "";
      renderRenamePreview();
    } else {
      dlAllBtn.classList.add("hidden");
    }
  });
});

// ---- image handling (Stage 2) ----
function addFiles(files) {
  [...files].forEach((file) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(",")[1];
      const id = crypto.randomUUID();
      state.images.push({ id, media_type: file.type, data: base64, url: dataUrl });
      renderThumbs();
    };
    reader.readAsDataURL(file);
  });
}

function renderThumbs() {
  thumbs.innerHTML = "";
  state.images.forEach((img) => {
    const div = document.createElement("div");
    div.className = "thumb";
    div.innerHTML = `<img src="${img.url}" alt="reference" /><button title="Remove">×</button>`;
    div.querySelector("button").addEventListener("click", () => {
      state.images = state.images.filter((i) => i.id !== img.id);
      renderThumbs();
    });
    thumbs.appendChild(div);
  });
}

dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => addFiles(e.target.files));
["dragover", "dragenter"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  })
);
dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
// paste image anywhere when in stage 2
window.addEventListener("paste", (e) => {
  if (state.mode !== "stage2") return;
  const items = e.clipboardData?.items || [];
  const files = [...items].filter((i) => i.kind === "file").map((i) => i.getAsFile());
  if (files.length) addFiles(files);
});

// ---- rename files (month-end export naming) ----
renameDrop.addEventListener("click", () => renameInput.click());
renameInput.addEventListener("change", (e) => addRenameFiles(e.target.files));
["dragover", "dragenter"].forEach((ev) =>
  renameDrop.addEventListener(ev, (e) => {
    e.preventDefault();
    renameDrop.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  renameDrop.addEventListener(ev, (e) => {
    e.preventDefault();
    renameDrop.classList.remove("drag");
  })
);
renameDrop.addEventListener("drop", (e) => addRenameFiles(e.dataTransfer.files));
renamePrefix.addEventListener("input", renderRenamePreview);
renameStart.addEventListener("input", renderRenamePreview);

// Strip extension and any trailing size token so the 3 sizes of one post share a base.
function baseName(filename) {
  let n = filename.replace(/\.[^.]+$/, "");
  n = n.replace(/[ _\-]*\(?\s*\d{3,4}\s*[x×]\s*\d{3,4}\s*\)?\s*$/i, "");
  n = n.replace(/[ _\-]+$/, "").trim();
  return n || filename;
}

function readSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ w: 0, h: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function addRenameFiles(files) {
  const imgs = [...files].filter((f) => f.type.startsWith("image/"));
  for (const file of imgs) {
    const { w, h } = await readSize(file);
    state.renameFiles.push({ file, orig: file.name, base: baseName(file.name), w, h });
  }
  renderRenamePreview();
}

// Compute the new name for each file, grouping shared base names into post numbers.
function computeRenames() {
  const prefix = (renamePrefix.value || VENUES[state.venue]?.name || "Post").trim();
  const start = parseInt(renameStart.value, 10) || 1;
  const groupIndex = {};
  let next = 0;
  return state.renameFiles.map((f) => {
    if (!(f.base in groupIndex)) groupIndex[f.base] = next++;
    const num = String(start + groupIndex[f.base]).padStart(2, "0");
    const ext = (f.orig.match(/\.[^.]+$/) || [".png"])[0];
    const newName = `${prefix}_Post_${num} (${f.w}x${f.h})${ext}`;
    return { ...f, newName };
  });
}

function renderRenamePreview() {
  if (state.mode !== "rename") return;
  outputTitle.textContent = "Renamed files";
  copyBtn.classList.add("hidden");
  csvBtn.classList.add("hidden");
  capBtn.classList.add("hidden");
  svgBtn.classList.add("hidden");

  if (!state.renameFiles.length) {
    dlAllBtn.classList.add("hidden");
    resultEl.innerHTML =
      '<div class="empty-state"><div class="empty-mark">⤓</div><p>Drop your exported posts on the left. I\'ll detect each size and rename them to your convention, then you download them all.</p></div>';
    return;
  }

  const rows = computeRenames();
  let html = '<div class="doc"><div class="table-wrap"><table><thead><tr>';
  html += "<th>Original</th><th>Size</th><th>New name</th></tr></thead><tbody>";
  rows.forEach((r) => {
    html += `<tr><td>${escapeHtml(r.orig)}</td><td>${r.w}×${r.h}</td><td>${escapeHtml(
      r.newName
    )}</td></tr>`;
  });
  html += "</tbody></table></div>";
  html +=
    '<button id="clearRename" class="ghost-btn small" style="margin-top:14px">Clear files</button></div>';
  resultEl.innerHTML = html;
  $("clearRename").addEventListener("click", () => {
    state.renameFiles = [];
    renderRenamePreview();
  });
  dlAllBtn.classList.remove("hidden");
}

// Download each file under its new name, one after another.
dlAllBtn.addEventListener("click", async () => {
  const rows = computeRenames();
  dlAllBtn.disabled = true;
  dlAllBtn.textContent = "Downloading…";
  for (const r of rows) {
    const url = URL.createObjectURL(r.file);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.newName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    await new Promise((res) => setTimeout(res, 300));
  }
  dlAllBtn.disabled = false;
  dlAllBtn.textContent = "Download all renamed";
});

// ---- settings ----
const settingsModal = $("settingsModal");
const apiKeyEl = $("apiKey");
const modelEl = $("model");

$("settingsBtn").addEventListener("click", openSettings);
$("closeSettings").addEventListener("click", () => settingsModal.classList.add("hidden"));
$("saveSettings").addEventListener("click", () => {
  localStorage.setItem(LS_KEY, apiKeyEl.value.trim());
  localStorage.setItem(LS_MODEL, modelEl.value);
  settingsModal.classList.add("hidden");
  builderHint.textContent = "";
});

function openSettings() {
  apiKeyEl.value = localStorage.getItem(LS_KEY) || "";
  modelEl.value = localStorage.getItem(LS_MODEL) || "claude-opus-4-8";
  settingsModal.classList.remove("hidden");
}

// ---- generate ----
generateBtn.addEventListener("click", generate);

async function generate() {
  if (state.streaming) return;
  const apiKey = localStorage.getItem(LS_KEY);
  if (!apiKey) {
    builderHint.textContent = "Add your Anthropic API key in Settings first.";
    openSettings();
    return;
  }
  if (state.mode === "stage2" && state.images.length === 0 && !refNotesEl.value.trim()) {
    builderHint.textContent = "Add at least one reference image or some notes.";
    return;
  }
  if (state.mode === "plan" && !planMonthEl.value) {
    builderHint.textContent = "Pick a month first.";
    return;
  }

  const model = localStorage.getItem(LS_MODEL) || "claude-opus-4-8";
  const userText =
    state.mode === "plan"
      ? buildUserMessage(
          "plan",
          state.venue,
          "",
          planNotesEl.value,
          "",
          formatMonth(planMonthEl.value),
          planCountEl.value || 15
        )
      : buildUserMessage(
          state.mode,
          state.venue,
          postTypeSel.value,
          occasionEl.value,
          refNotesEl.value,
          null,
          null,
          sketchToggle.checked ? SKETCH_SIZES[sketchRatio.value] : null
        );

  // Build the message content (images first, then text — vision best practice).
  let content;
  if (state.mode === "stage2" && state.images.length > 0) {
    content = [
      ...state.images.map((img) => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      })),
      { type: "text", text: userText },
    ];
  } else {
    content = userText;
  }

  const body = {
    model,
    max_tokens: state.mode === "plan" ? 16000 : 8000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    stream: true,
    messages: [{ role: "user", content }],
  };

  startStreamingUI();

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        msg = JSON.parse(errText).error?.message || errText;
      } catch (_) {}
      throw new Error(`${res.status} — ${msg}`);
    }

    await consumeStream(res);
  } catch (err) {
    showError(err.message);
  } finally {
    endStreamingUI();
  }
}

let rawOutput = "";

function startStreamingUI() {
  state.streaming = true;
  rawOutput = "";
  generateBtn.disabled = true;
  builderHint.textContent = "";
  copyBtn.classList.add("hidden");
  csvBtn.classList.add("hidden");
  capBtn.classList.add("hidden");
  svgBtn.classList.add("hidden");
  dlAllBtn.classList.add("hidden");
  outputTitle.textContent =
    state.mode === "stage1"
      ? "Directions"
      : state.mode === "stage2"
      ? "Designer brief"
      : "Monthly plan";
  resultEl.innerHTML =
    '<div class="thinking"><span class="spinner"></span> ' +
    (state.mode === "plan" ? "Planning the month…" : "Crafting concepts…") +
    "</div>";
}

function endStreamingUI() {
  state.streaming = false;
  generateBtn.disabled = false;
  if (rawOutput.trim()) {
    resultEl.innerHTML = `<div class="doc">${renderMarkdown(rawOutput)}</div>`;
    copyBtn.classList.remove("hidden");
    csvBtn.classList.toggle("hidden", state.mode !== "plan");
    capBtn.classList.toggle("hidden", state.mode !== "plan");
    svgBtn.classList.toggle("hidden", !extractSvg(rawOutput));
  }
}

// Parse the plan table into ordered rows of cells (header dropped).
function planRows() {
  const rows = rawOutput
    .split("\n")
    .filter((l) => /^\s*\|.*\|\s*$/.test(l))
    .filter((l) => !/^\s*\|?[\s:-]*\|[\s:|-]*$/.test(l))
    .map(splitRow);
  return rows.slice(1); // drop header
}

// ---- copy captions, ordered, for the monthly Google Doc ----
capBtn.addEventListener("click", async () => {
  const start = 1;
  const blocks = planRows().map((c, i) => {
    const num = String(start + i).padStart(2, "0");
    const [date, type, , enCap, arCap, enTags, arTags] = c;
    const lines = [`Post ${num} — ${type || ""}${date ? ` (${date})` : ""}`.trim()];
    if (enCap) lines.push(enCap);
    if (arCap) lines.push(arCap);
    if (enTags) lines.push(enTags);
    if (arTags) lines.push(arTags);
    return lines.join("\n");
  });
  const text = blocks.join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    capBtn.textContent = "Copied ✓";
    setTimeout(() => (capBtn.textContent = "Copy captions"), 1500);
  } catch (_) {}
});

// Parse the SSE stream and append text deltas as they arrive.
async function consumeStream(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstText = true;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep the partial line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(payload);
      } catch (_) {
        continue;
      }
      if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
        if (firstText) {
          resultEl.innerHTML = '<div class="doc caret"></div>';
          firstText = false;
        }
        rawOutput += evt.delta.text;
        const docEl = resultEl.querySelector(".doc");
        docEl.innerHTML = renderMarkdown(rawOutput);
        resultEl.scrollTop = resultEl.scrollHeight;
      } else if (evt.type === "error") {
        throw new Error(evt.error?.message || "Stream error");
      }
    }
  }
}

function showError(message) {
  let friendly = message;
  if (/401|authentication/i.test(message)) {
    friendly = "Your API key was rejected. Check it in Settings.";
  } else if (/failed to fetch|networkerror/i.test(message)) {
    friendly =
      "Couldn't reach Anthropic. Check your connection. (If this persists, your network may block the API.)";
  }
  resultEl.innerHTML = `<div class="error-box"><strong>Something went wrong.</strong><br />${escapeHtml(
    friendly
  )}</div>`;
}

// ---- copy ----
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(rawOutput);
    copyBtn.textContent = "Copied ✓";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  } catch (_) {}
});

// ---- CSV export (monthly plan) ----
csvBtn.addEventListener("click", () => {
  const rows = rawOutput
    .split("\n")
    .filter((l) => /^\s*\|.*\|\s*$/.test(l))
    .filter((l) => !/^\s*\|?[\s:-]*\|[\s:|-]*$/.test(l));
  if (!rows.length) return;
  const csv = rows
    .map((r) => splitRow(r).map(csvCell).join(","))
    .join("\r\n");
  // BOM so Excel reads Arabic (UTF-8) correctly.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const venueName = (VENUES[state.venue]?.name || "plan").replace(/\s+/g, "-").toLowerCase();
  a.href = url;
  a.download = `${venueName}-${planMonthEl.value || "plan"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

// ---- SVG sketch download ----
svgBtn.addEventListener("click", () => {
  const svg = extractSvg(rawOutput);
  if (!svg) return;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const venueName = (VENUES[state.venue]?.name || "sketch").replace(/\s+/g, "-").toLowerCase();
  a.href = url;
  a.download = `${venueName}-sketch.svg`;
  a.click();
  URL.revokeObjectURL(url);
});

function csvCell(s) {
  const clean = (s || "").replace(/\*\*/g, "");
  return `"${clean.replace(/"/g, '""')}"`;
}

// "2026-03" -> "March 2026"
function formatMonth(value) {
  if (!value) return "";
  const [y, m] = value.split("-");
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${names[Number(m) - 1] || ""} ${y}`.trim();
}

// ---- tiny markdown renderer (headings, bold, lists, hr, RTL-aware) ----
function renderMarkdown(md) {
  const lines = md.split("\n");
  let html = "";
  let inList = false;
  let tableRows = [];
  let inCode = false;
  let codeLang = "";
  let codeBuf = [];
  const closeList = () => {
    if (inList) {
      html += "</ul>";
      inList = false;
    }
  };
  const closeTable = () => {
    if (tableRows.length) {
      html += renderTable(tableRows);
      tableRows = [];
    }
  };

  for (let raw of lines) {
    // Fenced code blocks (```svg ... ```) — render SVG sketches inline.
    const fence = raw.trim().match(/^```(\w*)/);
    if (fence) {
      if (!inCode) {
        closeList();
        closeTable();
        inCode = true;
        codeLang = fence[1].toLowerCase();
        codeBuf = [];
      } else {
        html += renderCode(codeLang, codeBuf.join("\n"), false);
        inCode = false;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }
    const line = raw.replace(/\s+$/, "");
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      tableRows.push(line);
      continue;
    }
    closeTable();
    if (/^###\s+/.test(line)) {
      closeList();
      html += `<h3>${inline(line.replace(/^###\s+/, ""))}</h3>`;
    } else if (/^##\s+/.test(line)) {
      closeList();
      html += `<h3>${inline(line.replace(/^##\s+/, ""))}</h3>`;
    } else if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      closeList();
      html += "<hr />";
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li ${dirAttr(line)}>${inline(line.replace(/^[-*]\s+/, ""))}</li>`;
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html += `<p ${dirAttr(line)}>${inline(line)}</p>`;
    }
  }
  closeList();
  closeTable();
  if (inCode) html += renderCode(codeLang, codeBuf.join("\n"), true); // still streaming
  return html;
}

// Render a fenced code block. SVG is drawn inline; anything still streaming
// shows a placeholder so we never inject a half-written tag.
function renderCode(lang, code, streaming) {
  if (lang === "svg") {
    if (streaming) {
      return '<div class="sketch-loading"><span class="spinner"></span> Drawing layout sketch…</div>';
    }
    return `<figure class="sketch">${code}</figure>`;
  }
  return `<pre class="code">${escapeHtml(code)}</pre>`;
}

// Pull the first complete SVG out of the raw output (for download).
function extractSvg(text) {
  const m = text.match(/<svg[\s\S]*?<\/svg>/i);
  return m ? m[0] : "";
}

// Split a "| a | b |" markdown row into trimmed cell strings.
function splitRow(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

// Render collected pipe-table rows into a scrollable HTML table.
function renderTable(rows) {
  // Drop the separator row (|---|---|).
  const body = rows.filter((r) => !/^\s*\|?[\s:-]*\|[\s:|-]*$/.test(r));
  if (!body.length) return "";
  const header = splitRow(body[0]);
  let out = '<div class="table-wrap"><table><thead><tr>';
  header.forEach((h) => (out += `<th>${inline(h)}</th>`));
  out += "</tr></thead><tbody>";
  body.slice(1).forEach((r) => {
    const cells = splitRow(r);
    out += "<tr>";
    cells.forEach((c) => (out += `<td ${dirAttr(c)}>${inline(c)}</td>`));
    out += "</tr>";
  });
  out += "</tbody></table></div>";
  return out;
}

function inline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

// Set dir="auto" so Arabic lines render right-to-left automatically.
function dirAttr(line) {
  return /[؀-ۿ]/.test(line) ? 'dir="auto" class="ar"' : 'dir="auto"';
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// First-run nudge
if (!localStorage.getItem(LS_KEY)) {
  builderHint.textContent = "Tip: add your Anthropic API key in Settings to get started.";
}
