const path = require("path");

const pdfValidation = (req, file, cb) => {
    const allowedMimeTypes = [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "application/vnd.ms-powerpoint",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
        "image/svg+xml",
        "text/csv",
        "text/plain",
        "application/octet-stream"
    ];

    const allowedExtensions = [
        ".pdf",
        ".docx",
        ".doc",
        ".xlsx",
        ".xls",
        ".pptx",
        ".ppt",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".svg",
        ".csv",
        ".txt"
    ];

    const ext = path.extname(file.originalname || "").toLowerCase();
    const hasValidExt = allowedExtensions.includes(ext);
    const hasValidMime = allowedMimeTypes.includes(file.mimetype);

    if (hasValidExt || hasValidMime) {
        cb(null, true);
    } else {
        cb(new Error("Unsupported file type. Allowed: PDF, DOCX, XLSX, PPTX, PNG, JPG."), false);
    }
};

module.exports = pdfValidation;