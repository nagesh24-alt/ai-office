const express = require("express");
const cors = require("cors");

// ✅ New additions (safe)
const multer = require("multer");
const fs = require("fs");
const mammoth = require("mammoth");
const XLSX = require("xlsx");
const HTMLtoDOCX = require("html-to-docx");

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// ✅ Keep your existing routes
app.get("/", (req, res) => {
  res.send("AI Office Server Running 🚀");
});

// ✅ Keep your AI route (DON’T REMOVE)
app.post("/ai-edit", (req, res) => {
  let { text, action } = req.body;

  if (!text) return res.send("");

  let sentences = text
    .replace(/\n/g, " ")
    .split(/[.!?]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // 🔹 SUMMARIZE
  if (action === "summarize") {
    let summary = sentences.slice(0, Math.ceil(sentences.length / 2));
    res.send(summary.join(". ") + (summary.length ? "." : ""));
  }

  // 🔹 REWRITE (make more natural)
  else if (action === "rewrite") {
    let rewritten = sentences.map(s => {
      return "👉 " + s.charAt(0).toUpperCase() + s.slice(1);
    });
    res.send(rewritten.join(". ") + (rewritten.length ? "." : ""));
  }

  // 🔹 GRAMMAR FIX
  else if (action === "grammar") {
    let fixed = sentences.map(s => {
      s = s.charAt(0).toUpperCase() + s.slice(1);

      // better formatting
      s = s.replace(/\bi\b/g, "I");
      s = s.replace(/\bai\b/gi, "AI");
      s = s.replace(/\bdont\b/gi, "don't");

      // add spacing + punctuation fix
      s = s.replace(/\s+/g, " ").trim();

      return s;
    });

    res.send(fixed.join(". ") + (fixed.length ? "." : ""));
  }

  else {
    res.send(text);
  }
});

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ file: req.file.filename });
});

app.get("/read/:filename", async (req, res) => {
  const filePath = `uploads/${req.params.filename}`;
  const ext = req.params.filename.split(".").pop().toLowerCase();

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  try {
    if (ext === "pdf") {
      res.json({ type: "pdf", content: `/uploads/${req.params.filename}` });
    }
    else if (ext === "docx") {
      try {
        const result = await mammoth.convertToHtml({ path: filePath });
        res.json({ type: "docx", content: result.value });
      } catch (err) {
        console.error("HTML conversion failed, falling back to text", err);
        const result = await mammoth.extractRawText({ path: filePath });
        res.json({ type: "docx", content: result.value });
      }
    }
    else if (ext === "xlsx") {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      // Convert to JSON array, preserve raw data for frontend
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      res.json({ type: "excel", content: data });
    }
    else if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) {
      res.json({ type: "image", content: `/uploads/${req.params.filename}` });
    }
    else {
      const data = fs.readFileSync(filePath, "utf8");
      res.json({ type: "text", content: data });
    }
  } catch (err) {
    res.status(500).send("Error reading file");
  }
});

app.post("/save", async (req, res) => {
  const { filename, content } = req.body;

  if (!filename) return res.status(400).send("No file");

  const filePath = `uploads/${filename}`;
  const ext = filename.split(".").pop().toLowerCase();

  try {
    if (ext === "docx") {
      const fileBuffer = await HTMLtoDOCX(content, null, {
        table: { row: { cantSplit: true } },
        footer: true,
        pageNumber: true,
      });
      fs.writeFileSync(filePath, fileBuffer);
    } else {
      fs.writeFileSync(filePath, content);
    }
    res.send("File saved successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving file");
  }
});

app.get("/files", (req, res) => {
  try {
    const files = fs.readdirSync("uploads");

    const fileList = files.map(file => {
      const stats = fs.statSync(`uploads/${file}`);
      return {
        name: file,
        size: stats.size
      };
    });

    res.json(fileList);
  } catch (err) {
    res.status(500).send("Error reading files");
  }
});

app.delete("/delete/:filename", (req, res) => {
  const filePath = `uploads/${req.params.filename}`;

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  try {
    fs.unlinkSync(filePath);
    res.send("File deleted");
  } catch (err) {
    res.status(500).send("Error deleting file");
  }
});

app.get("/download/:filename", (req, res) => {
  const filePath = `uploads/${req.params.filename}`;

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.download(filePath);
});

// ✅ Server start (always last)
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});