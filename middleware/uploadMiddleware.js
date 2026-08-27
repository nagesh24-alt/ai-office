const path = require("path");
const fs = require("fs");
const multer = require("multer");
const pdfValidation = require("./validationMiddleware");

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const safeOriginalName = path.basename(file.originalname).replace(/[^a-zA-Z0-9._\- ()]/g, "_");
        cb(null, `${Date.now()}-${safeOriginalName}`);
    }
});

const upload = multer({
    storage,
    fileFilter: pdfValidation,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

module.exports = upload;