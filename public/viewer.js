// DOCX Viewer — standalone page (opened via viewer.html?file=<name>.docx)
// Talks only to the additive /docx/* backend routes; does not touch any
// PDF-related endpoints or state.

const params = new URLSearchParams(window.location.search);
const filename = params.get("file");

let editableParagraphs = [];

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}

function setStatus(message, isError = false) {
    const el = document.getElementById("statusMsg");
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? "var(--danger)" : "var(--text-secondary)";
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
            throw new Error(`Request failed (${response.status}). ${text.slice(0, 120)}`);
        }
        return { success: true, message: text, raw: text };
    }
}

async function loadPreview() {
    const previewEl = document.getElementById("previewContent");
    setStatus("Loading preview…");

    try {
        const response = await fetch("/docx/preview/" + encodeURIComponent(filename));
        const data = await parseJsonResponse(response);

        if (!data.success) {
            throw new Error(data.message || "Preview failed.");
        }

        previewEl.innerHTML = data.html;

        const noteCount = Array.isArray(data.messages) ? data.messages.length : 0;
        setStatus(
            noteCount > 0
                ? `Loaded — ${noteCount} formatting note(s) from the converter`
                : "Loaded"
        );
    } catch (err) {
        previewEl.innerHTML = `<p class="viewer-error">Could not render preview: ${escapeHtml(err.message)}</p>`;
        setStatus("Preview failed", true);
    }
}

async function enterEditMode() {
    setStatus("Loading editable text…");

    try {
        const response = await fetch("/docx/edit/" + encodeURIComponent(filename));
        const data = await parseJsonResponse(response);

        if (!data.success) {
            throw new Error(data.message || "Could not load editable text.");
        }

        editableParagraphs = Array.isArray(data.paragraphs) ? data.paragraphs : [];
        renderEditor();

        document.getElementById("previewPane").style.display = "none";
        document.getElementById("editPane").style.display = "block";

        setStatus(
            editableParagraphs.length > 0
                ? `${editableParagraphs.length} paragraph(s) ready to edit`
                : "No text paragraphs found to edit"
        );
    } catch (err) {
        setStatus("Failed to load editable text: " + err.message, true);
    }
}

function renderEditor() {
    const container = document.getElementById("editorParagraphs");
    container.innerHTML = "";

    editableParagraphs.forEach((text) => {
        const wrap = document.createElement("div");
        wrap.className = "editor-para";

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.rows = Math.min(10, Math.max(2, Math.ceil(text.length / 80)));

        wrap.appendChild(textarea);
        container.appendChild(wrap);
    });
}

function exitEditMode() {
    document.getElementById("editPane").style.display = "none";
    document.getElementById("previewPane").style.display = "block";
}

async function saveChanges() {
    const textareas = document.querySelectorAll("#editorParagraphs textarea");
    const updated = Array.from(textareas).map((t) => t.value);

    setStatus("Saving…");

    try {
        const response = await fetch("/docx/save/" + encodeURIComponent(filename), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paragraphs: updated })
        });

        const data = await parseJsonResponse(response);

        if (!data.success) {
            throw new Error(data.message || data.error || "Save failed.");
        }

        setStatus(`Saved (${data.paragraphs_changed || 0} paragraph(s) changed). Backup: ${data.backup || filename + ".bak"}`);
        exitEditMode();
        await loadPreview();
    } catch (err) {
        setStatus("Save failed: " + err.message, true);
    }
}

function downloadOriginal() {
    window.open("/docx/file/" + encodeURIComponent(filename), "_blank");
}

function openWordEditorTab() {
    const target = filename ? encodeURIComponent(filename) : "";
    window.location.href = `/word-editor.html?file=${target}`;
}

async function init() {
    const docTitle = document.getElementById("docTitle");
    const editToggleBtn = document.getElementById("editToggleBtn");

    if (!filename) {
        if (docTitle) docTitle.textContent = "No file specified";
        setStatus("Open this page as viewer.html?file=yourfile.docx", true);
        if (editToggleBtn) editToggleBtn.disabled = true;
        return;
    }

    if (docTitle) docTitle.textContent = filename;
    await loadPreview();
}

document.addEventListener("DOMContentLoaded", init);