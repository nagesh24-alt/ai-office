const fs = require('fs');

const userJS = `
/* ── Greeting ────────────────────────────── */
(function setGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const el = document.getElementById('greeting-text');
  if(el) el.textContent = \`Good \${g}, Admin 👋\`;
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
  const countEl   = document.getElementById('files-count');
  if(!container) return;

  try {
    const res = await fetch('/files');
    let files = [];
    if (res.ok) files = await res.json();

    if (!files || files.length === 0) {
      renderEmpty(container, countEl);
      return;
    }

    countEl.textContent = \`\${files.length} file\${files.length !== 1 ? 's' : ''}\`;
    container.innerHTML = buildTable(files);

  } catch (e) {
    console.error(e);
    renderEmpty(container, countEl);
  }
}

function getFileType(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (ext === 'pdf')                    return 'pdf';
  if (['doc','docx'].includes(ext))     return 'docx';
  if (['xls','xlsx','csv'].includes(ext)) return 'xlsx';
  if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'img';
  return 'txt';
}

function fileTypeLabel(t) {
  return { pdf:'PDF', docx:'DOC', xlsx:'XLS', img:'IMG', txt:'TXT' }[t] || 'FILE';
}

function buildTable(files) {
  const rows = files.map((f, i) => {
    // our backend returns { name: "...", size: 1234 }
    const t    = getFileType(f.name);
    const mod  = f.modified || f.lastModified || f.updatedAt || '—';
    const name = f.name || f.filename || 'Untitled';
    return \`
    <tr>
      <td>
        <div class="file-name-cell">
          <div class="file-type-icon \${t}">\${fileTypeLabel(t)}</div>
          <span class="file-name-text">\${escHtml(name)}</span>
        </div>
      </td>
      <td class="file-date">\${fileTypeLabel(t)}</td>
      <td class="file-date">\${escHtml(String(mod))}</td>
      <td>
        <div class="file-actions">
          <button class="action-btn" title="Open" onclick="handleOpen('\${name}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="action-btn" title="Download" onclick="handleDownload('\${name}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="action-btn danger" title="Delete" onclick="handleDelete('\${name}', this)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    </tr>\`;
  }).join('');

  return \`
  <table class="files-table">
    <thead>
      <tr>
        <th>File Name</th>
        <th>Type</th>
        <th>Last Modified</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>\${rows}</tbody>
  </table>\`;
}

function renderEmpty(container, countEl) {
  countEl.textContent = '0 files';
  container.innerHTML = \`
  <div class="empty-state">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin:0 auto 10px; display:block;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
    <p>No files yet. Upload or create a new document to get started.</p>
  </div>\`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  if (!confirm(\`Delete "\${name}"?\`)) return;
  try {
    const res = await fetch("/delete/" + name, { method: "DELETE" });
    if (res.ok) {
      if(btn) btn.closest('tr').remove();
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
`;

let oldJs = fs.readFileSync('public/script.js', 'utf8');

// We want to delete old loadFiles, uploadFile, deleteFile, downloadFile, openFile
// And append the new userJS

oldJs = oldJs.replace(/async function uploadFile\(event\) {[\s\S]*?loadFiles\(\);\s*}\s*catch\s*\(err\)\s*{[\s\S]*?}\n}/, '');
oldJs = oldJs.replace(/async function loadFiles\(\) {[\s\S]*?}\s*}\n/, '');
oldJs = oldJs.replace(/function openFile\(name\) {[\s\S]*?}\n/, '');
oldJs = oldJs.replace(/async function deleteFile\(name\) {[\s\S]*?}\n/, '');
oldJs = oldJs.replace(/function downloadFile\(name\) {[\s\S]*?}\n/, '');

// Actually, to be safe, I will just do:
oldJs += "\n\n" + userJS;
fs.writeFileSync('public/script.js', oldJs);
console.log("Merged JS");
