const express = require("express");
const fs = require("fs");
const path = require("path");

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
const { execFile } = require("child_process");
const upload = require("./middleware/uploadMiddleware");
const app = express();

const ALLOWED_FOLDERS = ["Books", "College", "Notes", "Projects", "Archive"];

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
                    "PDF"
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
                        console.error(`Error reading page count for ${filename}:`, e);
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
                        console.error(`Error reading page count for ${filename}:`, e);
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
//Start the server
const PORT = 3000;

app.listen(PORT, () => {
    console.log(`🚀 NeuroCore Office running at http://localhost:${PORT}`);
});