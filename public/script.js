function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  document.getElementById(tab).style.display = "block";
}

function formatText(cmd, value = null) {
  document.execCommand(cmd, false, value);
}

// Default open
showTab("editor");

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
    }
    else if (data.type === "docx") {
      preview.innerHTML = data.content; // DOCX uses innerHTML
    }
    else if (data.type === "image") {
      preview.innerHTML =
        `<img src="${data.content}" style="max-width:100%">`;
    }
    else if (data.type === "pdf") {
      preview.innerHTML =
        `<iframe src="${data.content}" width="100%" height="500px" style="border:none;"></iframe>`;
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
    }
    else {
      preview.innerText = "Preview not supported for this file type.";
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
