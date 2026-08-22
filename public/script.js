async function parseJsonResponse(response) {

    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(
            response.ok
                ? "Server returned an invalid response."
                : `Request failed (${response.status}). Restart the server if you recently added new features.`
        );
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

async function uploadFile() {

    const file = document.getElementById("fileInput").files[0];

    if (!file) {
        alert("Please select a file.");
        return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/upload", {
        method: "POST",
        body: formData
    });

    const result = await parseJsonResponse(response);

    if (result.success) {
        alert("Uploaded: " + result.filename);
        document.getElementById("fileInput").value = ""; // Clear the input
        updateFileLabel(); // Reset label
        loadDocuments();
    } else {
        alert(result.message);
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

    // View/Preview
    if (caps.preview) {
        actions.push(`
            <button class="preview-btn" onclick="event.stopPropagation(); openDocument('${filename.replace(/'/g, "\\'")}')">
                👁 View
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

function displayDashboard(files) {

    currentDashboardFiles = Array.isArray(files) ? files : [];

    const body = document.getElementById("pdfTableBody");

    body.innerHTML = "";

    if (currentDashboardFiles.length === 0) {
        body.innerHTML = "<tr><td colspan='9' style='text-align: center; color: var(--text-muted); padding: 20px;'>No documents found.</td></tr>";
        updateSelectionHeader();
        return;
    }

    updateSelectionHeader();

    currentDashboardFiles.forEach(file => {

        const tags = Array.isArray(file.tags) ? file.tags : [];
        const tagsText = tags.length ? tags.join(", ") : "—";
        const icon = file.icon || "📄";
        const typeLabel = file.typeLabel || "Unknown";

        const row = document.createElement("tr");

        row.innerHTML = `
    <td class="view-column">
        ${selectionMode
            ? `<input type="checkbox" class="file-select-checkbox" data-filename="${file.name.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" ${selectedFiles.includes(file.name) ? "checked" : ""}>`
            : `<button class="view-btn" onclick="openDocument('${file.name.replace(/'/g, "\\'")}')"><i class="fas fa-eye"></i></button>`}
    </td>

    <td>
        <span title="${typeLabel}" style="font-size: 1.2em;">
            ${icon}
        </span>
    </td>

    <td class="name-column">
        <a href="javascript:void(0)"
           class="file-table-link"
           style="color:var(--text-primary);text-decoration:none;">
            ${file.name}
        </a>
    </td>

    <td class="tags-cell">${tagsText}</td>

    <td>${formatFileSize(file.size)}</td>

    <td>${new Date(file.modified).toLocaleDateString()}</td>

    <td>${file.owner}</td>

    <td>
        <span class="status status-normal">
            ${file.status}
        </span>
    </td>

    <td class="action-cell">

        <button class="action-menu-btn">
            ⋮
        </button>

        <div class="action-menu">
            ${buildActionMenu(file)}
        </div>

    </td>

`;

        const link = row.querySelector(".file-table-link");
        link.onclick = (e) => {
            e.stopPropagation();
            loadDocumentInfo(file);
        };

        body.appendChild(row);
        const menuButton = row.querySelector(".action-menu-btn");
        const menu = row.querySelector(".action-menu");

        const checkbox = row.querySelector(".file-select-checkbox");
        if (checkbox) {
            checkbox.addEventListener("change", () => {
                updateSelectedFile(file.name, checkbox.checked);
            });
        }

        menuButton.onclick = (e) => {
            e.stopPropagation();
            menu.style.display = (menu.style.display === "block") ? "none" : "block";
        };
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

    protectedList.innerHTML = "";
    document.getElementById("protected-count").textContent = `${result.files.length} files`;

    if (result.files.length === 0) {
        protectedList.innerHTML = "<div class='no-files-state'><p>No protected PDFs found.</p></div>";
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

    document.getElementById("documentInfo").innerHTML = `
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

    document.getElementById("current-folder-title").textContent = `Folder: ${folderName}`;

    try {
        const response = await fetch(`/pdf/folder/${encodeURIComponent(folderName)}`);
        const result = await parseJsonResponse(response);

        const folderFileList = document.getElementById("folderFileList");
        const folderCount = document.getElementById("folder-count");

        if (!result.success) {
            folderFileList.innerHTML = "<div class='no-files-state'><p>Error loading folder files.</p></div>";
            folderCount.textContent = "0 files";
            return;
        }

        folderCount.textContent = `${result.files.length} files`;
        folderFileList.innerHTML = "";

        if (result.files.length === 0) {
            folderFileList.innerHTML = "<div class='no-files-state'><p>No PDFs found in this folder.</p></div>";
            return;
        }

        result.files.forEach(file => {
            const div = document.createElement("div");
            div.className = "file-item";

            const link = document.createElement("a");
            link.href = `/pdf/folder/${encodeURIComponent(folderName)}/${encodeURIComponent(file)}`;
            link.target = "_blank";
            link.className = "file-info";
            link.innerHTML = `
                <span class="file-icon">📄</span>
                <span class="file-name">${file}</span>
            `;

            div.appendChild(link);
            folderFileList.appendChild(div);
        });

    } catch (error) {
        console.error("Error loading folder PDFs:", error);
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
    
    if (!selectionMode) {
        enterSelectionMode();
    }
    selectedFiles = [];
    updateSelectionHeader();
    const checkboxes = document.querySelectorAll("#pdfTableBody input.file-select-checkbox");
    checkboxes.forEach(cb => {
        const row = cb.closest("tr");
        if (row) {
            const tagsCell = row.querySelector(".tags-cell");
            if (tagsCell) {
                const tags = tagsCell.textContent.split(",").map(t => t.trim().toLowerCase());
                if (tags.includes(lowerTag)) {
                    cb.checked = true;
                    updateSelectedFile(cb.dataset.filename, true);
                }
            }
        }
    });
    closeSelectMenu();
}

function selectProtected() {
    if (!selectionMode) {
        enterSelectionMode();
    }
    selectedFiles = [];
    updateSelectionHeader();
    const checkboxes = document.querySelectorAll("#pdfTableBody input.file-select-checkbox");
    let count = 0;
    checkboxes.forEach(cb => {
        const row = cb.closest("tr");
        if (row) {
            const statusCell = row.querySelector(".status");
            if (statusCell && statusCell.textContent.toLowerCase().includes("protected")) {
                cb.checked = true;
                updateSelectedFile(cb.dataset.filename, true);
                count++;
            }
        }
    });
    if (count === 0) {
        alert("No protected PDFs are in the current dashboard list.");
    }
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

// Bulk Download - Download selected documents (as ZIP if multiple)
function bulkDownload() {
    if (!selectedFiles || selectedFiles.length === 0) {
        alert("Please select at least one document.");
        return;
    }

    if (selectedFiles.length === 1) {
        // Single file: direct download
        downloadDocument(selectedFiles[0]);
    } else {
        // Multiple files: download one by one (user may want ZIP in future)
        alert(
            `Downloading ${selectedFiles.length} files...\n` +
            "Files will be downloaded individually. For bulk ZIP download, please contact support."
        );
        selectedFiles.forEach(filename => {
            setTimeout(() => {
                downloadDocument(filename);
            }, 200);
        });
    }
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

// Close select menu when clicking outside
document.addEventListener("click", (e) => {
    const menu = document.getElementById("selectMenu");
    if (!menu) return;
    if (menu.style.display === "block" && !menu.contains(e.target)) {
        menu.style.display = "none";
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
            // Refresh the unified dashboard state; the DOCX panel derives
            // from currentDashboardFiles, so this re-renders both views.
            await loadDocuments();
        } else {
            setDocxStatusMessage(result.message || "DOCX upload failed.");
        }
    } catch (err) {
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

window.onload = () => {
    // loadPDFs() -> loadDocuments() populates currentDashboardFiles and
    // also refreshes the DOCX panel (loadDocxFiles) from that same state.
    loadPDFs();
    loadProtectedPDFs();
    selectFolder("Books");
    switchSection("dashboard");
};