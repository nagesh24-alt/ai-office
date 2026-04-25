const fs = require('fs');

const oldHtml = fs.readFileSync('public/index.html', 'utf8');

// Extract #editor, #ai, #pdf-viewer-tab
const editorMatch = oldHtml.match(/<!-- EDITOR -->[\s\S]*?(?=<!-- AI -->)/);
const aiMatch = oldHtml.match(/<!-- AI -->[\s\S]*?(?=<!-- PDF VIEWER -->)/);
const pdfMatch = oldHtml.match(/<!-- PDF VIEWER -->[\s\S]*?(?=<\/div>\s*<\/div>\s*<!-- 🔴 FILE PANEL -->)/);

if (!editorMatch || !aiMatch || !pdfMatch) {
  console.error("Could not find sections!");
  process.exit(1);
}

const newHtml = fs.readFileSync('public/new_dashboard.html', 'utf8');

let mergedHtml = newHtml.replace('<main class="content">', '<div class="workspace" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative;">\n  <main id="dashboard" class="content tab" style="display:grid;">');

// Find the closing tag of <main class="content"> which is </main> just before </div> (for main-wrapper)
// Actually in newHtml it is:
// </aside>
// </main>
// </div>
// Let's replace the first </main> after <main class="content">
mergedHtml = mergedHtml.replace('</aside>\n  </main>\n</div>', '</aside>\n  </main>\n\n  ' + editorMatch[0] + '\n  ' + aiMatch[0] + '\n  ' + pdfMatch[0] + '\n  </div>\n</div>');

// Ensure stylesheet is linked
mergedHtml = mergedHtml.replace('</title>', '</title>\n<link rel="stylesheet" href="style.css">');

fs.writeFileSync('public/index.html', mergedHtml);
console.log("Merged successfully");
