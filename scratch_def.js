const fs = require('fs');

let js = fs.readFileSync('public/script.js', 'utf8');

js = js.replace('showTab("editor");', 'showTab("dashboard");');

fs.writeFileSync('public/script.js', js);
console.log("Updated default tab");
