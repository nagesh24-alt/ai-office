const multer = require("multer");
const pdfValidation = require("./validationMiddleware");

const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage,fileFilter: pdfValidation });

module.exports = upload;