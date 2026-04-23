const express = require("express");
const cors = require("cors");

// ✅ New additions (safe)
const multer = require("multer");
const fs = require("fs");
const mammoth = require("mammoth");
const XLSX = require("xlsx");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ✅ Keep your existing routes
app.get("/", (req, res) => {
  res.send("AI Office Server Running 🚀");
});

// ✅ Keep your AI route (DON’T REMOVE)
app.post("/ai-edit", (req, res) => {
  // your AI logic here
});

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ file: req.file.filename });
});

app.get("/read/:filename", async (req, res) => {
  const filePath = `uploads/${req.params.filename}`;
  const ext = req.params.filename.split(".").pop();

  try {
    if (ext === "docx") {
      const result = await mammoth.extractRawText({ path: filePath });
      res.json({ content: result.value });
    } 
    else if (ext === "xlsx") {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet);
      res.json({ content: JSON.stringify(data, null, 2) });
    } 
    else {
      const data = fs.readFileSync(filePath, "utf8");
      res.json({ content: data });
    }
  } catch (err) {
    res.status(500).send("Error reading file");
  }
});

// ✅ Server start (always last)
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});