const fs = require('fs');

let js = fs.readFileSync('public/script.js', 'utf8');

js = js.replace(/function showTab\(tab\) \{[\s\S]*?\n\}/, `function showTab(tab) {
  document.querySelectorAll(".tab").forEach(t => t.style.display = "none");
  const tabEl = document.getElementById(tab);
  if (tabEl) {
    if (tab === "pdf-viewer-tab") tabEl.style.display = "flex";
    else if (tab === "dashboard") tabEl.style.display = "grid";
    else tabEl.style.display = "block";
  }
}`);

fs.writeFileSync('public/script.js', js);
console.log("Updated showTab");
