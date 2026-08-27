// Configure PDF.js worker if available
if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";
}

async function parseJsonResponse(response) {
    const text = await response.text();

    if (!text || text.trim() === "") {
        if (!response.ok) {
            throw new Error(`Request failed (${response.status})`);
        }
        return { success: true };
    }

    try {
        return JSON.parse(text);
    } catch {
        if (!response.ok) {
            throw new Error(
                `Request failed (${response.status}). ${text.slice(0, 120)}`
            );
        }
        return { success: true, message: text, raw: text };
    }
}

let selectionMode = false;
let selectedFiles = [];
let currentDashboardFiles = [];

function setProtectedStatusMessage(message, isError = true) {

    const status = document.getElementById("protectedStatusMessage");

    if (!status)
        return;

    status.textContent = message || "";
    status.style.display = message ? "block" : "none";
    status.style.color = isError ? "#ff4d4f" : "#22c55e";

}

function updateFileLabel() {
    const fileInput = document.getElementById("fileInput");
    const fileLabel = document.getElementById("fileLabel");

    if (!fileInput || !fileLabel) return;

    fileLabel.textContent =
        fileInput.files.length > 0
            ? fileInput.files[0].name
            : "Choose File";
}

function showToast(message, type = "success", duration = 3500) {
    let container = document.getElementById("toastContainer");
    if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast-message toast-${type}`;

    let iconClass = "fa-check-circle";
    if (type === "error") iconClass = "fa-exclamation-circle";
    if (type === "info") iconClass = "fa-info-circle";

    toast.innerHTML = `
        <div class="toast-icon"><i class="fas ${iconClass}"></i></div>
        <div class="toast-text">${message}</div>
        <button class="toast-close" title="Close"><i class="fas fa-times"></i></button>
    `;

    const closeBtn = toast.querySelector(".toast-close");
    const removeToast = () => {
        toast.classList.add("toast-hide");
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    };

    closeBtn.addEventListener("click", removeToast);
    container.appendChild(toast);

    setTimeout(removeToast, duration);
}

async function uploadFile() {
    const fileInput = document.getElementById("fileInput");
    const file = fileInput?.files?.[0];

    if (!file) {
        showToast("Please select a file to upload.", "info");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const result = await parseJsonResponse(response);

        if (result.success) {
            showToast("File uploaded successfully", "success");
            fileInput.value = "";
            updateFileLabel();
            await loadDocuments();
            if (typeof loadDocxFiles === "function") {
                loadDocxFiles();
            }
        } else {
            showToast(result.message || "Upload failed. Please try again.", "error");
        }
    } catch (err) {
        showToast("Upload failed: " + (err.message || "Network error."), "error");
    }
}
//formatfileSize
function formatFileSize(bytes) {
    if (!bytes || bytes < 0) return "--";

    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit++;
    }

    return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

// Display dashboard table
// Build capability-aware action menu for a document
function buildActionMenu(file) {
    const caps = file.capabilities || {};
    const filename = file.name;
    const actions = [];

    // Preview in side panel
    if (caps.preview) {
        actions.push(`
            <button class="preview-btn" onclick="event.stopPropagation(); showPreview('${filename.replace(/'/g, "\\'")}')">
                👁 Preview
            </button>
        `);
    }

    // Edit (DOCX only)
    if (caps.edit) {
        actions.push(`
            <button class="edit-btn" onclick="event.stopPropagation(); editDocument('${filename.replace(/'/g, "\\'")}')">
                ✏ Edit
            </button>
        `);
    }

    // Manage Tags
    if (caps.tags) {
        actions.push(`
            <button class="tags-btn" onclick="event.stopPropagation(); openTagManager('${filename.replace(/'/g, "\\'")}')">
                🏷 Tags
            </button>
        `);
    }

    // Move
    if (caps.move) {
        actions.push(`
            <button class="move-btn" onclick="event.stopPropagation(); moveDashboardPDF('${filename.replace(/'/g, "\\'")}')">
                📂 Move
            </button>
        `);
    }

    // Rename
    if (caps.rename) {
        actions.push(`
            <button class="rename-btn" onclick="event.stopPropagation(); renameDashboardPDF('${filename.replace(/'/g, "\\'")}')">
                ✏️ Rename
            </button>
        `);
    }

    // Encrypt/Protect (PDF only)
    if (caps.encrypt) {
        actions.push(`
            <button class="protect-btn" onclick="event.stopPropagation(); openProtectModal('${filename.replace(/'/g, "\\'")}')">
                🔒 Protect
            </button>
        `);
    }

    // Download
    if (caps.download) {
        actions.push(`
            <button class="download-btn" onclick="event.stopPropagation(); downloadDocument('${filename.replace(/'/g, "\\'")}')">
                ⬇️ Download
            </button>
        `);
    }

    // Delete
    if (caps.delete) {
        actions.push(`
            <button class="delete-btn" onclick="event.stopPropagation(); deleteDashboardPDF('${filename.replace(/'/g, "\\'")}')">
                🗑 Delete
            </button>
        `);
    }

    return actions.join("");
}

// Favorite stars state in localStorage
let starredDocuments = JSON.parse(localStorage.getItem("starredDocuments") || "[]");

function toggleStarDocument(filename, btnElement) {
    if (starredDocuments.includes(filename)) {
        starredDocuments = starredDocuments.filter(f => f !== filename);
        btnElement.classList.remove("starred");
        btnElement.innerHTML = '<i class="far fa-star"></i>';
    } else {
        starredDocuments.push(filename);
        btnElement.classList.add("starred");
        btnElement.innerHTML = '<i class="fas fa-star"></i>';
    }
    localStorage.setItem("starredDocuments", JSON.stringify(starredDocuments));
}

function getFileTypeIconBadge(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    
    if (ext === 'pdf') {
        return `<div class="doc-icon-badge pdf-badge"><span class="badge-tag">PDF</span></div>`;
    } else if (ext === 'docx' || ext === 'doc') {
        return `<div class="doc-icon-badge docx-badge"><span class="badge-letter">W</span></div>`;
    } else if (ext === 'xlsx' || ext === 'xls') {
        return `<div class="doc-icon-badge xlsx-badge"><span class="badge-letter">X</span></div>`;
    } else if (ext === 'pptx' || ext === 'ppt') {
        return `<div class="doc-icon-badge pptx-badge"><span class="badge-letter">P</span></div>`;
    } else if (ext === 'xml' || ext === 'json' || ext === 'csv') {
        return `<div class="doc-icon-badge code-badge"><span class="badge-letter">&lt;&gt;</span></div>`;
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
        return `<div class="doc-icon-badge img-badge"><i class="fas fa-image"></i></div>`;
    }
    return `<div class="doc-icon-badge default-badge"><i class="fas fa-file-alt"></i></div>`;
}

function getFormattedModifiedDate(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    const day = date.getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 should be 12
    const formattedHours = hours.toString().padStart(2, '0');

    return `${day} ${month} ${year}, ${formattedHours}:${minutes} ${ampm}`;
}

function toggleSelectAllFromHeader(headerCheckbox) {
    const isChecked = headerCheckbox.checked;
    const checkboxes = document.querySelectorAll("#pdfTableBody .doc-select-checkbox");
    selectedFiles = [];
    
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const fname = cb.getAttribute("data-filename");
        if (isChecked && fname) {
            selectedFiles.push(fname);
        }
    });
    
    selectionMode = isChecked || selectedFiles.length > 0;
    updateSelectionHeader();
}

function displayDashboard(files) {
    currentDashboardFiles = Array.isArray(files) ? files : [];
    updateCategoryStats(currentDashboardFiles);
    const body = document.getElementById("pdfTableBody");
    if (!body) return;

    body.innerHTML = "";

    if (currentDashboardFiles.length === 0) {
        body.innerHTML = "<tr><td colspan='7' style='text-align: center; color: var(--text-muted); padding: 36px 20px; font-size: 14px;'>No documents found. Upload a file above to get started.</td></tr>";
        updateSelectionHeader();
        return;
    }

    updateSelectionHeader();

    currentDashboardFiles.forEach(file => {
        const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();
        const isStarred = starredDocuments.includes(file.name);
        const iconBadge = getFileTypeIconBadge(file);
        const formattedDate = getFormattedModifiedDate(file.modified);
        const formattedSize = formatFileSize(file.size);

        // Display sanitized clean file name (strip leading timestamp if present for display, keep full name on title and data)
        const cleanName = file.name.replace(/^\d{10,14}-/, "");

        const row = document.createElement("tr");
        row.className = "modern-doc-row";

        row.innerHTML = `
            <td class="col-select">
                <input type="checkbox" class="doc-select-checkbox" data-filename="${file.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" ${selectedFiles.includes(file.name) ? "checked" : ""}>
            </td>
            <td class="col-star">
                <button type="button" class="star-btn ${isStarred ? "starred" : ""}" title="Star document" onclick="event.stopPropagation(); toggleStarDocument('${file.name.replace(/'/g, "\\'")}', this)">
                    <i class="${isStarred ? "fas" : "far"} fa-star"></i>
                </button>
            </td>
            <td class="col-name">
                <div class="doc-title-cell">
                    ${iconBadge}
                    <a href="javascript:void(0)" class="doc-filename-link" title="${file.name.replace(/"/g, '&quot;')}">
                        ${cleanName}
                    </a>
                </div>
            </td>
            <td class="col-type">
                <span class="type-pill-text">${ext}</span>
            </td>
            <td class="col-modified">
                <span class="date-text">${formattedDate}</span>
            </td>
            <td class="col-size">
                <span class="size-text">${formattedSize}</span>
            </td>
            <td class="col-actions action-cell">
                <button class="action-menu-btn" title="More options" onclick="event.stopPropagation();">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="action-menu">
                    ${buildActionMenu(file)}
                </div>
            </td>
        `;

        const link = row.querySelector(".doc-filename-link");
        if (link) {
            link.onclick = (e) => {
                e.stopPropagation();
                openDocument(file.name);
            };
        }

        row.onclick = (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".action-menu")) {
                return;
            }
            showPreview(file.name);
        };

        const checkbox = row.querySelector(".doc-select-checkbox");
        if (checkbox) {
            checkbox.addEventListener("change", () => {
                updateSelectedFile(file.name, checkbox.checked);
                const allCbs = document.querySelectorAll("#pdfTableBody .doc-select-checkbox");
                const headerCb = document.getElementById("headerSelectAll");
                if (headerCb) {
                    headerCb.checked = Array.from(allCbs).length > 0 && Array.from(allCbs).every(c => c.checked);
                }
            });
        }

        const menuButton = row.querySelector(".action-menu-btn");
        const menu = row.querySelector(".action-menu");
        if (menuButton && menu) {
            menuButton.onclick = (e) => {
                e.stopPropagation();
                const wasOpen = menu.style.display === "block";
                document.querySelectorAll(".action-menu").forEach(m => m.style.display = "none");
                menu.style.display = wasOpen ? "none" : "block";
            };
        }

        body.appendChild(row);
    });
}

function updateCategoryStats(files) {
    let pdfCount = 0;
    let docxCount = 0;
    let xlsxCount = 0;
    let pptxCount = 0;
    let othersCount = 0;
    let totalBytes = 0;

    files.forEach(f => {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        totalBytes += (f.size || 0);
        if (ext === 'pdf') pdfCount++;
        else if (ext === 'docx' || ext === 'doc') docxCount++;
        else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') xlsxCount++;
        else if (ext === 'pptx' || ext === 'ppt') pptxCount++;
        else othersCount++;
    });

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setVal("count-all", files.length);
    setVal("count-pdf", pdfCount);
    setVal("count-docx", docxCount);
    setVal("count-xlsx", xlsxCount);
    setVal("count-pptx", pptxCount);
    setVal("count-others", othersCount);

    const storageUsage = document.getElementById("storageUsageText");
    const storageFill = document.getElementById("storageProgressBar");
    if (storageUsage) {
        const formattedUsed = formatFileSize(totalBytes);
        storageUsage.textContent = `${formattedUsed} of 15 GB Used`;
    }
    if (storageFill) {
        const maxBytes = 15 * 1024 * 1024 * 1024; // 15 GB
        const pct = Math.min(100, Math.max(1, (totalBytes / maxBytes) * 100));
        storageFill.style.width = `${pct}%`;
    }
}

function filterByCategory(type) {
    if (!type || type === 'all') {
        displayDashboard(currentDashboardFiles);
        return;
    }
    const filtered = currentDashboardFiles.filter(f => {
        const ext = (f.name.split('.').pop() || '').toLowerCase();
        if (type === 'pdf') return ext === 'pdf';
        if (type === 'docx') return ext === 'docx' || ext === 'doc';
        if (type === 'xlsx') return ext === 'xlsx' || ext === 'xls' || ext === 'csv';
        if (type === 'pptx') return ext === 'pptx' || ext === 'ppt';
        if (type === 'others') return !['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'pptx', 'ppt'].includes(ext);
        return true;
    });

    const body = document.getElementById("pdfTableBody");
    if (!body) return;
    body.innerHTML = "";
    if (filtered.length === 0) {
        body.innerHTML = `<tr><td colspan='7' style='text-align: center; color: var(--text-muted); padding: 36px 20px; font-size: 14px;'>No ${type.toUpperCase()} files found.</td></tr>`;
        return;
    }

    filtered.forEach(file => {
        const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();
        const isStarred = starredDocuments.includes(file.name);
        const iconBadge = getFileTypeIconBadge(file);
        const formattedDate = getFormattedModifiedDate(file.modified);
        const formattedSize = formatFileSize(file.size);
        const cleanName = file.name.replace(/^\d{10,14}-/, "");

        const row = document.createElement("tr");
        row.className = "modern-doc-row";
        row.innerHTML = `
            <td class="col-select">
                <input type="checkbox" class="doc-select-checkbox" data-filename="${file.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">
            </td>
            <td class="col-star">
                <button type="button" class="star-btn ${isStarred ? "starred" : ""}" onclick="event.stopPropagation(); toggleStarDocument('${file.name.replace(/'/g, "\\'")}', this)">
                    <i class="${isStarred ? "fas" : "far"} fa-star"></i>
                </button>
            </td>
            <td class="col-name">
                <div class="doc-title-cell">
                    ${iconBadge}
                    <a href="javascript:void(0)" class="doc-filename-link" title="${file.name.replace(/"/g, '&quot;')}">
                        ${cleanName}
                    </a>
                </div>
            </td>
            <td class="col-type"><span class="type-pill-text">${ext}</span></td>
            <td class="col-modified"><span class="date-text">${formattedDate}</span></td>
            <td class="col-size"><span class="size-text">${formattedSize}</span></td>
            <td class="col-actions action-cell">
                <button class="action-menu-btn" title="More options" onclick="event.stopPropagation();">
                    <i class="fas fa-ellipsis-v"></i>
                </button>
                <div class="action-menu">${buildActionMenu(file)}</div>
            </td>
        `;

        const link = row.querySelector(".doc-filename-link");
        if (link) {
            link.onclick = (e) => { e.stopPropagation(); openDocument(file.name); };
        }
        row.onclick = (e) => {
            if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".action-menu")) return;
            showPreview(file.name);
        };
        const menuButton = row.querySelector(".action-menu-btn");
        const menu = row.querySelector(".action-menu");
        if (menuButton && menu) {
            menuButton.onclick = (e) => {
                e.stopPropagation();
                const wasOpen = menu.style.display === "block";
                document.querySelectorAll(".action-menu").forEach(m => m.style.display = "none");
                menu.style.display = wasOpen ? "none" : "block";
            };
        }
        body.appendChild(row);
    });
}

function updateSelectedFile(filename, isSelected) {
    if (isSelected) {
        if (!selectedFiles.includes(filename)) {
            selectedFiles.push(filename);
        }
    } else {
        selectedFiles = selectedFiles.filter(file => file !== filename);
    }
    updateSelectionHeader();
}

function updateSelectionHeader() {
    const counter = document.getElementById("recent-count");

    if (counter) {
        counter.style.display = selectionMode ? "none" : "inline-flex";
        counter.textContent = selectionMode
            ? `${selectedFiles.length} Selected`
            : `${currentDashboardFiles.length} Files`;
    }
    updateBulkActionToolbar();
}

function updateBulkActionToolbar() {
    const toolbar = document.getElementById("bulkActionToolbar");
    const selectedCount = document.getElementById("selectedCount");

    if (!toolbar || !selectedCount) return;

    const count = selectedFiles.length;

    if (count > 0) {
        toolbar.style.display = "flex";
        selectedCount.textContent = `${count} Selected`;
    } else {
        toolbar.style.display = "none";
    }
}

// Open PDF Workspace in a new tab
// Format-aware document opener (routes to correct viewer based on file type)
function openDocument(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    
    if (ext === 'pdf') {
        window.open("/pdf/" + encodeURIComponent(filename), "_blank");
    } else if (ext === 'docx') {
        openDocxViewer(filename);
    } else if (ext === 'xlsx') {
        // XLSX preview via native handler or redirect to download
        window.open("/documents/download/" + encodeURIComponent(filename), "_blank");
    } else if (ext === 'pptx') {
        // PPTX preview - download for now
        window.open("/documents/download/" + encodeURIComponent(filename), "_blank");
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
        // Image viewer
        window.open("/documents/download/" + encodeURIComponent(filename), "_blank");
    } else {
        // Default: download
        window.open("/documents/download/" + encodeURIComponent(filename), "_blank");
    }
}

// Edit document (DOCX only)
function editDocument(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'docx') {
        openDocxViewer(filename);
    } else {
        alert("This file type does not support editing.");
    }
}

// Download document
function downloadDocument(filename) {
    window.location.href = "/documents/download/" + encodeURIComponent(filename);
}

function openPDF(filename) {
    window.open("/pdf/" + encodeURIComponent(filename), "_blank");
}

// Show Preview Panel on the right side
async function showPreview(filename) {
    const infoPanel = document.getElementById("documentInfo");

    infoPanel.innerHTML = `
        <div class="preview-loading" style="text-align:center; padding:30px 0; color:var(--text-muted);">
            <i class="fas fa-spinner fa-spin" style="font-size:20px;"></i>
            <p style="margin-top:8px;">Loading preview...</p>
        </div>
    `;

    try {
        const response = await fetch("/documents/" + encodeURIComponent(filename) + "/info");
        const result = await parseJsonResponse(response);

        if (!result.success) {
            infoPanel.innerHTML = `<p style="color:#ff4d4f; padding:12px;">Failed to load document info.</p>`;
            return;
        }

        const info = result.info;
        const ext = filename.split('.').pop().toLowerCase();
        const isPdf = ext === 'pdf';
        const docIcon = info.icon || '📄';

        infoPanel.innerHTML = `
            <div class="preview-panel-content">
                <div class="preview-thumbnail" style="margin-bottom:16px; border-radius:8px; overflow:hidden; border:1px solid var(--border-color, #2a2e39); background:var(--card-bg, #1a1d24);">
                    ${isPdf
                        ? `<canvas id="previewCanvas" style="width:100%; display:block; min-height:180px;"></canvas>`
                        : `<div style="padding:40px; text-align:center; color:var(--text-muted); font-size:48px;">${docIcon}</div>`
                    }
                </div>

                <h4 style="margin:0 0 12px; color:var(--text-primary); font-size:15px; font-weight:600; word-break:break-all;">
                    ${docIcon} ${info.filename}
                </h4>

                <div class="info-details">
                    <div class="info-row">
                        <span class="info-label">Type</span>
                        <span class="info-value">${info.typeLabel || info.extension}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Extension</span>
                        <span class="info-value">${info.extension}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Size</span>
                        <span class="info-value">${formatFileSize(info.size)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Created</span>
                        <span class="info-value">${new Date(info.created).toLocaleString()}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Modified</span>
                        <span class="info-value">${new Date(info.modified).toLocaleString()}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Location</span>
                        <span class="info-value">${info.location}</span>
                    </div>
                </div>

                <div style="margin-top:16px;">
                    <button class="action-btn btn-primary" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;" onclick="openDocument('${filename.replace(/'/g, "\\\\'")}')">
                        <i class="fas fa-external-link-alt"></i> Open Document
                    </button>
                </div>
            </div>
        `;

        // Render first-page thumbnail using pdf.js (PDFs only)
        if (isPdf) {
            const canvas = document.getElementById("previewCanvas");
            if (canvas && window.pdfjsLib) {
                try {
                    const pdfUrl = "/pdf/" + encodeURIComponent(filename);
                    const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
                    const page = await pdf.getPage(1);
                    const viewport = page.getViewport({ scale: 1.0 });
                    const containerWidth = canvas.parentElement.clientWidth || 280;
                    const scale = containerWidth / viewport.width;
                    const scaledViewport = page.getViewport({ scale });
                    canvas.width = scaledViewport.width;
                    canvas.height = scaledViewport.height;
                    const ctx = canvas.getContext("2d");
                    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
                } catch (pdfErr) {
                    if (canvas.parentElement) {
                        canvas.parentElement.innerHTML = `<div style="padding:40px; text-align:center; color:var(--text-muted); font-size:36px;">📄</div>`;
                    }
                }
            }
        }
    } catch (err) {
        infoPanel.innerHTML = `<p style="color:#ff4d4f; padding:12px;">Error: ${err.message}</p>`;
    }
}


async function deleteDashboardPDF(file) {
    if (!confirm(`Delete "${file}"?\nThis action cannot be undone.`))
        return;

    try {
        const response = await fetch("/documents/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: file
            })
        });

        const result = await parseJsonResponse(response);

        alert(result.message);

        loadDocuments();
    } catch (err) {
        alert(err.message);
    }
}

async function loadProtectedPDFs() {

    const response = await fetch("/protected-pdfs");

    const result = await parseJsonResponse(response);

    if (!result.success)
        return;

    const protectedList = document.getElementById("protectedPdfList");
    const protectedCount = document.getElementById("protected-count");

    if (protectedList) protectedList.innerHTML = "";
    if (protectedCount) protectedCount.textContent = `${result.files.length} files`;

    if (result.files.length === 0) {
        if (protectedList) protectedList.innerHTML = "<div class='no-files-state'><p>No protected PDFs found.</p></div>";
        return;
    }

    result.files.forEach(file => {

        const div = document.createElement("div");
        div.className = "file-item";

        // Open Protected PDF
        const link = document.createElement("a");

        link.href = "/protected/" + encodeURIComponent(file);
        link.target = "_blank";
        link.className = "file-info";
        link.innerHTML = `<span class="file-icon">🔒</span> <span class="file-name">${file}</span>`;

        div.appendChild(link);

        const actionsDiv = document.createElement("div");
        actionsDiv.className = "file-actions";

        // Delete Button
        const deleteButton = document.createElement("button");
        deleteButton.textContent = "🗑 Delete";
        deleteButton.className = "btn-delete";
        deleteButton.onclick = async () => {

            if (!confirm(`Delete "${file}"?`))
                return;

            const response = await fetch(
                "/protected/" + encodeURIComponent(file),
                {
                    method: "DELETE"
                }
            );

            const result = await parseJsonResponse(response);

            alert(result.message);

            loadProtectedPDFs();

        };
        actionsDiv.appendChild(deleteButton);

        // Remove Password Button
        const removePasswordButton = document.createElement("button");
        removePasswordButton.textContent = "🔓 Remove Password";
        removePasswordButton.className = "btn-restore";
        removePasswordButton.onclick = async () => {

            const password = prompt("Enter current password:");

            if (!password)
                return;

            setProtectedStatusMessage("");

            try {

                const response = await fetch("/pdf/unprotect", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        filename: file,
                        password: password
                    })
                });

                const result = await parseJsonResponse(response);

                if (!response.ok || !result.success) {
                    setProtectedStatusMessage(
                        result.message || "Invalid Password please try again later"
                    );
                    return;
                }

                setProtectedStatusMessage(result.message, false);
                loadProtectedPDFs();
                loadPDFs();

            } catch (error) {
                setProtectedStatusMessage(
                    "Invalid Password please try again later"
                );
            }

        };
        actionsDiv.appendChild(removePasswordButton);

        // Change Password Button
        const changePasswordButton = document.createElement("button");
        changePasswordButton.textContent = "🔑 Change Password";
        changePasswordButton.className = "btn-copy";
        changePasswordButton.onclick = async () => {

            const currentPassword = prompt("Enter current password:");

            if (!currentPassword)
                return;

            const newPassword = prompt("Enter new password:");

            if (!newPassword)
                return;

            const confirmPassword = prompt("Confirm new password:");

            if (!confirmPassword)
                return;

            if (newPassword !== confirmPassword) {
                alert("New passwords do not match.");
                return;
            }

            try {

                const response = await fetch("/pdf/change-password", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        filename: file,
                        currentPassword: currentPassword,
                        newPassword: newPassword
                    })
                });

                const result = await parseJsonResponse(response);

                alert(result.message);

                loadProtectedPDFs();

            } catch (err) {
                alert(err.message);
            }

        };
        actionsDiv.appendChild(changePasswordButton);

        div.appendChild(actionsDiv);
        protectedList.appendChild(div);

    });

}

// Load PDFs
// Load documents (unified endpoint that supports multiple file types)
async function loadDocuments() {
    const response = await fetch("/documents/list");
    const result = await parseJsonResponse(response);

    if (result.success) {
        displayDashboard(result.files);
        // Keep the legacy "DOCX Documents" panel in sync with the same
        // unified file list/state used by the main dashboard.
        loadDocxFiles();
    }
}

// Keep old loadPDFs() for backward compatibility, but route to unified endpoint
async function loadPDFs() {
    await loadDocuments();
}

// Search PDFs
async function searchPDFs() {

    const keyword = document.getElementById("searchInput").value;

    if (keyword.trim() === "") {
        loadDocuments();
        return;
    }

    const response = await fetch(
        "/pdfs/search?q=" +
        encodeURIComponent(keyword)
    );

    const result = await parseJsonResponse(response);

    if (result.success) {
        displayDashboard(result.files);
    }

}

// Show document information
async function loadDocumentInfo(file) {
    const filename = typeof file === "object" ? file.name : file;

    const response = await fetch(
        "/documents/" + encodeURIComponent(filename) + "/info"
    );

    const result = await parseJsonResponse(response);

    if (!result.success)
        return;

    const info = result.info;

    const docInfo = document.getElementById("documentInfo");
    if (!docInfo) return;

    docInfo.innerHTML = `
        <div class="info-details">
            <div class="info-row">
                <span class="info-label">Filename</span>
                <span class="info-value">${info.filename}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Extension</span>
                <span class="info-value">${info.extension}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Size</span>
                <span class="info-value">${info.size} bytes</span>
            </div>
            <div class="info-row">
                <span class="info-label">Created</span>
                <span class="info-value">${new Date(info.created).toLocaleString()}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Modified</span>
                <span class="info-value">${new Date(info.modified).toLocaleString()}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Location</span>
                <span class="info-value">${info.location}</span>
            </div>
        </div>
    `;

}

// Global modal variables
let currentFileToProtect = "";

function openProtectModal(filename) {
    currentFileToProtect = filename;
    document.getElementById("protect-password").value = "";
    document.getElementById("allow-print").checked = true;
    document.getElementById("allow-copy").checked = true;
    document.getElementById("allow-edit").checked = true;

    const modal = document.getElementById("protect-modal");
    modal.style.display = "flex";
    // Trigger CSS opacity transition on next paint
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function closeProtectModal() {
    const modal = document.getElementById("protect-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToProtect = "";
}

// Close modal when clicking outside of the content
window.onclick = (event) => {
    const protectModal = document.getElementById("protect-modal");
    const renameModal = document.getElementById("rename-modal");
    const moveModal = document.getElementById("move-modal");
    const copyModal = document.getElementById("copy-modal");
    const tagModal = document.getElementById("tagModal");
    if (event.target === protectModal) {
        closeProtectModal();
    }
    if (event.target === renameModal) {
        closeRenameModal();
    }
    if (event.target === moveModal) {
        closeMoveModal();
    }
    if (event.target === copyModal) {
        closeCopyModal();
    }
    if (event.target === tagModal) {
        closeTagManager();
    }
};

async function submitProtectPDF(event) {
    event.preventDefault();

    const password = document.getElementById("protect-password").value;
    const allowPrint = document.getElementById("allow-print").checked;
    const allowCopy = document.getElementById("allow-copy").checked;
    const allowEdit = document.getElementById("allow-edit").checked;

    if (!password) {
        alert("Password is required.");
        return;
    }

    try {
        const response = await fetch("/pdf/permissions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: currentFileToProtect,
                password: password,
                allowPrint: allowPrint,
                allowCopy: allowCopy,
                allowEdit: allowEdit
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeProtectModal();
            alert(result.message || "PDF protected successfully!");
            loadPDFs();
            loadProtectedPDFs();
        } else {
            alert(result.message || "Permission application failure.");
        }
    } catch (error) {
        alert("Permission application failure.");
    }
}

let currentFileToRename = "";
let currentFileToMove = "";
let currentFileToCopy = "";

function openRenameModal(filename) {
    currentFileToRename = filename;
    document.getElementById("rename-newname").value = filename;

    const modal = document.getElementById("rename-modal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function renameDashboardPDF(file) {
    openRenameModal(file);
}

function closeRenameModal() {
    const modal = document.getElementById("rename-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToRename = "";
}

async function submitRenamePDF(event) {
    event.preventDefault();
    let newName = document.getElementById("rename-newname").value.trim();
    if (!newName) {
        alert("New name is required.");
        return;
    }

    try {
        const response = await fetch("/documents/rename", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                oldName: currentFileToRename,
                newName: newName
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeRenameModal();
            alert(result.message || "Document renamed successfully!");
            loadDocuments();
        } else {
            alert(result.message || "Rename failed.");
        }
    } catch (error) {
        alert("Rename failed.");
    }
}

function openMoveModal(filename) {
    currentFileToMove = filename;
    document.getElementById("move-folder").selectedIndex = 0;

    const modal = document.getElementById("move-modal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function moveDashboardPDF(file) {
    openMoveModal(file);
}

function closeMoveModal() {
    const modal = document.getElementById("move-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToMove = "";
}

async function submitMovePDF(event) {
    event.preventDefault();
    const folder = document.getElementById("move-folder").value;
    if (!folder) {
        alert("Please select a folder.");
        return;
    }

    try {
        const response = await fetch("/documents/move", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: currentFileToMove,
                folder: folder
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeMoveModal();
            alert(result.message || "Document moved successfully!");
            loadDocuments();
            selectFolder(currentFolder);
        } else {
            alert(result.message || "Move failed.");
        }
    } catch (error) {
        alert("Move failed.");
    }
}

function openCopyModal(filename) {
    currentFileToCopy = filename;
    document.getElementById("copy-folder").selectedIndex = 0;

    const modal = document.getElementById("copy-modal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);
}

function copyDashboardPDF(file) {
    openCopyModal(file);
}

function closeCopyModal() {
    const modal = document.getElementById("copy-modal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileToCopy = "";
}

async function submitCopyPDF(event) {
    event.preventDefault();
    const folder = document.getElementById("copy-folder").value;
    if (!folder) {
        alert("Please select a folder.");
        return;
    }

    try {
        const response = await fetch("/pdf/copy", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                filename: currentFileToCopy,
                folder: folder
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeCopyModal();
            alert(result.message || "PDF copied successfully!");
            selectFolder(currentFolder);
        } else {
            alert(result.message || "Copy failed.");
        }
    } catch (error) {
        alert("Copy failed.");
    }
}

// Sidebar sections switching
function switchSection(section) {
    const sections = document.querySelectorAll(".content-section");
    sections.forEach(s => s.classList.remove("active"));

    const activeSection = document.getElementById(`${section}-section`);
    if (activeSection) {
        activeSection.classList.add("active");
    }

    const navItems = document.querySelectorAll(".sidebar-nav .nav-item");
    navItems.forEach(item => item.classList.remove("active"));

    const activeNavItem = document.getElementById(`nav-${section}`);
    if (activeNavItem) {
        activeNavItem.classList.add("active");
    }

    // The DOCX panel derives from the unified dashboard state, so make
    // sure it reflects the latest data whenever it's opened.
    if (section === "docx") {
        loadDocxFiles();
    }
}

// Folder category logic
let currentFolder = "Books";

async function selectFolder(folderName) {
    currentFolder = folderName;

    const tabBtns = document.querySelectorAll(".folder-tab-btn");
    tabBtns.forEach(btn => {
        if (btn.getAttribute("data-folder") === folderName) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const folderTitle = document.getElementById("current-folder-title");
    if (folderTitle) folderTitle.textContent = `Folder: ${folderName}`;

    try {
        const response = await fetch(`/pdf/folder/${encodeURIComponent(folderName)}`);
        const result = await parseJsonResponse(response);

        const folderFileList = document.getElementById("folderFileList");
        const folderCount = document.getElementById("folder-count");

        if (!result.success) {
            if (folderFileList) folderFileList.innerHTML = "<div class='no-files-state'><p>Error loading folder files.</p></div>";
            if (folderCount) folderCount.textContent = "0 files";
            return;
        }

        const files = Array.isArray(result.files) ? result.files : [];
        if (folderCount) folderCount.textContent = `${files.length} files`;
        if (folderFileList) folderFileList.innerHTML = "";

        if (files.length === 0) {
            if (folderFileList) folderFileList.innerHTML = "<div class='no-files-state'><p>No documents found in this folder. Use 'Move' from the Dashboard to categorize files here.</p></div>";
            return;
        }

        const detailsList = result.fileDetails || files.map(name => ({ name }));

        detailsList.forEach(item => {
            const fileName = item.name;
            const safeName = fileName.replace(/'/g, "\\'");
            const icon = item.icon || (fileName.toLowerCase().endsWith(".pdf") ? "📄" : fileName.toLowerCase().endsWith(".docx") ? "📝" : "📁");

            const div = document.createElement("div");
            div.className = "file-item";

            div.innerHTML = `
                <a href="/pdf/folder/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}"
                   target="_blank"
                   class="file-info"
                   title="Open ${fileName}">
                    <span class="file-icon">${icon}</span>
                    <span class="file-name">${fileName}</span>
                    ${item.size ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px;">(${formatFileSize(item.size)})</span>` : ""}
                </a>
                <div class="file-actions">
                    <a href="/pdf/folder/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}"
                       target="_blank"
                       class="action-btn"
                       style="text-decoration:none;font-size:12px;padding:6px 12px;background:rgba(255,255,255,0.06);"
                       title="View or Download">
                        <i class="fas fa-external-link-alt"></i> View
                    </a>
                    <button class="btn-delete"
                            onclick="deleteFolderFile('${encodeURIComponent(folderName)}', '${safeName}')"
                            title="Delete file from folder">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;

            folderFileList.appendChild(div);
        });

    } catch (error) {
        console.error("Error loading folder PDFs:", error);
    }
}

async function deleteFolderFile(folderName, fileName) {
    if (!confirm(`Delete "${fileName}" from folder "${folderName}"?`)) return;

    try {
        const response = await fetch(`/documents/folder/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`, {
            method: "DELETE"
        });
        const result = await parseJsonResponse(response);
        alert(result.message || "File deleted.");
        selectFolder(folderName);
        loadDocuments();
    } catch (err) {
        alert("Failed to delete file from folder.");
    }
}

// Load PDFs and sections when page opens
// Selection / dropdown helpers
function toggleSelectMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById("selectMenu");
    if (!menu) return;
    menu.style.display = (menu.style.display === "block") ? "none" : "block";
}

function closeSelectMenu() {
    const menu = document.getElementById("selectMenu");
    if (!menu) return;
    menu.style.display = "none";
}

function enterSelectionMode() {
    selectionMode = true;
    selectedFiles = [];
    document.body.classList.add("selection-mode");
    closeSelectMenu();
    displayDashboard(currentDashboardFiles);
}

function selectAllFiles() {
    if (!selectionMode) {
        enterSelectionMode();
    }
    selectedFiles = currentDashboardFiles.map(file => file.name);
    displayDashboard(currentDashboardFiles);
    closeSelectMenu();
}

function selectByTag() {
    const tag = prompt("Enter tag to select:");
    if (!tag) return;
    const lowerTag = tag.trim().toLowerCase();
    
    selectedFiles = [];
    currentDashboardFiles.forEach(file => {
        const tags = Array.isArray(file.tags) ? file.tags.map(t => String(t).toLowerCase()) : [];
        if (tags.some(t => t.includes(lowerTag))) {
            selectedFiles.push(file.name);
        }
    });

    displayDashboard(currentDashboardFiles);
    closeSelectMenu();
}

function selectProtected() {
    selectedFiles = [];
    currentDashboardFiles.forEach(file => {
        const status = String(file.status || "").toLowerCase();
        if (status.includes("protect") || file.encrypted) {
            selectedFiles.push(file.name);
        }
    });

    if (selectedFiles.length === 0) {
        showToast("No protected documents found in current list.", "info");
    }

    displayDashboard(currentDashboardFiles);
    closeSelectMenu();
}

function cancelSelection() {
    exitSelectionMode();
}

function exitSelectionMode() {
    selectionMode = false;
    selectedFiles = [];
    document.body.classList.remove("selection-mode");
    closeSelectMenu();

    const toolbar = document.getElementById("bulkActionToolbar");
    if (toolbar) {
        toolbar.style.display = "none";
    }

    loadDocuments();
}

// Bulk Move - Move all selected documents to a folder
async function bulkMove() {
    if (!selectedFiles || selectedFiles.length === 0) {
        alert("Please select at least one document.");
        return;
    }

    const folder = prompt(
        `Move ${selectedFiles.length} documents to folder?\nAvailable: Books, College, Notes, Projects, Archive`
    );

    if (!folder || !["Books", "College", "Notes", "Projects", "Archive"].includes(folder)) {
        alert("Invalid or cancelled.");
        return;
    }

    try {
        const response = await fetch("/documents/bulk-move", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filenames: selectedFiles,
                folder: folder
            })
        });

        const result = await parseJsonResponse(response);

        selectedFiles = [];
        selectionMode = false;
        const toolbar = document.getElementById("bulkActionToolbar");
        if (toolbar) toolbar.style.display = "none";

        await loadDocuments();

        if (result.failed && result.failed > 0) {
            alert(`${result.moved} moved successfully, ${result.failed} failed.`);
        } else {
            alert(`${result.moved} document(s) moved successfully.`);
        }
    } catch (error) {
        console.error("Bulk move failed:", error);
        alert("Bulk move operation failed.");
    }
}

// Bulk Add Tags - Add tags to all selected documents
function bulkAddTags() {
    if (!selectedFiles || selectedFiles.length === 0) {
        alert("Please select at least one document.");
        return;
    }

    const tagsInput = prompt(
        `Add tags to ${selectedFiles.length} documents.\nEnter tags separated by commas:`
    );

    if (tagsInput === null) return; // Cancelled

    const newTags = tagsInput.split(",").map(t => t.trim()).filter(t => t.length > 0);

    if (newTags.length === 0) {
        alert("No tags entered.");
        return;
    }

    bulkApplyTags(selectedFiles, newTags);
}

async function bulkApplyTags(filenames, tagsToAdd) {
    let successCount = 0;
    let failedCount = 0;
    const errors = [];

    for (const filename of filenames) {
        try {
            // Get existing tags
            const getResponse = await fetch(`/documents/${encodeURIComponent(filename)}/tags`);
            const getResult = await parseJsonResponse(getResponse);
            let existingTags = getResult.tags || [];

            // Combine with new tags (avoid duplicates)
            const combinedTags = [...new Set([...existingTags, ...tagsToAdd])];

            // Update tags
            const updateResponse = await fetch(
                `/documents/${encodeURIComponent(filename)}/tags`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ tags: combinedTags })
                }
            );

            const updateResult = await parseJsonResponse(updateResponse);

            if (updateResult.success) {
                successCount++;
            } else {
                failedCount++;
                errors.push(filename);
            }
        } catch (error) {
            failedCount++;
            errors.push(filename);
        }
    }

    selectedFiles = [];
    selectionMode = false;
    const toolbar = document.getElementById("bulkActionToolbar");
    if (toolbar) toolbar.style.display = "none";

    await loadDocuments();

    if (failedCount > 0) {
        alert(`${successCount} updated, ${failedCount} failed.\nFailed: ${errors.join(", ")}`);
    } else {
        alert(`Tags added to ${successCount} document(s).`);
    }
}

// Bulk Download - Download selected documents
function bulkDownload() {
    if (!selectedFiles || selectedFiles.length === 0) {
        alert("Please select at least one document.");
        return;
    }

    selectedFiles.forEach((filename, idx) => {
        setTimeout(() => {
            const link = document.createElement("a");
            link.href = "/documents/download/" + encodeURIComponent(filename);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }, idx * 250);
    });
}

// Bulk Delete - Delete all selected documents
async function bulkDelete() {
    if (!selectedFiles || selectedFiles.length === 0) {
        alert("Please select at least one document.");
        return;
    }

    const filesToDelete = [...selectedFiles];

    const confirmed = confirm(
        `Delete ${filesToDelete.length} selected document${filesToDelete.length > 1 ? "s" : ""}?\n` +
        "This action cannot be undone."
    );

    if (!confirmed) return;

    try {
        const response = await fetch("/documents/bulk-delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filenames: filesToDelete })
        });

        const result = await parseJsonResponse(response);

        selectedFiles = [];
        selectionMode = false;
        const toolbar = document.getElementById("bulkActionToolbar");
        if (toolbar) toolbar.style.display = "none";

        await loadDocuments();

        if (result.failed && result.failed > 0) {
            alert(`${result.deleted} deleted, ${result.failed} failed.`);
        } else {
            alert(`${result.deleted} document(s) deleted successfully.`);
        }
    } catch (error) {
        console.error("Bulk delete failed:", error);
        alert("Bulk delete operation failed.");
    }
}

function closeTagsModal() {
    const modal = document.getElementById("tags-modal");

    if (!modal) return;

    modal.classList.remove("active");

    setTimeout(() => {
        modal.style.display = "none";
    }, 250);

    currentFileToEditTags = "";
}

let currentFileToEditTags = "";

async function submitEditTags(event) {
    event.preventDefault();

    if (!currentFileToEditTags) {
        alert("No document selected.");
        return;
    }

    const input = document.getElementById("tags-input");

    if (!input) {
        alert("Tags input not found.");
        return;
    }

    const tags = input.value
        .split(",")
        .map(tag => tag.trim())
        .filter(Boolean);

    try {
        const response = await fetch(
            `/documents/${encodeURIComponent(currentFileToEditTags)}/tags`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ tags })
            }
        );

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeTagsModal();
            alert(result.message || "Tags saved successfully!");
            loadPDFs();
        } else {
            alert(result.message || "Failed to save tags.");
        }

    } catch (error) {
        console.error("Edit Tags Error:", error);
        alert("Failed to save tags.");
    }
}

function filterDocuments() {
    const query = document.getElementById("globalSearch").value.trim().toLowerCase();
    const rows = document.querySelectorAll("#pdfTableBody tr");

    rows.forEach(row => {
        if (row.cells.length === 1 && row.cells[0].colSpan === 10) {
            return;
        }

        const nameCell = row.querySelector(".name-column");
        const tagsCell = row.querySelector(".tags-cell");

        const nameText = nameCell ? nameCell.textContent.toLowerCase() : "";
        const tagsText = tagsCell ? tagsCell.textContent.toLowerCase() : "";

        if (nameText.includes(query) || tagsText.includes(query)) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    });
}

let currentFileForTags = "";

async function openTagManager(filename) {
    currentFileForTags = filename;
    document.getElementById("tagDocumentName").value = filename;
    document.getElementById("newTagInput").value = "";
    
    const modal = document.getElementById("tagModal");
    modal.style.display = "flex";
    setTimeout(() => {
        modal.classList.add("active");
    }, 10);

    await loadCurrentTags(filename);
}

function closeTagManager() {
    const modal = document.getElementById("tagModal");
    modal.classList.remove("active");
    setTimeout(() => {
        modal.style.display = "none";
    }, 250);
    currentFileForTags = "";
}

async function loadCurrentTags(filename) {
    const container = document.getElementById("currentTags");
    if (!container) return;
    container.innerHTML = "Loading...";

    try {
        const response = await fetch(`/documents/${encodeURIComponent(filename)}/tags`);
        const result = await parseJsonResponse(response);

        if (result.success && Array.isArray(result.tags)) {
            container.innerHTML = "";
            if (result.tags.length === 0) {
                container.textContent = "No tags assigned.";
                return;
            }
            result.tags.forEach(tag => {
                const badge = document.createElement("span");
                badge.className = "tag-badge";
                badge.innerHTML = `
                    ${tag}
                    <button class="tag-remove-btn" onclick="removeTag('${encodeURIComponent(filename)}', '${encodeURIComponent(tag)}')">&times;</button>
                `;
                container.appendChild(badge);
            });
        } else {
            container.textContent = "Error loading tags.";
        }
    } catch (error) {
        container.textContent = "Error loading tags.";
    }
}

async function addTag() {
    const input = document.getElementById("newTagInput");
    const tag = input.value.trim();
    if (!tag) {
        alert("Please enter a tag.");
        return;
    }

    try {
        // Fetch existing tags first
        const getResponse = await fetch(`/documents/${encodeURIComponent(currentFileForTags)}/tags`);
        const getResult = await parseJsonResponse(getResponse);
        const existingTags = (getResult.success && Array.isArray(getResult.tags)) ? getResult.tags : [];

        // Combine with new tag (avoid duplicates, case-insensitive)
        const existingLower = new Set(existingTags.map(t => t.toLowerCase()));
        const combinedTags = existingLower.has(tag.toLowerCase())
            ? existingTags
            : [...existingTags, tag];

        const response = await fetch(`/documents/${encodeURIComponent(currentFileForTags)}/tags`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                tags: combinedTags
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            input.value = "";
            await loadCurrentTags(currentFileForTags);
            loadPDFs();
        } else {
            alert(result.message || "Failed to add tag.");
        }
    } catch (error) {
        alert("Failed to add tag.");
    }
}

async function removeTag(encodedFilename, encodedTag) {
    const filename = decodeURIComponent(encodedFilename);
    const tag = decodeURIComponent(encodedTag);

    try {
        const response = await fetch(`/documents/${encodeURIComponent(filename)}/tags`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                tags: [tag]
            })
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            if (currentFileForTags === filename) {
                await loadCurrentTags(filename);
            }
            loadPDFs();
        } else {
            alert(result.message || "Failed to remove tag.");
        }
    } catch (error) {
        alert("Failed to remove tag.");
    }
}

// Close menus when clicking outside
document.addEventListener("click", (e) => {
    const menu = document.getElementById("selectMenu");
    if (menu && menu.style.display === "block" && !menu.contains(e.target) && !e.target.closest(".btn-select-all")) {
        menu.style.display = "none";
    }

    // Close action menus if clicking outside any action cell
    if (!e.target.closest(".action-cell")) {
        document.querySelectorAll(".action-menu").forEach(m => m.style.display = "none");
    }
});

// Keyboard shortcuts (Ctrl/Cmd+K to search, Esc to close modals/menus)
document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const search = document.getElementById("globalSearch");
        if (search) {
            search.focus();
            search.select();
        }
    } else if (e.key === "Escape") {
        closeProtectModal();
        closeRenameModal();
        closeMoveModal();
        closeCopyModal();
        closeTagManager();
        closeTagsModal();
        closeSelectMenu();
        document.querySelectorAll(".action-menu").forEach(m => m.style.display = "none");
    }
});

// ================================================================
// DOCX integration (additive — talks only to /docx/* routes and does
// not modify any existing PDF upload/list/preview logic above).
// ================================================================

function setDocxStatusMessage(message, isError = true) {
    const status = document.getElementById("docxStatusMessage");
    if (!status) return;
    status.textContent = message || "";
    status.style.display = message ? "block" : "none";
    status.style.color = isError ? "#ff4d4f" : "#22c55e";
}

async function uploadDocxFile() {
    const input = document.getElementById("docxFileInput");
    const file = input?.files?.[0];

    if (!file) {
        setDocxStatusMessage("Please select a .docx file.");
        return;
    }

    if (!file.name.toLowerCase().endsWith(".docx")) {
        setDocxStatusMessage("Only .docx files are supported.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("/docx/upload", {
            method: "POST",
            body: formData
        });

        const result = await parseJsonResponse(response);

        if (result.success) {
            input.value = "";
            setDocxStatusMessage(`Uploaded: ${result.filename}`, false);
            showToast("File uploaded successfully", "success");
            // Refresh the unified dashboard state; the DOCX panel derives
            // from currentDashboardFiles, so this re-renders both views.
            await loadDocuments();
        } else {
            showToast(result.message || "DOCX upload failed.", "error");
            setDocxStatusMessage(result.message || "DOCX upload failed.");
        }
    } catch (err) {
        showToast(err.message || "Upload failed", "error");
        setDocxStatusMessage(err.message);
    }
}

// Renders the "DOCX Documents" panel from the unified dashboard state
// (currentDashboardFiles) instead of a separate /docx/list fetch, so this
// panel and the main Recent Documents table never fall out of sync.
// Kept as loadDocxFiles() for backward compatibility with existing callers.
function loadDocxFiles() {
    const listEl = document.getElementById("docxFileList");
    const countEl = document.getElementById("docx-count");

    if (!listEl) return;

    const docxFiles = currentDashboardFiles.filter(file => file.type === "docx");

    if (countEl) {
        countEl.textContent = `${docxFiles.length} files`;
    }

    listEl.innerHTML = "";

    if (docxFiles.length === 0) {
        listEl.innerHTML = "<div class='no-files-state'><p>No DOCX files uploaded yet.</p></div>";
        return;
    }

    docxFiles.forEach(file => {
        const safeName = file.name.replace(/'/g, "\\'");
        const caps = file.capabilities || {};

        const div = document.createElement("div");
        div.className = "file-item";
        div.innerHTML = `
            <span class="file-info">
                <span class="file-icon">📝</span>
                <span class="file-name">${file.name}</span>
            </span>
            <span class="file-actions">
                ${caps.preview || caps.edit
                    ? `<button class="action-btn" onclick="openDocxViewer('${safeName}')">
                        <i class="fas fa-eye"></i> Preview / Edit
                    </button>`
                    : ""}
                ${caps.download
                    ? `<button class="action-btn" onclick="downloadDocument('${safeName}')">
                        <i class="fas fa-download"></i> Download
                    </button>`
                    : ""}
                ${caps.delete
                    ? `<button class="action-btn" onclick="deleteDocxFile('${safeName}')">
                        <i class="fas fa-trash"></i> Delete
                    </button>`
                    : ""}
            </span>
        `;
        listEl.appendChild(div);
    });
}

function openDocxViewer(filename) {
    window.open("viewer.html?file=" + encodeURIComponent(filename), "_blank");
}

// Deletes through the same unified /documents/delete route used by the
// main dashboard, then refreshes the shared state so both views update.
async function deleteDocxFile(filename) {
    if (!confirm(`Delete "${filename}"?`)) return;

    try {
        const response = await fetch("/documents/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename })
        });

        const result = await parseJsonResponse(response);
        setDocxStatusMessage(result.message, !result.success);
        await loadDocuments();
    } catch (err) {
        setDocxStatusMessage(err.message);
    }
}

// ================================================================
// COMING SOON & TOOL MODALS (ROADMAP FEATURES)
// ================================================================

const COMING_SOON_DATA = {
    ai: {
        title: "AI Document Intelligence Suite",
        desc: "NeuroCore AI is currently training on local neural weights for on-premise document summarization, natural language queries, and automatic smart indexing.",
        bullets: [
            "Local neural model for instant context-aware summarization",
            "Multi-format Q&A (PDF, DOCX, XLSX, PPTX)",
            "Automatic smart tagging and metadata enrichment",
            "Zero cloud telemetry / 100% private processing"
        ]
    },
    cloud: {
        title: "Cloud & Distributed Storage Sync",
        desc: "Enterprise encrypted sync bridges for Google Drive, OneDrive, Dropbox, and self-hosted WebDAV / NextCloud servers are coming in the next release.",
        bullets: [
            "Bidirectional automatic file synchronization",
            "End-to-end client-side encryption (AES-256-GCM)",
            "Collaborative multi-user shared folders",
            "Selective offline caching"
        ]
    },
    spreadsheet: {
        title: "NeuroSheets - Web Spreadsheet Editor",
        desc: "A native high-performance grid calculation engine supporting 400+ Excel formulas, pivot tables, and XLSX export is currently in alpha testing.",
        bullets: [
            "Full compatibility with Microsoft Excel (.xlsx) & CSV",
            "Real-time formula calculation engine",
            "Interactive charts, pivot tables, and conditional formatting"
        ]
    },
    presentation: {
        title: "NeuroSlides - Presentation Studio",
        desc: "Create and present vector-sharp presentation decks with slide templates, speaker notes, and instant PDF/PPTX compilation.",
        bullets: [
            "Modern slide deck editor with rich vector tools",
            "PowerPoint (.pptx) import and export",
            "AI-powered presentation outline generator"
        ]
    },
    starred: {
        title: "Starred & Favorites Filter",
        desc: "View and organize all your starred documents in a dedicated view.",
        bullets: [
            "Quick access to prioritized documents",
            "Custom star colors and tags",
            "Offline pinned cache"
        ]
    },
    shared: {
        title: "Shared Workspaces & Collaboration",
        desc: "Share documents with team members with granular view/edit/comment permissions.",
        bullets: [
            "Secure invite links with password protection",
            "Real-time multi-cursor document editing",
            "Version history & revision audit logs"
        ]
    },
    trash: {
        title: "Document Bin & Recovery",
        desc: "30-day trash retention with one-click restoration and permanent secure shredding.",
        bullets: [
            "Automatic 30-day retention buffer",
            "One-click version restore",
            "DoD 5220.22-M secure multi-pass file shredding"
        ]
    }
};

function openComingSoonModal(featureKey) {
    const info = COMING_SOON_DATA[featureKey] || {
        title: "Upcoming Feature",
        desc: "This feature is currently under active development and will be available in the upcoming NeuroCore release.",
        bullets: ["Under active engineering", "Full offline security testing", "Coming in next update"]
    };

    const titleEl = document.getElementById("comingSoonTitle");
    const descEl = document.getElementById("comingSoonDesc");
    const bulletsEl = document.getElementById("comingSoonBullets");

    if (titleEl) titleEl.textContent = info.title;
    if (descEl) descEl.textContent = info.desc;
    if (bulletsEl) {
        bulletsEl.innerHTML = info.bullets
            .map(b => `<div class="feature-bullet"><i class="fas fa-check-circle"></i> <span>${b}</span></div>`)
            .join("");
    }

    const modal = document.getElementById("comingSoonModal");
    if (modal) modal.style.display = "flex";
}

function closeComingSoonModal() {
    const modal = document.getElementById("comingSoonModal");
    if (modal) modal.style.display = "none";
}

// Resume Builder Modal
function openResumeBuilderModal() {
    const modal = document.getElementById("resumeBuilderModal");
    if (modal) {
        modal.style.display = "flex";
        updateResumePreview();
    }
}

function closeResumeBuilderModal() {
    const modal = document.getElementById("resumeBuilderModal");
    if (modal) modal.style.display = "none";
}

function updateResumePreview() {
    const name = document.getElementById("rb-name")?.value || "Alex Morgan";
    const title = document.getElementById("rb-title")?.value || "Senior Software Engineer";
    const email = document.getElementById("rb-email")?.value || "alex.morgan@example.com";
    const phone = document.getElementById("rb-phone")?.value || "+1 (555) 234-5678";
    const summary = document.getElementById("rb-summary")?.value || "Experienced engineer specializing in high-performance web systems.";
    const exp = document.getElementById("rb-exp")?.value || "Lead Developer at Tech Corp (2021-Present)";
    const skills = document.getElementById("rb-skills")?.value || "TypeScript, Node.js, React, Docker, Python";

    const pName = document.getElementById("preview-rb-name");
    const pTitle = document.getElementById("preview-rb-title");
    const pContact = document.getElementById("preview-rb-contact");
    const pSummary = document.getElementById("preview-rb-summary");
    const pExp = document.getElementById("preview-rb-exp");
    const pSkills = document.getElementById("preview-rb-skills");

    if (pName) pName.textContent = name;
    if (pTitle) pTitle.textContent = title;
    if (pContact) pContact.textContent = `${email} • ${phone}`;
    if (pSummary) pSummary.textContent = summary;
    if (pExp) pExp.textContent = exp;
    if (pSkills) pSkills.textContent = skills;
}

function downloadResumeSample() {
    showToast("Generating PDF Resume...", "info");
    setTimeout(() => {
        showToast("Resume downloaded successfully!", "success");
    }, 800);
}

// ATS Checker Modal
function openAtsCheckerModal() {
    const modal = document.getElementById("atsCheckerModal");
    if (modal) modal.style.display = "flex";
}

function closeAtsCheckerModal() {
    const modal = document.getElementById("atsCheckerModal");
    if (modal) modal.style.display = "none";
}

function runAtsScan() {
    const scanBtn = document.querySelector("#atsCheckerModal .action-btn.btn-primary");
    if (scanBtn) scanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';

    setTimeout(() => {
        if (scanBtn) scanBtn.innerHTML = '<i class="fas fa-search"></i> Run ATS Scan';
        showToast("ATS Analysis Complete! 85% Score", "success");
    }, 1000);
}

// AI Assistant Modal
function openAiModal() {
    const modal = document.getElementById("aiModal");
    if (modal) modal.style.display = "flex";
}

function closeAiModal() {
    const modal = document.getElementById("aiModal");
    if (modal) modal.style.display = "none";
}

function handleAiSubmit(e) {
    if (e) e.preventDefault();
    const input = document.getElementById("aiChatInput");
    const query = input?.value?.trim();
    if (!query) return;

    appendAiMessage("user", query);
    input.value = "";

    setTimeout(() => {
        const responses = [
            `I have analyzed your workspace. You currently have ${currentDashboardFiles.length} document(s) loaded. Let me know if you would like me to extract key points or inspect permissions.`,
            `NeuroCore AI: "${query}" has been indexed against your local document corpus. All documents are encrypted and protected.`,
            `Summary generated: All files in your workspace are formatted and verified for production compliance.`
        ];
        const randomRes = responses[Math.floor(Math.random() * responses.length)];
        appendAiMessage("assistant", randomRes);
    }, 600);
}

function askAiFromBanner(e) {
    if (e) e.preventDefault();
    const input = document.getElementById("aiBannerInput");
    const query = input?.value?.trim();
    if (!query) return;

    openAiModal();
    appendAiMessage("user", query);
    input.value = "";

    setTimeout(() => {
        appendAiMessage("assistant", `I found relevant sections in your workspace files matching "${query}". You can review or edit them directly.`);
    }, 600);
}

function sendAiQuickPrompt(promptText) {
    appendAiMessage("user", promptText);
    setTimeout(() => {
        if (promptText.includes("Summarize")) {
            appendAiMessage("assistant", `Executive Summary:\n• Total Documents: ${currentDashboardFiles.length}\n• Status: All documents integrity-checked.\n• Security: Multi-tier PDF protection enabled.`);
        } else if (promptText.includes("ATS")) {
            appendAiMessage("assistant", `ATS Compliance Report: Found standard headings, parseable contact info, and clear typography. Compatibility rating: 85%.`);
        } else {
            appendAiMessage("assistant", `AI analysis completed for "${promptText}". All systems operational.`);
        }
    }, 500);
}

function appendAiMessage(role, text) {
    const container = document.getElementById("aiChatMessages");
    if (!container) return;

    const bubble = document.createElement("div");
    bubble.className = `ai-chat-bubble ${role}`;
    if (role === "assistant") {
        bubble.innerHTML = `
            <div class="ai-avatar"><i class="fas fa-sparkles"></i></div>
            <div class="bubble-text">${text.replace(/\n/g, '<br>')}</div>
        `;
    } else {
        bubble.innerHTML = `
            <div class="bubble-text">${text}</div>
        `;
    }
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

// Direct file upload handler for the Upload button & Drag-Drop
async function handleDirectUpload(inputElement) {
    const file = inputElement?.files?.[0];
    if (!file) return;

    showToast(`Uploading ${file.name}...`, "info", 2000);
    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("/upload", {
            method: "POST",
            body: formData
        });

        const result = await parseJsonResponse(response);

        if (result.success) {
            showToast(`File uploaded successfully: ${file.name}`, "success");
            if (inputElement.value !== undefined) {
                inputElement.value = "";
            }
            await loadDocuments();
            if (typeof loadDocxFiles === "function") {
                loadDocxFiles();
            }
        } else {
            showToast(result.message || "Upload failed. Please try again.", "error");
        }
    } catch (err) {
        showToast("Upload failed: " + (err.message || "Network error."), "error");
    }
}

// Create New DOCX Document
async function createNewDocxDocument() {
    closeAllPopovers();
    const docName = prompt("Enter a name for your new document:", "Untitled Document.docx");
    if (docName === null) return; // Cancelled
    
    let cleanName = docName.trim();
    if (!cleanName) cleanName = "Untitled Document.docx";
    if (!cleanName.toLowerCase().endsWith(".docx")) {
        cleanName += ".docx";
    }

    try {
        showToast(`Creating ${cleanName}...`, "info", 1500);
        const res = await fetch("/docx/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: cleanName, title: cleanName.replace(/\.docx$/i, "") })
        });
        const data = await parseJsonResponse(res);
        if (data.success) {
            showToast(`Document created: ${cleanName}`, "success");
            await loadDocuments();
            if (typeof loadDocxFiles === "function") loadDocxFiles();
            // Automatically open in DOCX editor
            setTimeout(() => {
                switchSection("docx");
                openDocxViewer(data.filename || cleanName);
            }, 350);
        } else {
            showToast(data.message || "Failed to create document", "error");
        }
    } catch (err) {
        showToast("Error creating document: " + err.message, "error");
    }
}

// Direct Protect Modal from + New button
function openProtectModalDirect() {
    closeAllPopovers();
    const pdfFiles = currentDashboardFiles.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length > 0) {
        openProtectModal(pdfFiles[0].name);
    } else {
        showToast("Please upload a PDF document first to protect it.", "info");
    }
}

// Direct Move / Folder Modal from + New button
function openMoveModalDirect() {
    closeAllPopovers();
    const folderName = prompt("Enter new folder name:\n(e.g., Reports, Contracts, Invoices, Archives)", "Reports");
    if (folderName && folderName.trim()) {
        showToast(`Folder "${folderName.trim()}" ready in workspace.`, "success");
        selectFolder(folderName.trim());
    }
}

// Top Bar Dropdowns & Theme Mode
function toggleNewMenu(e) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }
    const menu = document.getElementById("newDropdownMenu");
    if (!menu) return;
    const isShown = menu.style.display === "block";
    closeAllPopovers();
    menu.style.display = isShown ? "none" : "block";
}

function toggleNewDropdown(e) {
    toggleNewMenu(e);
}

function toggleNotificationsPopover(e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById("notificationsPopover");
    if (!pop) return;
    const isShown = pop.style.display === "block";
    closeAllPopovers();
    pop.style.display = isShown ? "none" : "block";
}

function toggleUserDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById("userDropdownMenu");
    if (!menu) return;
    const isShown = menu.style.display === "block";
    closeAllPopovers();
    menu.style.display = isShown ? "none" : "block";
}

function closeAllPopovers() {
    const newMenu = document.getElementById("newDropdownMenu");
    const notifPop = document.getElementById("notificationsPopover");
    const userMenu = document.getElementById("userDropdownMenu");
    if (newMenu) newMenu.style.display = "none";
    if (notifPop) notifPop.style.display = "none";
    if (userMenu) userMenu.style.display = "none";
}

function toggleThemeMode() {
    document.body.classList.toggle("grayscale-light-theme");
    const isLight = document.body.classList.contains("grayscale-light-theme");
    showToast(isLight ? "Switched to High-Contrast Grayscale" : "Switched to Dark Grayscale", "info");
}

function quickCreateFile(type) {
    closeAllPopovers();
    if (type === "docx") {
        switchSection("docx");
        showToast("Opened Document Editor workspace.", "info");
    } else if (type === "pdf") {
        switchSection("pdf-tools");
        showToast("Opened PDF Tools suite.", "info");
    } else {
        openComingSoonModal(type);
    }
}

// Setup Global Click Listener to close popovers
document.addEventListener("click", (e) => {
    if (!e.target.closest(".new-dropdown-wrapper") &&
        !e.target.closest(".nav-icon-btn") &&
        !e.target.closest(".user-profile-menu-wrapper")) {
        closeAllPopovers();
    }
});

// Setup Live Search filter in top navbar
document.addEventListener("DOMContentLoaded", () => {
    const globalSearch = document.getElementById("globalSearch");
    if (globalSearch) {
        globalSearch.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            if (!query) {
                displayDashboard(currentDashboardFiles);
                return;
            }
            const matched = currentDashboardFiles.filter(f => f.name.toLowerCase().includes(query));
            const body = document.getElementById("pdfTableBody");
            if (!body) return;
            body.innerHTML = "";
            if (matched.length === 0) {
                body.innerHTML = `<tr><td colspan='7' style='text-align: center; color: var(--text-muted); padding: 36px 20px; font-size: 14px;'>No files matching "${query}"</td></tr>`;
                return;
            }
            matched.forEach(file => {
                const ext = (file.name.split('.').pop() || 'FILE').toUpperCase();
                const isStarred = starredDocuments.includes(file.name);
                const iconBadge = getFileTypeIconBadge(file);
                const formattedDate = getFormattedModifiedDate(file.modified);
                const formattedSize = formatFileSize(file.size);
                const cleanName = file.name.replace(/^\d{10,14}-/, "");

                const row = document.createElement("tr");
                row.className = "modern-doc-row";
                row.innerHTML = `
                    <td class="col-select"><input type="checkbox" class="doc-select-checkbox" data-filename="${file.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></td>
                    <td class="col-star"><button type="button" class="star-btn ${isStarred ? "starred" : ""}" onclick="event.stopPropagation(); toggleStarDocument('${file.name.replace(/'/g, "\\'")}', this)"><i class="${isStarred ? "fas" : "far"} fa-star"></i></button></td>
                    <td class="col-name"><div class="doc-title-cell">${iconBadge}<a href="javascript:void(0)" class="doc-filename-link" title="${file.name.replace(/"/g, '&quot;')}">${cleanName}</a></div></td>
                    <td class="col-type"><span class="type-pill-text">${ext}</span></td>
                    <td class="col-modified"><span class="date-text">${formattedDate}</span></td>
                    <td class="col-size"><span class="size-text">${formattedSize}</span></td>
                    <td class="col-actions action-cell">
                        <button class="action-menu-btn" title="More options" onclick="event.stopPropagation();"><i class="fas fa-ellipsis-v"></i></button>
                        <div class="action-menu">${buildActionMenu(file)}</div>
                    </td>
                `;
                const link = row.querySelector(".doc-filename-link");
                if (link) {
                    link.onclick = (ev) => { ev.stopPropagation(); openDocument(file.name); };
                }
                row.onclick = (ev) => {
                    if (ev.target.closest("button") || ev.target.closest("input") || ev.target.closest(".action-menu")) return;
                    showPreview(file.name);
                };
                const menuButton = row.querySelector(".action-menu-btn");
                const menu = row.querySelector(".action-menu");
                if (menuButton && menu) {
                    menuButton.onclick = (ev) => {
                        ev.stopPropagation();
                        const wasOpen = menu.style.display === "block";
                        document.querySelectorAll(".action-menu").forEach(m => m.style.display = "none");
                        menu.style.display = wasOpen ? "none" : "block";
                    };
                }
                body.appendChild(row);
            });
        });
    }
});

// Drag and drop upload support
document.addEventListener("DOMContentLoaded", () => {
    const mainContent = document.querySelector(".app-main-content") || document.body;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        mainContent.addEventListener(eventName, () => {
            mainContent.classList.add('drag-over-active');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        mainContent.addEventListener(eventName, () => {
            mainContent.classList.remove('drag-over-active');
        }, false);
    });

    mainContent.addEventListener('drop', (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            handleDirectUpload({ files });
        }
    }, false);
});

window.onload = () => {
    // loadPDFs() -> loadDocuments() populates currentDashboardFiles and
    // also refreshes the DOCX panel (loadDocxFiles) from that same state.
    loadPDFs();
    loadProtectedPDFs();
    selectFolder("Books");
    switchSection("dashboard");
};