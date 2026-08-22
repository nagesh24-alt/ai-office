const express = require("express");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

console.log("[server file] loaded:", __filename);

const DATA_DIR = path.join(__dirname, "data");
const TAGS_FILE = path.join(__dirname, "data", "tags.json");
const pdfParseModule = require("pdf-parse");
let parsePdfPages;

if (typeof pdfParseModule === "function") {
    parsePdfPages = async (dataBuffer) => {
        const data = await pdfParseModule(dataBuffer);
        return data.numpages;
    };
} else if (pdfParseModule && typeof pdfParseModule.PDFParse === "function") {
    parsePdfPages = async (dataBuffer) => {
        const parser = new pdfParseModule.PDFParse({ data: dataBuffer });
        try {
            const doc = await parser.load();
            const numPages = doc.numPages;
            await parser.destroy();
            return numPages;
        } catch (err) {
            try {
                await parser.destroy();
            } catch (e) {}
            throw err;
        }
    };
} else {
    parsePdfPages = async () => "--";
}

// Helper to validate filename and prevent directory traversal
function isSafeFilename(filename) {
    if (!filename || typeof filename !== "string") {
        return false;
    }
    return path.basename(filename) === filename;
}

// Ensure tag storage exists before any tag API reads or writes.
function ensureTagsFile() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }

    } catch (err) {
        console.error("Error creating tags data directory:", err);
        return false;
    }

    try {
        if (!fs.existsSync(TAGS_FILE)) {
            fs.writeFileSync(TAGS_FILE, JSON.stringify({}, null, 4), "utf8");
        }

        return true;
    } catch (err) {
        console.error("Error creating tags file:", err);
        return false;
    }
}

// Log resolved paths at startup to diagnose duplicate-folder or cwd issues.
function logTagStorageDebugInfo() {
    console.log("[tags] __dirname:", __dirname);
    console.log("[tags] process.cwd():", process.cwd());
    console.log("[tags] TAGS_FILE:", TAGS_FILE);
    console.log("[tags] data directory exists:", fs.existsSync(DATA_DIR));
    console.log("[tags] tags.json exists:", fs.existsSync(TAGS_FILE));
}

function processDocxWithPython(filePath) {
    return new Promise((resolve, reject) => {
        const pythonExecutable = path.join(__dirname, "..", ".venv-1", "Scripts", "python.exe");
        const command = fs.existsSync(pythonExecutable) ? pythonExecutable : "python";

        execFile(
            command,
            [
                path.join(__dirname, "python", "docx_processor.py"),
                filePath
            ],
            { cwd: __dirname },
            (error, stdout, stderr) => {
                if (error) {
                    console.error(
                        "Python DOCX processor error:",
                        stderr || error.message
                    );

                    reject(new Error(stderr || error.message));
                    return;
                }

                try {
                    resolve(JSON.parse(stdout));
                } catch (parseError) {
                    console.error("Invalid Python JSON:", stdout);
                    reject(parseError);
                }
            }
        );
    });
}

function convertDocxToHtmlWithPython(filePath) {
    return new Promise((resolve, reject) => {
        const pythonExecutable = path.join(__dirname, "..", ".venv-1", "Scripts", "python.exe");
        const command = fs.existsSync(pythonExecutable) ? pythonExecutable : "python";

        execFile(
            command,
            [
                path.join(__dirname, "python", "docx_converter.py"),
                filePath
            ],
            { cwd: __dirname },
            (error, stdout, stderr) => {
                if (error) {
                    console.error(
                        "DOCX conversion error:",
                        stderr || error.message
                    );
                    reject(new Error(stderr || error.message));
                    return;
                }

                try {
                    resolve(JSON.parse(stdout));
                } catch (parseError) {
                    console.error("Invalid converter JSON:", stdout);
                    reject(parseError);
                }
            }
        );
    });
}

ensureTagsFile();
logTagStorageDebugInfo();

// Read tags from JSON file. Return an empty object if the file is missing,
// empty, unreadable, or contains invalid JSON.
function readTags() {
    if (!ensureTagsFile()) {
        return {};
    }

    try {
        const raw = fs.readFileSync(TAGS_FILE, "utf8").trim();
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.error("Error reading tags:", err);
        return {};
    }
}

// Write tags to tags.json without allowing storage errors to crash the server.
function writeTags(tagsData) {
    if (!ensureTagsFile()) {
        return false;
    }

    try {
        fs.writeFileSync(TAGS_FILE, JSON.stringify(tagsData || {}, null, 4), "utf8");
        return true;
    } catch (err) {
        console.error("Error writing tags:", err);
        return false;
    }
}
const upload = require("./middleware/uploadMiddleware");
const app = express();

const ALLOWED_FOLDERS = ["Books", "College", "Notes", "Projects", "Archive"];

// ========================================
// DOCUMENT TYPE SUPPORT & CAPABILITIES
// ========================================

// Define what file types are supported and what actions they support
const SUPPORTED_FILE_TYPES = {
    pdf: { label: "PDF", icon: "📄" },
    docx: { label: "DOCX", icon: "📝" },
    xlsx: { label: "XLSX", icon: "📊" },
    pptx: { label: "PPTX", icon: "🎨" },
    png: { label: "PNG", icon: "🖼️" },
    jpg: { label: "JPG", icon: "🖼️" },
    jpeg: { label: "JPEG", icon: "🖼️" }
};

// Define capabilities for each document type
const DOCUMENT_CAPABILITIES = {
    pdf: { 
        preview: true, 
        edit: false, 
        rename: true, 
        move: true, 
        delete: true, 
        tags: true, 
        download: true, 
        encrypt: true 
    },
    docx: { 
        preview: true, 
        edit: true, 
        rename: true, 
        move: true, 
        delete: true, 
        tags: true, 
        download: true, 
        encrypt: false 
    },
    xlsx: { 
        preview: true, 
        edit: false, 
        rename: true, 
        move: true, 
        delete: true, 
        tags: true, 
        download: true, 
        encrypt: false 
    },
    pptx: { 
        preview: true, 
        edit: false, 
        rename: true, 
        move: true, 
        delete: true, 
        tags: true, 
        download: true, 
        encrypt: false 
    },
    png: { 
        preview: true, 
        edit: false, 
        rename: true, 
        move: true, 
        delete: true, 
        tags: true, 
        download: true, 
        encrypt: false 
    },
    jpg: { 
        preview: true, 
        edit: false, 
        rename: true, 
        move: true, 
        delete: true, 
        tags: true, 
        download: true, 
        encrypt: false 
    },
    jpeg: { 
        preview: true, 
        edit: false, 
        rename: true, 
        move: true, 
        delete: true, 
        tags: true, 
        download: true, 
        encrypt: false 
    }
};

// Utility: Get file type from filename
function getFileType(filename) {
    if (!filename || typeof filename !== "string") {
        return null;
    }
    const ext = path.extname(filename).toLowerCase().slice(1); // Remove leading dot
    return ext && SUPPORTED_FILE_TYPES[ext] ? ext : null;
}

// Utility: Get capabilities for a file
function getFileCapabilities(filename) {
    const type = getFileType(filename);
    return type ? DOCUMENT_CAPABILITIES[type] : null;
}

// Utility: Check if file type is supported
function isSupportedFileType(filename) {
    const type = getFileType(filename);
    return type !== null;
}

// Utility: Get file info with metadata and capabilities
function getFileMetadata(filename, filePath, allTags = {}) {
    if (!fs.existsSync(filePath)) {
        return null;
    }

    const stats = fs.statSync(filePath);
    const type = getFileType(filename);
    const capabilities = getFileCapabilities(filename);

    const metadata = {
        name: filename,
        type: type || "unknown",
        typeLabel: SUPPORTED_FILE_TYPES[type]?.label || "Unknown",
        icon: SUPPORTED_FILE_TYPES[type]?.icon || "❓",
        size: stats.size,
        modified: stats.mtime,
        owner: "You",
        status: "Normal",
        tags: allTags[filename] || [],
        capabilities: capabilities || {}
    };

    return metadata;
}

app.use(express.json());
app.use(express.static("public"));
//upload PDF API
app.post("/upload", (req, res) => {

    upload.single("file")(req, res, (err) => {

        if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded."
            });
        }

        // ==========================
        // Smart Default Tagging
        // ==========================

        try {

            const allTags = readTags();

            if (!allTags[req.file.filename]) {

                allTags[req.file.filename] = [
                    "Uploaded",
                    (SUPPORTED_FILE_TYPES[getFileType(req.file.filename)] || {}).label || "Document"
                ];

                writeTags(allTags);

                console.log(
                    `[Auto Tags] Created default tags for ${req.file.filename}`
                );

            } else {

                console.log(
                    `[Auto Tags] Existing tags preserved for ${req.file.filename}`
                );

            }

        } catch (error) {

            console.error("Auto Tagging Error:", error);

            // Don't stop upload if tagging fails
        }

        res.json({
            success: true,
            filename: req.file.filename
        });

    });

});
// List uploaded PDFs API with real page counts
app.get("/pdfs", async (req, res) => {
    const uploadFolder = path.join(__dirname, "uploads");

    // Ensure the uploads folder exists before attempting to read it. If it does not exist, return an empty list.
    if (!fs.existsSync(uploadFolder)) {
        return res.json({
            success: true,
            total: 0,
            files: []
        });
    }
    try {
        const files = fs.readdirSync(uploadFolder);
        const allTags = readTags();

        const pdfFiles = await Promise.all(
            files
                .filter(filename => filename.toLowerCase().endsWith(".pdf"))
                .map(async (filename) => {
                    const filePath = path.join(uploadFolder, filename);
                    const stats = fs.statSync(filePath);

                    let pages = "--";
                    try {
                        pages = await parsePdfPages(dataBuffer);
                    } catch (e) {
                        console.warn(`Skipping page count for ${filename}: invalid or unreadable PDF`);
                    }

                    return {
                        name: filename,
                        size: stats.size,
                        pages: pages,
                        modified: stats.mtime,
                        owner: "You",
                        status: "Normal",
                        tags: allTags[filename] || []
                    };
                })
        );

        res.json({
            success: true,
            total: pdfFiles.length,
            files: pdfFiles
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Unable to read uploads folder."
        });
    }
});

// ========================================
// UNIFIED DOCUMENT LISTING ENDPOINT
// ========================================
// Lists all document types (PDF, DOCX, XLSX, PPTX, PNG, JPG, JPEG) from uploads folder
app.get("/documents/list", async (req, res) => {
    const uploadFolder = path.join(__dirname, "uploads");

    // Ensure the uploads folder exists
    if (!fs.existsSync(uploadFolder)) {
        return res.json({
            success: true,
            total: 0,
            files: []
        });
    }

    try {
        const files = fs.readdirSync(uploadFolder);
        const allTags = readTags();

        // Filter to supported file types only
        const documents = await Promise.all(
            files
                .filter(filename => isSupportedFileType(filename))
                .map(async (filename) => {
                    const filePath = path.join(uploadFolder, filename);
                    const type = getFileType(filename);

                    // Get basic metadata
                    const metadata = getFileMetadata(filename, filePath, allTags);

                    if (!metadata) {
                        return null;
                    }

                    // Add PDF page count if it's a PDF
                    if (type === "pdf") {
                        try {
                            const dataBuffer = fs.readFileSync(filePath);
                            metadata.pages = await parsePdfPages(dataBuffer);
                        } catch (e) {
                            console.warn(`Skipping page count for ${filename}: invalid or unreadable PDF`);
                            metadata.pages = "--";
                        }
                    }

                    return metadata;
                })
        );

        // Filter out null entries
        const validDocuments = documents.filter(doc => doc !== null);

        res.json({
            success: true,
            total: validDocuments.length,
            files: validDocuments
        });
    } catch (err) {
        console.error("Error listing documents:", err);
        res.status(500).json({
            success: false,
            message: "Unable to read uploads folder."
        });
    }
});

app.get("/docx/test", async (req, res) => {
    const testFile = path.join(__dirname, "uploads", "test.docx");

    if (!fs.existsSync(testFile)) {
        return res.status(404).json({
            success: false,
            message: "Test DOCX not found."
        });
    }

    try {
        const result = await processDocxWithPython(testFile);
        res.json(result);

    } catch (error) {
        console.error("DOCX test failed:", error);

        res.status(500).json({
            success: false,
            message: "DOCX processing failed."
        });
    }
});

// List Protected PDFs
app.get("/protected-pdfs", (req, res) => {

    const folder = path.join(__dirname, "protected");

    if (!fs.existsSync(folder)) {
        return res.json({
            success: true,
            total: 0,
            files: []
        });
    }

    fs.readdir(folder, (err, files) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to read protected folder."
            });
        }

        const pdfs = files.filter(file =>
            file.toLowerCase().endsWith(".pdf")
        );

        res.json({
            success: true,
            total: pdfs.length,
            files: pdfs
        });

    });

});

// ========================================
// COMMON DOCUMENT OPERATIONS
// ========================================
// These endpoints work with any supported document type

// Rename document (any type)
app.post("/documents/rename", (req, res) => {
    const { oldName, newName } = req.body;

    if (!oldName || !newName) {
        return res.status(400).json({
            success: false,
            message: "Old filename and new filename are required."
        });
    }

    if (!isSafeFilename(oldName) || !isSafeFilename(newName)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    if (!isSupportedFileType(newName)) {
        return res.status(400).json({
            success: false,
            message: "Unsupported file type."
        });
    }

    const oldPath = path.join(__dirname, "uploads", oldName);
    const newPath = path.join(__dirname, "uploads", newName);

    if (!fs.existsSync(oldPath)) {
        return res.status(404).json({
            success: false,
            message: "File not found."
        });
    }

    fs.rename(oldPath, newPath, (err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to rename document."
            });
        }

        // Also rename tags if they exist
        const allTags = readTags();
        if (allTags[oldName]) {
            allTags[newName] = allTags[oldName];
            delete allTags[oldName];
            writeTags(allTags);
        }

        res.json({
            success: true,
            message: "Document renamed successfully.",
            newName: newName
        });
    });
});

// Move document to folder (any type)
app.post("/documents/move", (req, res) => {
    const { filename, folder } = req.body;

    if (!filename || !folder) {
        return res.status(400).json({
            success: false,
            message: "Filename and folder are required."
        });
    }

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder. Use: " + ALLOWED_FOLDERS.join(", ")
        });
    }

    const source = path.join(__dirname, "uploads", filename);
    const destinationDir = path.join(__dirname, "documents", folder);
    const destination = path.join(destinationDir, filename);

    if (!fs.existsSync(source)) {
        return res.status(404).json({
            success: false,
            message: "Document not found."
        });
    }

    fs.mkdirSync(destinationDir, { recursive: true });

    fs.rename(source, destination, (err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to move document."
            });
        }

        res.json({
            success: true,
            message: "Document moved successfully."
        });
    });
});

// Delete document (any type)
app.post("/documents/delete", (req, res) => {
    const { filename } = req.body;

    if (!filename) {
        return res.status(400).json({
            success: false,
            message: "Filename is required."
        });
    }

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "Document not found."
        });
    }

    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to delete document."
            });
        }

        // Also delete tags if they exist
        const allTags = readTags();
        if (allTags[filename]) {
            delete allTags[filename];
            writeTags(allTags);
        }

        res.json({
            success: true,
            message: "Document deleted successfully."
        });
    });
});

// Bulk delete documents
app.post("/documents/bulk-delete", (req, res) => {
    const { filenames } = req.body;

    if (!Array.isArray(filenames) || filenames.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Filenames array is required."
        });
    }

    const results = {
        success: true,
        deleted: 0,
        failed: 0,
        errors: []
    };

    const allTags = readTags();
    let tagsUpdated = false;

    for (const filename of filenames) {
        if (!isSafeFilename(filename)) {
            results.failed++;
            results.errors.push({ filename, error: "Invalid filename" });
            continue;
        }

        const filePath = path.join(__dirname, "uploads", filename);

        if (!fs.existsSync(filePath)) {
            results.failed++;
            results.errors.push({ filename, error: "File not found" });
            continue;
        }

        try {
            fs.unlinkSync(filePath);
            results.deleted++;

            // Remove tags if they exist
            if (allTags[filename]) {
                delete allTags[filename];
                tagsUpdated = true;
            }
        } catch (err) {
            results.failed++;
            results.errors.push({ filename, error: err.message });
        }
    }

    if (tagsUpdated) {
        writeTags(allTags);
    }

    res.json(results);
});

// Bulk move documents
app.post("/documents/bulk-move", (req, res) => {
    const { filenames, folder } = req.body;

    if (!Array.isArray(filenames) || filenames.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Filenames array is required."
        });
    }

    if (!folder) {
        return res.status(400).json({
            success: false,
            message: "Destination folder is required."
        });
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder. Use: " + ALLOWED_FOLDERS.join(", ")
        });
    }

    const results = {
        success: true,
        moved: 0,
        failed: 0,
        errors: []
    };

    const destinationDir = path.join(__dirname, "documents", folder);
    fs.mkdirSync(destinationDir, { recursive: true });

    for (const filename of filenames) {
        if (!isSafeFilename(filename)) {
            results.failed++;
            results.errors.push({ filename, error: "Invalid filename" });
            continue;
        }

        const source = path.join(__dirname, "uploads", filename);
        const destination = path.join(destinationDir, filename);

        if (!fs.existsSync(source)) {
            results.failed++;
            results.errors.push({ filename, error: "File not found" });
            continue;
        }

        try {
            fs.renameSync(source, destination);
            results.moved++;
        } catch (err) {
            results.failed++;
            results.errors.push({ filename, error: err.message });
        }
    }

    res.json(results);
});

// Get document info (any supported type)
app.get("/documents/:filename/info", (req, res) => {
    const { filename } = req.params;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "Document not found."
        });
    }

    const stats = fs.statSync(filePath);
    const type = getFileType(filename);
    const typeInfo = SUPPORTED_FILE_TYPES[type] || { label: "Unknown", icon: "❓" };

    res.json({
        success: true,
        info: {
            filename: filename,
            extension: path.extname(filename),
            type: type || "unknown",
            typeLabel: typeInfo.label,
            icon: typeInfo.icon,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
            location: filePath
        }
    });
});

// Get document tags
app.get("/documents/:filename/tags", (req, res) => {
    const { filename } = req.params;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const allTags = readTags();
    const tags = allTags[filename] || [];

    res.json({
        success: true,
        filename: filename,
        tags: tags
    });
});

// Update document tags
app.post("/documents/:filename/tags", (req, res) => {
    const { filename } = req.params;
    const { tags } = req.body;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    if (!Array.isArray(tags)) {
        return res.status(400).json({
            success: false,
            message: "Tags must be an array."
        });
    }

    const allTags = readTags();
    allTags[filename] = tags;

    if (writeTags(allTags)) {
        res.json({
            success: true,
            message: "Tags updated successfully.",
            filename: filename,
            tags: tags
        });
    } else {
        res.status(500).json({
            success: false,
            message: "Unable to update tags."
        });
    }
});

// Delete document tags
app.delete("/documents/:filename/tags", (req, res) => {
    const { filename } = req.params;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const allTags = readTags();
    const { tags } = req.body || {};

    if (Array.isArray(tags) && tags.length > 0) {
        // Remove only the specified tags (case-insensitive)
        const existingTags = allTags[filename] || [];
        const updatedTags = existingTags.filter(
            existingTag =>
                !tags.some(
                    tag => tag.toLowerCase() === existingTag.toLowerCase()
                )
        );
        allTags[filename] = updatedTags;
        writeTags(allTags);

        res.json({
            success: true,
            message: "Tags removed successfully.",
            filename: filename,
            tags: updatedTags
        });
    } else {
        // No specific tags provided — delete all tags
        if (allTags[filename]) {
            delete allTags[filename];
            writeTags(allTags);
        }

        res.json({
            success: true,
            message: "All tags deleted successfully.",
            filename: filename
        });
    }
});

// Download document
app.get("/documents/download/:filename", (req, res) => {
    const { filename } = req.params;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    if (!isSupportedFileType(filename)) {
        return res.status(400).json({
            success: false,
            message: "Unsupported file type."
        });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "Document not found."
        });
    }

    res.download(filePath);
});

//Move PDFs API
app.post("/pdf/move", (req, res) => {

    const { filename, folder } = req.body;

    if (!filename || !folder) {
        return res.status(400).json({
            success: false,
            message: "Filename and folder are required."
        });
    }
    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }
    if (!ALLOWED_FOLDERS.includes(folder)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder. Use: " + ALLOWED_FOLDERS.join(", ")
        });
    }

    const source = path.join(__dirname, "uploads", filename);
    const destinationDir = path.join(__dirname, "documents", folder);
    const destination = path.join(destinationDir, filename);

    if (!fs.existsSync(source)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.mkdirSync(destinationDir, { recursive: true });

    fs.rename(source, destination, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to move PDF."
            });
        }

        res.json({
            success: true,
            message: "PDF moved successfully."
        });

    });

});
//Copy PDFs API
app.post("/pdf/copy", (req, res) => {

    const { filename, folder } = req.body;

    if (!filename || !folder) {
        return res.status(400).json({
            success: false,
            message: "Filename and folder are required."
        });
    }

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    if (!ALLOWED_FOLDERS.includes(folder)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder. Use: " + ALLOWED_FOLDERS.join(", ")
        });
    }

    const source = path.join(__dirname, "uploads", filename);
    const destinationDir = path.join(__dirname, "documents", folder);
    const destination = path.join(destinationDir, filename);

    if (!fs.existsSync(source)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.mkdirSync(destinationDir, { recursive: true });

    fs.copyFile(source, destination, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to copy PDF."
            });
        }

        res.json({
            success: true,
            message: "PDF copied successfully."
        });

    });

});
//open PDF API
app.get("/pdf/:filename", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    res.sendFile(filePath);

});

//Delete uploaded PDFs
app.delete("/pdf/:filename", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.unlink(filePath, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to delete PDF."
            });
        }

        // Clean up tags for this file
        const allTags = readTags();
        if (allTags[filename]) {
            delete allTags[filename];
            writeTags(allTags);
        }

        res.json({
            success: true,
            message: "PDF deleted successfully."
        });

    });

});
// Open Protected PDF API
app.get("/protected/:filename", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const filePath = path.join(__dirname, "protected", filename);

    if (!fs.existsSync(filePath)) {

        return res.status(404).json({
            success: false,
            message: "Protected PDF not found."
        });

    }

    res.sendFile(filePath);

});

//Delete Protected PDFs
app.delete("/protected/:filename", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const filePath = path.join(__dirname, "protected", filename);

    if (!fs.existsSync(filePath)) {

        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });

    }

    fs.unlink(filePath, (err) => {

        if (err) {

            return res.status(500).json({
                success: false,
                message: "Unable to delete PDF."
            });

        }

        res.json({
            success: true,
            message: "PDF deleted successfully."
        });

    });

});
//Search PDFs
app.get("/pdfs/search", async (req, res) => {

    const query = req.query.q?.toLowerCase() || "";

    const uploadFolder = path.join(__dirname, "uploads");

    // Ensure uploads folder exists before searching.
    if (!fs.existsSync(uploadFolder)) {
        return res.json({
            success: true,
            total: 0,
            files: []
        });
    }

    try {
        const files = fs.readdirSync(uploadFolder);
        const allTags = readTags();

        const pdfFiles = await Promise.all(
            files
                .filter(filename => filename.toLowerCase().endsWith(".pdf"))
                .map(async (filename) => {
                    const filePath = path.join(uploadFolder, filename);
                    const stats = fs.statSync(filePath);

                    let pages = "--";
                    try {
                        pages = await parsePdfPages(dataBuffer);
                    } catch (e) {
                        console.warn(`Skipping page count for ${filename}: invalid or unreadable PDF`);
                    }

                    return {
                        name: filename,
                        size: stats.size,
                        pages: pages,
                        modified: stats.mtime,
                        owner: "You",
                        status: "Normal",
                        tags: allTags[filename] || []
                    };
                })
        );

        // Filter based on query (checks filename or tags)
        const filtered = pdfFiles.filter(file => {
            const nameMatch = file.name.toLowerCase().includes(query);
            const tagMatch = file.tags.some(tag => tag.toLowerCase().includes(query));
            return nameMatch || tagMatch;
        });

        res.json({
            success: true,
            total: filtered.length,
            files: filtered
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Unable to search PDFs."
        });
    }

});
//Rename PDFs
app.patch("/pdf/:filename", (req, res) => {

    const oldFilename = req.params.filename;
    const newFilename = req.query.newName;

    if (!isSafeFilename(oldFilename) || !isSafeFilename(newFilename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const oldPath = path.join(__dirname, "uploads", oldFilename);
    const newPath = path.join(__dirname, "uploads", newFilename);

    if (!fs.existsSync(oldPath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.rename(oldPath, newPath, (err) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to rename PDF."
            });
        }

        // Rename tags in tags.json
        const allTags = readTags();
        if (allTags[oldFilename]) {
            allTags[newFilename] = allTags[oldFilename];
            delete allTags[oldFilename];
            writeTags(allTags);
        }

        res.json({
            success: true,
            message: "PDF renamed successfully."
        });

    });

});
//document information API
app.get("/pdf/:filename/info", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.stat(filePath, (err, stats) => {

        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to read file information."
            });
        }

        res.json({
            success: true,
            info: {
                filename: filename,
                extension: path.extname(filename),
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                location: filePath
            }
        });

    });

});
//PDF encryption API
app.post("/pdf/protect", (req, res) => {

    const { filename, password } = req.body;

    if (!filename || !password) {
        return res.status(400).json({
            success: false,
            message: "Filename and password are required."
        });
    }
    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const input = path.join(__dirname, "uploads", filename);
    const protectedDir = path.join(__dirname, "protected");
    
    // Robust naming using extname and basename
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const output = path.join(protectedDir, base + "_protected" + ext);

    if (!fs.existsSync(input)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.mkdirSync(protectedDir, { recursive: true });

    const ownerPassword = "NeuroCoreOfficeOwner123";

    execFile(
        "qpdf",
        [
            "--encrypt",
            password,
            ownerPassword,
            "256",
            "--print=full",
            "--modify=all",
            "--extract=y",
            "--",
            input,
            output
        ],
        (error, stdout, stderr) => {

            if (error) {
                return res.status(500).json({
                    success: false,
                    message: stderr || error.message
                });
            }

            // Remove the original unprotected file
            fs.unlink(input, (unlinkErr) => {
                if (unlinkErr) {
                    console.error("Failed to delete original file after protection:", unlinkErr);
                }
            });

            res.json({
                success: true,
                message: "PDF encrypted successfully. Saved to protected folder.",
                file: path.basename(output)
            });

        }
    );

});

// Remove password / decrypt protected PDF API
app.post("/pdf/unprotect", (req, res) => {

    const { filename, password } = req.body;

    if (!filename || !password) {
        return res.status(400).json({
            success: false,
            message: "Filename and password are required."
        });
    }
    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const protectedPath = path.join(__dirname, "protected", filename);

    if (!fs.existsSync(protectedPath)) {
        return res.status(404).json({
            success: false,
            message: "Protected PDF not found."
        });
    }

    const uploadsDir = path.join(__dirname, "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    // Strip the _protected suffix if present to restore original name robustly
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const baseName = base.endsWith("_protected")
        ? base.slice(0, -10) + ext
        : filename;

    const outputPath = path.join(uploadsDir, baseName);

    execFile(
        "qpdf",
        [
            "--password=" + password,
            "--decrypt",
            protectedPath,
            outputPath
        ],
        (error, stdout, stderr) => {

            if (error) {
                const lowerStderr = stderr ? stderr.toLowerCase() : "";
                const message =
                    lowerStderr.includes("incorrect password") || lowerStderr.includes("invalid password")
                        ? "Invalid Password please try again later"
                        : stderr || error.message;

                return res.status(400).json({
                    success: false,
                    message
                });
            }

            fs.unlink(protectedPath, (unlinkError) => {

                if (unlinkError) {
                    return res.status(500).json({
                        success: false,
                        message: "File decrypted, but protected copy could not be removed."
                    });
                }

                res.json({
                    success: true,
                    message: "Password removed. File moved to uploads and removed from protected folder.",
                    file: path.basename(outputPath)
                });

            });

        }
    );

});
// PDF Permission Restrictions API
app.post("/pdf/permissions", (req, res) => {

    const {
        filename,
        password,
        allowPrint,
        allowCopy,
        allowEdit
    } = req.body;

    // Validate filename
    if (!filename || typeof filename !== "string" || path.basename(filename) !== filename || !filename.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    // Validate password
    if (!password) {
        return res.status(400).json({
            success: false,
            message: "Missing password."
        });
    }

    const input = path.join(__dirname, "uploads", filename);

    const protectedDir = path.join(__dirname, "protected");
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const output = path.join(protectedDir, base + "_protected" + ext);

    // Validate if PDF exists
    if (!fs.existsSync(input)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    fs.mkdirSync(protectedDir, { recursive: true });

    // Ensure owner password is distinct from user password so restrictions are enforced
    const ownerPassword = "NeuroCoreOfficeOwner123";

    // Default permissions
    let printPermission = "--print=full";
    let modifyPermission = "--modify=all";
    let extractPermission = "--extract=y";

    if (!allowPrint)
        printPermission = "--print=none";

    if (!allowEdit)
        modifyPermission = "--modify=none";

    if (!allowCopy)
        extractPermission = "--extract=n";

    execFile(
        "qpdf",
        [
            "--encrypt",
            password,
            ownerPassword,
            "256",
            printPermission,
            modifyPermission,
            extractPermission,
            "--",
            input,
            output
        ],
        (error, stdout, stderr) => {

            if (error) {
                console.error("QPDF Error:", stderr || error.message);
                if (error.code === "ENOENT") {
                    return res.status(500).json({
                        success: false,
                        message: "QPDF execution failure."
                    });
                }
                return res.status(500).json({
                    success: false,
                    message: "Permission application failure."
                });
            }

            // Remove the original unprotected file
            fs.unlink(input, (unlinkErr) => {
                if (unlinkErr) {
                    console.error("Failed to delete original file after protection:", unlinkErr);
                }
            });

            res.json({
                success: true,
                message: "PDF protected and permissions applied successfully.",
                file: path.basename(output)
            });

        }
    );

});

// Change Password API
app.post("/pdf/change-password", (req, res) => {

    const { filename, currentPassword, newPassword } = req.body;

    // Validation
    if (!filename || !currentPassword || !newPassword) {
        return res.status(400).json({
            success: false,
            message: "Filename, current password and new password are required."
        });
    }
    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const protectedDir = path.join(__dirname, "protected");
    const tempDir = path.join(__dirname, "temp");

    fs.mkdirSync(tempDir, { recursive: true });

    const input = path.join(protectedDir, filename);

    // Robust temp name using extname and basename
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    const tempFile = path.join(tempDir, base + "_temp" + ext);

    // Check whether the protected PDF exists
    if (!fs.existsSync(input)) {
        return res.status(404).json({
            success: false,
            message: "Protected PDF not found."
        });
    }

    // Step 1: Decrypt using current password
    execFile(
        "qpdf",
        [
            `--password=${currentPassword}`,
            "--decrypt",
            input,
            tempFile
        ],
        (decryptError) => {

            if (decryptError) {
                return res.status(400).json({
                    success: false,
                    message: "Current password is incorrect."
                });
            }

            // Step 2: Encrypt again with the new password and stable owner password
            const ownerPassword = "NeuroCoreOfficeOwner123";
            execFile(
                "qpdf",
                [
                    "--encrypt",
                    newPassword,
                    ownerPassword,
                    "256",
                    "--",
                    tempFile,
                    input
                ],
                (encryptError) => {

                    // Delete temporary file
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }

                    if (encryptError) {
                        return res.status(500).json({
                            success: false,
                            message: "Unable to change password."
                        });
                    }

                    res.json({
                        success: true,
                        message: "Password changed successfully."
                    });

                }
            );

        }
    );

});

// List PDFs in folder API
app.get("/pdf/folder/:folder", (req, res) => {
    const { folder } = req.params;

    if (!ALLOWED_FOLDERS.includes(folder)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder name."
        });
    }

    const folderPath = path.join(__dirname, "documents", folder);

    if (!fs.existsSync(folderPath)) {
        return res.json({
            success: true,
            total: 0,
            files: []
        });
    }

    fs.readdir(folderPath, (err, files) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: "Unable to read folder."
            });
        }

        const pdfFiles = files.filter(file =>
            file.toLowerCase().endsWith(".pdf")
        );

        res.json({
            success: true,
            total: pdfFiles.length,
            files: pdfFiles
        });
    });
});

// Open PDF from folder API
app.get("/pdf/folder/:folder/:filename", (req, res) => {
    const { folder, filename } = req.params;

    if (!ALLOWED_FOLDERS.includes(folder) || !isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid folder name or filename."
        });
    }

    const filePath = path.join(__dirname, "documents", folder, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({
            success: false,
            message: "PDF not found."
        });
    }

    res.sendFile(filePath);
});
// =============================
// Get Tags
// =============================

app.get("/pdf/:filename/tags", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const allTags = readTags();

    res.json({

        success: true,

        filename,

        tags: allTags[filename] || []

    });

});
// =============================
// Save Tags
// =============================
app.post("/pdf/:filename/tags", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const { tags } = req.body || {};

    if (!Array.isArray(tags)) {

        return res.status(400).json({

            success: false,

            message: "Tags must be an array."

        });

    }

    const allTags = readTags();

    const existingTags = allTags[filename] || [];

    // Case-insensitive uniqueness check using a Set
    const existingTagsLower = new Set(existingTags.map(tag => tag.toLowerCase()));
    const tagsToAdd = [];

    for (const tag of tags) {
        if (typeof tag === "string") {
            const trimmedTag = tag.trim();
            const lowerTag = trimmedTag.toLowerCase();
            if (trimmedTag && !existingTagsLower.has(lowerTag)) {
                tagsToAdd.push(trimmedTag);
                existingTagsLower.add(lowerTag);
            }
        }
    }

    const updatedTags = [...existingTags, ...tagsToAdd];
    allTags[filename] = updatedTags;

    writeTags(allTags);

    res.json({

        success: true,

        filename: filename,

        tags: updatedTags

    });

});
// =============================
// Update Tags
// =============================

app.patch("/pdf/:filename/tags", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const { tags } = req.body || {};

    if (!Array.isArray(tags)) {

        return res.status(400).json({

            success: false,

            message: "Tags must be an array."

        });

    }

    const allTags = readTags();

    allTags[filename] = tags;

    writeTags(allTags);

    res.json({

        success: true,

        message: "Tags updated successfully."

    });

});
// =============================
// Delete Tags
// =============================

app.delete("/pdf/:filename/tags", (req, res) => {

    const filename = req.params.filename;

    if (!isSafeFilename(filename)) {
        return res.status(400).json({
            success: false,
            message: "Invalid filename."
        });
    }

    const { tags } = req.body || {};

    if (!Array.isArray(tags)) {
        return res.status(400).json({
            success: false,
            message: "Tags must be an array."
        });
    }

    const allTags = readTags();

    const existingTags = allTags[filename] || [];

    // Remove only the selected tags
    const updatedTags = existingTags.filter(
        existingTag =>
            !tags.some(
                tag =>
                    tag.toLowerCase() === existingTag.toLowerCase()
            )
    );

    allTags[filename] = updatedTags;

    writeTags(allTags);

    res.json({
        success: true,
        filename,
        tags: updatedTags
    });

});
// Start the server (app routes should be defined before this)
const PORT = 3000;

// DOCX preview route: returns converted HTML JSON
app.get("/docx/preview/:filename", async (req, res) => {
    try {
        const filename = path.basename(req.params.filename);
        console.log('[route] /docx/preview hit for:', filename);

        if (path.extname(filename).toLowerCase() !== ".docx") {
            return res.status(400).json({
                success: false,
                message: "Only DOCX files are supported."
            });
        }

        const filePath = path.join(__dirname, "uploads", filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: "DOCX file not found."
            });
        }

        const result = await convertDocxToHtmlWithPython(filePath);

        if (!result || !result.success) {
            return res.status(500).json({
                success: false,
                message: result?.error || "DOCX conversion failed."
            });
        }

        res.json({
            success: true,
            filename,
            html: result.html,
            messages: result.messages || []
        });
    } catch (error) {
        console.error("DOCX preview failed:", error);
        res.status(500).json({
            success: false,
            message: "Unable to generate DOCX preview."
        });
    }
});

// =============================================================
// DOCX Feature Routes (Upload / List / Download / Delete / Edit / Save)
// Purely additive — none of the PDF routes above are modified, and
// these DOCX routes share the existing "uploads" folder so the
// current /docx/preview/:filename route above keeps working as-is.
// =============================================================

let multer;
try {
    multer = require("multer");
} catch (e) {
    console.error(
        "The 'multer' package is required for DOCX uploads. Run `npm install multer`."
    );
}

if (multer) {
    const docxUploadStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(__dirname, "uploads");
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => {
            const safeOriginal = path
                .basename(file.originalname)
                .replace(/[^a-zA-Z0-9._-]/g, "_");
            cb(null, `${Date.now()}-${safeOriginal}`);
        }
    });

    const docxUpload = multer({
        storage: docxUploadStorage,
        fileFilter: (req, file, cb) => {
            cb(null, path.extname(file.originalname).toLowerCase() === ".docx");
        },
        limits: { fileSize: 25 * 1024 * 1024 } // 25MB
    });

    // Upload a DOCX file
    app.post("/docx/upload", (req, res) => {
        docxUpload.single("file")(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message });
            }
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    message: "No DOCX file uploaded (only .docx is accepted)."
                });
            }
            res.json({ success: true, filename: req.file.filename });
        });
    });
}

// List uploaded DOCX files
app.get("/docx/list", (req, res) => {
    const uploadFolder = path.join(__dirname, "uploads");

    if (!fs.existsSync(uploadFolder)) {
        return res.json({ success: true, total: 0, files: [] });
    }

    try {
        const files = fs.readdirSync(uploadFolder)
            .filter(filename => filename.toLowerCase().endsWith(".docx"))
            .map(filename => {
                const stats = fs.statSync(path.join(uploadFolder, filename));
                return {
                    name: filename,
                    size: stats.size,
                    modified: stats.mtime
                };
            });

        res.json({ success: true, total: files.length, files });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Unable to read uploads folder."
        });
    }
});

// Download / open the raw DOCX file
app.get("/docx/file/:filename", (req, res) => {
    const filename = req.params.filename;

    if (!isSafeFilename(filename) || path.extname(filename).toLowerCase() !== ".docx") {
        return res.status(400).json({ success: false, message: "Invalid filename." });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: "DOCX file not found." });
    }

    res.sendFile(filePath);
});

// Delete a DOCX file (and its edit backup, if any)
app.delete("/docx/:filename", (req, res) => {
    const filename = req.params.filename;

    if (!isSafeFilename(filename) || path.extname(filename).toLowerCase() !== ".docx") {
        return res.status(400).json({ success: false, message: "Invalid filename." });
    }

    const filePath = path.join(__dirname, "uploads", filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: "DOCX file not found." });
    }

    fs.unlink(filePath, (err) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Unable to delete DOCX." });
        }

        const backupPath = filePath + ".bak";
        if (fs.existsSync(backupPath)) {
            fs.unlink(backupPath, () => {});
        }

        res.json({ success: true, message: "DOCX deleted successfully." });
    });
});

// Load editable paragraph text (used by the DOCX editing UI)
app.get("/docx/edit/:filename", async (req, res) => {
    try {
        const filename = path.basename(req.params.filename);

        if (path.extname(filename).toLowerCase() !== ".docx") {
            return res.status(400).json({
                success: false,
                message: "Only DOCX files are supported."
            });
        }

        const filePath = path.join(__dirname, "uploads", filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: "DOCX file not found." });
        }

        const result = await processDocxWithPython(filePath);
        res.json(result);
    } catch (error) {
        console.error("DOCX edit-load failed:", error);
        res.status(500).json({
            success: false,
            message: "Unable to load DOCX for editing."
        });
    }
});

function saveDocxWithPython(filePath, paragraphs) {
    return new Promise((resolve, reject) => {
        const pythonExecutable = path.join(__dirname, "..", ".venv-1", "Scripts", "python.exe");
        const command = fs.existsSync(pythonExecutable) ? pythonExecutable : "python";

        const tempDir = path.join(__dirname, "temp");
        fs.mkdirSync(tempDir, { recursive: true });
        const payloadPath = path.join(tempDir, `docx-save-${Date.now()}-${Math.round(Math.random() * 1e6)}.json`);
        fs.writeFileSync(payloadPath, JSON.stringify({ paragraphs }), "utf8");

        execFile(
            command,
            [
                path.join(__dirname, "python", "docx_editor.py"),
                filePath,
                payloadPath
            ],
            { cwd: __dirname },
            (error, stdout, stderr) => {
                fs.unlink(payloadPath, () => {});

                if (error) {
                    console.error("DOCX save error:", stderr || error.message);
                    reject(new Error(stderr || error.message));
                    return;
                }

                try {
                    resolve(JSON.parse(stdout));
                } catch (parseError) {
                    console.error("Invalid DOCX editor JSON:", stdout);
                    reject(parseError);
                }
            }
        );
    });
}

// Save edited text back into the DOCX file.
// Text-level round-trip only (see docx_editor.py docstring for scope);
// a ".bak" backup of the original is kept the first time a file is saved.
app.post("/docx/save/:filename", async (req, res) => {
    try {
        const filename = path.basename(req.params.filename);

        if (path.extname(filename).toLowerCase() !== ".docx") {
            return res.status(400).json({
                success: false,
                message: "Only DOCX files are supported."
            });
        }

        const { paragraphs } = req.body || {};

        if (!Array.isArray(paragraphs)) {
            return res.status(400).json({
                success: false,
                message: "paragraphs must be an array of strings."
            });
        }

        const originalPath = path.join(__dirname, "uploads", filename);

        if (!fs.existsSync(originalPath)) {
            return res.status(404).json({ success: false, message: "DOCX file not found." });
        }

        // Create an edited copy so the original is never overwritten.
        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        const editedName = `${base}_edited${ext}`;
        const editedPath = path.join(__dirname, "uploads", editedName);

        try {
            // Copy original to editedPath (overwrite if a previous edited copy exists)
            fs.copyFileSync(originalPath, editedPath);
        } catch (copyErr) {
            console.error("Failed to create edited copy:", copyErr);
            return res.status(500).json({ success: false, message: "Unable to prepare edited DOCX." });
        }

        // Attempt to save into the edited copy. On failure, remove the edited copy
        // so we don't leave partial files around, and preserve the original.
        let result;
        try {
            result = await saveDocxWithPython(editedPath, paragraphs);
        } catch (saveErr) {
            console.error("DOCX save failed (edited copy):", saveErr);
            try {
                if (fs.existsSync(editedPath)) fs.unlinkSync(editedPath);
            } catch (unlinkErr) {
                console.error("Failed to cleanup edited copy after save failure:", unlinkErr);
            }
            return res.status(500).json({ success: false, message: "Unable to save DOCX changes." });
        }

        if (!result || !result.success) {
            // On logical failure reported by python side, remove edited file and bubble error.
            try {
                if (fs.existsSync(editedPath)) fs.unlinkSync(editedPath);
            } catch (unlinkErr) {
                console.error("Failed to cleanup edited copy after logical save failure:", unlinkErr);
            }
            return res.status(500).json({
                success: false,
                message: result?.error || "DOCX save failed."
            });
        }

        // Success: return the edited filename so UI can offer download/open without
        // modifying the original file.
        res.json(Object.assign({}, result, { editedFilename: editedName }));
    } catch (error) {
        console.error("DOCX save failed:", error);
        res.status(500).json({
            success: false,
            message: "Unable to save DOCX changes."
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 NeuroCore Office running at http://localhost:${PORT}`);
});