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

function setProtectedStatusMessage(message, isError = true) {

    const status = document.getElementById("protectedStatusMessage");

    if (!status)
        return;

    status.textContent = message || "";
    status.style.display = message ? "block" : "none";
    status.style.color = isError ? "#ff4d4f" : "#22c55e";

}

async function uploadFile() {

    const file = document.getElementById("fileInput").files[0];

    if (!file) {
        alert("Please select a PDF.");
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
        loadPDFs();
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
function displayDashboard(files) {

    const body = document.getElementById("pdfTableBody");

    body.innerHTML = "";

    if (!files || files.length === 0) {
        body.innerHTML = "<tr><td colspan='10' style='text-align: center; color: var(--text-muted); padding: 20px;'>No PDFs found.</td></tr>";
        document.getElementById("recent-count").textContent = "0 files";
        return;
    }

    document.getElementById("recent-count").textContent = `${files.length} files`;

    files.forEach(file => {

        const tags = Array.isArray(file.tags) ? file.tags : [];
        const tagsText = tags.length ? tags.join(", ") : "—";

        const row = document.createElement("tr");

        row.innerHTML = `
    <td class="view-column">
        <button
            class="view-btn"
            onclick="openPDF('${file.name}')">
            <i class="fas fa-eye"></i>
        </button>
    </td>

    <td>📄</td>

    <td class="name-column">
        <a href="/pdf/${encodeURIComponent(file.name)}"
           target="_blank"
           class="file-table-link"
           style="color:var(--text-primary);text-decoration:none;">
            ${file.name}
        </a>
    </td>

    <td>${tagsText}</td>

    <td>${formatFileSize(file.size)}</td>

    <td>${file.pages ?? "--"}</td>

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

            <button class="preview-btn"
                onclick="event.stopPropagation(); showPreview('${file.name.replace(/'/g, "\\'")}')">
                👁 Preview
            </button>

            <button class="rename-btn"
                onclick="event.stopPropagation(); renameDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                ✏ Rename
            </button>

            <button class="move-btn"
                onclick="event.stopPropagation(); moveDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                📂 Move
            </button>

            <button class="copy-btn"
                onclick="event.stopPropagation(); copyDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                📄 Copy
            </button>

            <button class="protect-btn"
                onclick="event.stopPropagation(); openProtectModal('${file.name.replace(/'/g, "\\'")}')">
                🔒 Protect
            </button>

            <button class="tags-btn"
                onclick="event.stopPropagation(); openTagManager('${file.name.replace(/'/g, "\\'")}')">
                🏷 Manage Tags
            </button>

            <button class="delete-btn"
                onclick="event.stopPropagation(); deleteDashboardPDF('${file.name.replace(/'/g, "\\'")}')">
                🗑 Delete
            </button>

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

        menuButton.onclick = (e) => {
            e.stopPropagation();
            menu.style.display = (menu.style.display === "block") ? "none" : "block";
        };
    });
}

// Open PDF Workspace in a new tab
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
        const response = await fetch("/pdf/" + encodeURIComponent(filename) + "/info");
        const result = await parseJsonResponse(response);

        if (!result.success) {
            infoPanel.innerHTML = `<p style="color:#ff4d4f; padding:12px;">Failed to load document info.</p>`;
            return;
        }

        const info = result.info;

        infoPanel.innerHTML = `
            <div class="preview-panel-content">
                <div class="preview-thumbnail" style="margin-bottom:16px; border-radius:8px; overflow:hidden; border:1px solid var(--border-color, #2a2e39); background:var(--card-bg, #1a1d24);">
                    <canvas id="previewCanvas" style="width:100%; display:block; min-height:180px;"></canvas>
                </div>

                <h4 style="margin:0 0 12px; color:var(--text-primary); font-size:15px; font-weight:600; word-break:break-all;">
                    📄 ${info.filename}
                </h4>

                <div class="info-details">
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
                    <button class="action-btn btn-primary" style="width:100%; display:flex; align-items:center; justify-content:center; gap:8px;" onclick="openPDF('${filename.replace(/'/g, "\\'")}')">
                        <i class="fas fa-external-link-alt"></i> Open in Workspace
                    </button>
                </div>
            </div>
        `;

        // Render first-page thumbnail using pdf.js
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
    } catch (err) {
        infoPanel.innerHTML = `<p style="color:#ff4d4f; padding:12px;">Error: ${err.message}</p>`;
    }
}

async function deleteDashboardPDF(file) {


    if (!confirm(`Delete "${file}"?`))
        return;

    try {
        const response = await fetch("/pdf/" + encodeURIComponent(file), {
            method: "DELETE"
        });

        const result = await parseJsonResponse(response);

        alert(result.message);

        loadPDFs();
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
async function loadPDFs() {

    const response = await fetch("/pdfs");

    const result = await parseJsonResponse(response);

    if (result.success) {
        displayDashboard(result.files);
    }

}

// Search PDFs
async function searchPDFs() {

    const keyword = document.getElementById("searchInput").value;

    if (keyword.trim() === "") {
        loadPDFs();
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

    const response = await fetch(
        "/pdf/" + encodeURIComponent(file) + "/info"
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
    if (!newName.toLowerCase().endsWith(".pdf")) {
        newName += ".pdf";
    }

    try {
        const response = await fetch(`/pdf/${encodeURIComponent(currentFileToRename)}?newName=${encodeURIComponent(newName)}`, {
            method: "PATCH"
        });

        const result = await parseJsonResponse(response);

        if (response.ok && result.success) {
            closeRenameModal();
            alert(result.message || "PDF renamed successfully!");
            loadPDFs();
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
        const response = await fetch("/pdf/move", {
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
            alert(result.message || "PDF moved successfully!");
            loadPDFs();
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
    document.body.classList.add("selection-mode");
    closeSelectMenu();
}

function selectAllFiles() {
    const checkboxes = document.querySelectorAll("#pdfTableBody input[type=checkbox]");
    checkboxes.forEach(cb => cb.checked = true);
    closeSelectMenu();
}

function selectByTag() {
    const tag = prompt("Enter tag to select:");
    if (!tag) return;
    const lowerTag = tag.trim().toLowerCase();
    
    const checkboxes = document.querySelectorAll("#pdfTableBody input[type=checkbox]");
    checkboxes.forEach(cb => {
        const row = cb.closest("tr");
        if (row) {
            const tagsCell = row.querySelector(".tags-cell");
            if (tagsCell) {
                const tags = tagsCell.textContent.split(",").map(t => t.trim().toLowerCase());
                if (tags.includes(lowerTag)) {
                    cb.checked = true;
                }
            }
        }
    });
    closeSelectMenu();
}

function selectProtected() {
    const checkboxes = document.querySelectorAll("#pdfTableBody input[type=checkbox]");
    let count = 0;
    checkboxes.forEach(cb => {
        const row = cb.closest("tr");
        if (row) {
            const statusCell = row.querySelector(".status");
            if (statusCell && statusCell.textContent.toLowerCase().includes("protected")) {
                cb.checked = true;
                count++;
            }
        }
    });
    if (count === 0) {
        alert("No protected PDFs are in the current dashboard list.");
    }
    closeSelectMenu();
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
        const response = await fetch(`/pdf/${encodeURIComponent(filename)}/tags`);
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
        const response = await fetch(`/pdf/${encodeURIComponent(currentFileForTags)}/tags`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                tags: [tag]
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
        const response = await fetch(`/pdf/${encodeURIComponent(filename)}/tags`, {
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

window.onload = () => {
    loadPDFs();
    loadProtectedPDFs();
    selectFolder("Books");
    switchSection("dashboard");
};
