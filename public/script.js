function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const tabEl = document.getElementById(tab);
  if (tabEl) {
    if (tab === "pdf-viewer-tab") tabEl.style.display = "flex";
    else if (tab === "dashboard") tabEl.style.display = "grid";
    else tabEl.style.display = "block";
  }
}

function formatText(cmd, value = null) {
  document.execCommand(cmd, false, value);
}

function setHeading(tag) {
  document.execCommand('formatBlock', false, tag);
}

// Default open
showTab("dashboard");

let currentFile = "";
const preview = document.getElementById("preview");

// Upload file
async function uploadFile(event) {
  try {
    const file = event.target.files[0];
    if (!file) {
      alert("Please select a file");
      return;
    }
    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/upload", {
      method: "POST",
      body: formData
    });

    const data = await res.json();
    currentFile = data.file;

    loadFile();
    loadFiles(); // 👈 ADD THIS
  } catch (err) {
    alert("Upload failed!");
    console.error(err);
  }
}

// Load file content
async function loadFile() {
  if (!currentFile) return;

  try {
    if (!currentFile.trim()) return;

    const res = await fetch(`/read/${currentFile}`);
    if (!res.ok) throw new Error("Failed to load file");

    const data = await res.json();

    if (data.type === "text") {
      preview.innerText = data.content; // Plain text uses innerText
      showTab("editor");
    }
    else if (data.type === "docx") {
      preview.innerHTML = data.content; // DOCX uses innerHTML
      showTab("editor");
    }
    else if (data.type === "image") {
      preview.innerHTML =
        `<img src="${data.content}" style="max-width:100%">`;
      showTab("editor");
    }
    else if (data.type === "pdf") {
      loadPDFInViewer(data.content, currentFile);
      showTab("pdf-viewer-tab");
    }
    else if (data.type === "excel") {
      let tableHtml = "<table>";
      data.content.forEach((row, index) => {
        tableHtml += "<tr>";
        row.forEach(cell => {
          if (index === 0) {
            tableHtml += `<th>${cell || ''}</th>`;
          } else {
            tableHtml += `<td>${cell || ''}</td>`;
          }
        });
        tableHtml += "</tr>";
      });
      tableHtml += "</table>";
      preview.innerHTML = tableHtml;
      showTab("editor");
    }
    else {
      preview.innerText = "Preview not supported for this file type.";
      showTab("editor");
    }
  } catch (err) {
    alert("Error loading file");
    console.error(err);
  }
}

// Apply AI output to editor
function applyToEditor() {
  preview.innerHTML =
    document.getElementById("output").innerHTML;
}

// Use current editor/preview text as AI input
function useEditorText() {
  document.getElementById("input").value =
    preview.innerText;
}

// Toggle dark mode
function toggleDarkMode() {
  document.body.classList.toggle("dark");
}

// AI function
async function runAI() {
  const output = document.getElementById("output");
  output.innerText = "Processing... ⏳";

  const text =
    document.getElementById("input").value ||
    preview.innerHTML;

  if (!text.trim()) {
    output.innerText = "Enter text first or load a file!";
    return;
  }
  const action = document.getElementById("action").value;

  try {
    const res = await fetch("/ai-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, action })
    });

    if (!res.ok) {
      output.innerText = "AI failed!";
      return;
    }

    const result = await res.text();
    output.innerText = result;
  } catch (err) {
    output.innerText = "Error connecting to AI!";
    console.error("AI Error:", err);
  }
}

async function saveFile() {
  if (!currentFile) {
    alert("No file loaded!");
    return;
  }

  const ext = currentFile.split('.').pop().toLowerCase();
  // Use innerHTML for rich text formats, innerText for plain text to prevent saving HTML tags
  const content = (ext === "docx") ? preview.innerHTML : preview.innerText;

  const res = await fetch("/save", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      filename: currentFile,
      content: content
    })
  });

  if (res.ok) {
    alert("Saved successfully!");
  } else {
    alert("Save failed!");
  }
}

// Load all files
async function loadFiles() {
  try {
    const res = await fetch("/files");
    const files = await res.json();

    const list = document.getElementById("fileList");
    list.innerHTML = "";

    if (files.length === 0) {
      list.innerHTML = "<li><div class='file-card' style='justify-content: center; color: #747d8c;'>No files found</div></li>";
      return;
    }

    files.forEach(file => {
      let icon = "📄";
      const ext = file.name.split('.').pop().toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) icon = "🖼";
      else if (['xls', 'xlsx', 'csv'].includes(ext)) icon = "📊";

      const li = document.createElement("li");
      if (file.name === currentFile) {
        li.classList.add("active");
      }

      li.innerHTML = `
        <div class="file-card">
          <div class="file-meta">
            <span class="file-icon">${icon}</span>
            <div>
              <div class="file-name">${file.name}</div>
              <div class="file-size">${(file.size / 1024).toFixed(2)} KB</div>
            </div>
          </div>
          <div class="actions">
            <button onclick="openFile('${file.name}')">Open</button>
            <button onclick="deleteFile('${file.name}')">Delete</button>
            <button onclick="downloadFile('${file.name}')">Download</button>
          </div>
        </div>
      `;

      list.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading files", err);
  }
}

// Open file
function openFile(name) {
  currentFile = name;
  loadFile();

  document.querySelectorAll("#fileList li").forEach(li => {
    li.classList.remove("active");
  });

  if (window.event) {
    window.event.target.closest("li").classList.add("active");
  }
}

// Delete file
async function deleteFile(name) {
  const res = await fetch(`/delete/${name}`, { method: "DELETE" });

  if (res.ok) {
    alert("File deleted!");
    loadFiles();
  } else {
    alert("Delete failed!");
  }
}

// Download file
function downloadFile(name) {
  window.open(`/download/${name}`);
}

// Load file list on page load
loadFiles();

/* ── PDF Viewer State ──────────────────────────────────────────── */
let currentZoom = 100;
let sidebarOpen = true;
const ZOOM_STEPS = [50, 75, 100, 125, 150, 200];
const DUMMY_PAGES = 8; // placeholder thumbnails count

document.addEventListener('DOMContentLoaded', () => {
  buildThumbnails(DUMMY_PAGES);
});

/* ── Tab switching ─────────────────────────────────────────────── */
function setTab(el, name) {
  document.querySelectorAll('.tb-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

/* ── Sidebar toggle ────────────────────────────────────────────── */
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById('pdf-sidebar').classList.toggle('collapsed', !sidebarOpen);
}

/* ── Open PDF ──────────────────────────────────────────────────── */
function openPDF() {
  // Triggers the main file manager upload since we share it
  document.querySelector('#editor input[type="file"]').click();
}

function loadPDFInViewer(src, name) {
  const iframe = document.getElementById('pdf-iframe');
  const wrapper = document.getElementById('pdf-page-wrapper');
  const empty = document.getElementById('pdf-empty-state');

  iframe.src = src;
  wrapper.style.display = 'block';
  empty.style.display = 'none';

  const label = name || src.split('/').pop() || 'Document.pdf';
  document.getElementById('filename-text').textContent = label;
  document.getElementById('status-filename').textContent = label;
  document.getElementById('totalPages').textContent = '—'; // update when PDF.js integrated
  buildThumbnails(DUMMY_PAGES);
}

/* ── Print ─────────────────────────────────────────────────────── */
function printPDF() {
  const iframe = document.getElementById('pdf-iframe');
  if (!iframe.src || iframe.src === window.location.href) {
    alert('Please open a PDF file first.');
    return;
  }
  try {
    iframe.contentWindow.print();
  } catch {
    window.print();
  }
}

/* ── Zoom ──────────────────────────────────────────────────────── */
function setZoom(val) {
  currentZoom = parseInt(val, 10);
  applyZoom();
}

function adjustZoom(delta) {
  const idx = ZOOM_STEPS.indexOf(currentZoom);
  if (delta > 0 && idx < ZOOM_STEPS.length - 1) currentZoom = ZOOM_STEPS[idx + 1];
  else if (delta < 0 && idx > 0) currentZoom = ZOOM_STEPS[idx - 1];
  document.getElementById('zoomSel').value = currentZoom;
  applyZoom();
}

function applyZoom() {
  const wrapper = document.getElementById('pdf-page-wrapper');
  wrapper.style.transform = `scale(${currentZoom / 100})`;
  wrapper.style.transformOrigin = 'top center';
  document.getElementById('status-zoom').textContent = currentZoom + '%';
}

/* ── Export PDF ────────────────────────────────────────────────── */
function exportPDF() {
  const iframe = document.getElementById('pdf-iframe');
  if (!iframe.src || iframe.src === window.location.href) {
    alert('Please open a PDF file first.');
    return;
  }
  const a = document.createElement('a');
  a.href = iframe.src;
  a.download = document.getElementById('filename-text').textContent || 'document.pdf';
  a.click();
}

/* ── Thumbnail builder ─────────────────────────────────────────── */
function buildThumbnails(count) {
  const list = document.getElementById('sidebar-pages-list');
  if (!list) return;
  list.innerHTML = '';
  for (let i = 1; i <= count; i++) {
    const div = document.createElement('div');
    div.className = 'page-thumb' + (i === 1 ? ' active' : '');
    div.onclick = () => selectPage(div, i);
    div.innerHTML = `
      <div class="thumb-img">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <span class="thumb-num">${i}</span>
    `;
    list.appendChild(div);
  }
}

function selectPage(el, num) {
  document.querySelectorAll('.page-thumb').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const pageInput = document.getElementById('pageInput');
  if (pageInput) pageInput.value = num;
}



/* ── Greeting ────────────────────────────── */
(function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const el = document.getElementById('greeting-text');
  if (el) el.textContent = `Good ${g}, Admin 👋`;
})();

/* ── Sidebar Nav ─────────────────────────── */
function setNav(el, id) {
  if (el.classList.contains('disabled')) return;
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  el.classList.add('active');
}

/* ── Dark Mode ───────────────────────────── */
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
}

/* ── Navigation hooks ────────────────────── */
// We use showTab() directly in HTML, these are backups.

/* ── Load Files ── */
async function loadRecentFiles() {
  const container = document.getElementById('files-container');
  const countEl = document.getElementById('files-count');
  if (!container) return;

  try {
    const res = await fetch('/files');
    let files = [];
    if (res.ok) files = await res.json();

    if (!files || files.length === 0) {
      renderEmpty(container, countEl);
      return;
    }

    countEl.textContent = `${files.length} file${files.length !== 1 ? 's' : ''}`;
    container.innerHTML = buildTable(files);

  } catch (e) {
    console.error(e);
    renderEmpty(container, countEl);
  }
}

function getFileType(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'xlsx';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'img';
  return 'txt';
}

function fileTypeLabel(t) {
  return { pdf: 'PDF', docx: 'DOC', xlsx: 'XLS', img: 'IMG', txt: 'TXT' }[t] || 'FILE';
}

function buildTable(files) {
  const rows = files.map((f, i) => {
    // our backend returns { name: "...", size: 1234 }
    const t = getFileType(f.name);
    const mod = f.modified || f.lastModified || f.updatedAt || '—';
    const name = f.name || f.filename || 'Untitled';
    return `
    <tr>
      <td>
        <div class="file-name-cell">
          <div class="file-type-icon ${t}">${fileTypeLabel(t)}</div>
          <span class="file-name-text">${escHtml(name)}</span>
        </div>
      </td>
      <td class="file-date">${fileTypeLabel(t)}</td>
      <td class="file-date">${escHtml(String(mod))}</td>
      <td>
        <div class="file-actions">
          <button class="action-btn" title="Open" onclick="handleOpen('${name}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="action-btn" title="Download" onclick="handleDownload('${name}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="action-btn danger" title="Delete" onclick="handleDelete('${name}', this)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
  <table class="files-table">
    <thead>
      <tr>
        <th>File Name</th>
        <th>Type</th>
        <th>Last Modified</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderEmpty(container, countEl) {
  countEl.textContent = '0 files';
  container.innerHTML = `
  <div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 10px; display:block;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    <p>No files yet. Upload or create a new document to get started.</p>
  </div>`;
}

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ── File actions — bridge to YOUR functions ── */
function handleOpen(name) {
  currentFile = name;
  loadFile();
}

function handleDownload(name) {
  window.location.href = "/download/" + name;
}

async function handleDelete(name, btn) {
  if (!confirm(`Delete "${name}"?`)) return;
  try {
    const res = await fetch("/delete/" + name, { method: "DELETE" });
    if (res.ok) {
      if (btn) btn.closest('tr').remove();
      loadRecentFiles();
    } else {
      alert("Delete failed");
    }
  } catch (err) {
    console.error(err);
  }
}

/* ── Upload Modal ─────────────────────────── */
let selectedFiles = null;

function showUploadModal() {
  document.getElementById('upload-modal').classList.add('active');
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.remove('active');
  resetUploadState();
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('upload-modal')) closeUploadModal();
}

function handleFileSelect(files) {
  if (!files || !files.length) return;
  selectedFiles = files;
  const names = Array.from(files).map(f => f.name).join(', ');
  document.getElementById('upload-file-names').textContent = names;
  document.getElementById('upload-file-list').style.display = 'block';
  const btn = document.getElementById('upload-submit-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
  btn.style.cursor = 'pointer';
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('upload-drop').classList.remove('dragging');
  handleFileSelect(e.dataTransfer.files);
}

async function submitUpload() {
  if (!selectedFiles) return;

  const form = new FormData();
  form.append('file', selectedFiles[0]); // our backend expects single 'file'

  try {
    const res = await fetch('/upload', { method: 'POST', body: form });
    if (res.ok) {
      closeUploadModal();
      loadRecentFiles();
    } else {
      alert('Upload failed. Please try again.');
    }
  } catch (e) {
    console.error(e);
    alert('Upload failed. Check your connection.');
  }
}

function resetUploadState() {
  selectedFiles = null;
  document.getElementById('file-input').value = '';
  document.getElementById('upload-file-list').style.display = 'none';
  document.getElementById('upload-file-names').textContent = '';
  const btn = document.getElementById('upload-submit-btn');
  btn.disabled = true;
  btn.style.opacity = '.5';
  btn.style.cursor = 'not-allowed';
}

/* ── Search ───────────────────────────────── */
function handleSearch(val) {
  const rows = document.querySelectorAll('.files-table tbody tr');
  rows.forEach(r => {
    const name = r.querySelector('.file-name-text')?.textContent?.toLowerCase() || '';
    r.style.display = name.includes(val.toLowerCase()) ? '' : 'none';
  });
}

/* ── ESC key closes modal ─────────────────── */
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUploadModal(); });

/* ── Init ─────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadRecentFiles();
});
