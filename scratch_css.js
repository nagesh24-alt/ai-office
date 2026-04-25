const fs = require('fs');

const oldCss = fs.readFileSync('public/style.css', 'utf8');
const oldLines = oldCss.split('\n');

const editorChunk = oldLines.slice(62, 175).join('\n'); // 63 to 175
const excelChunk = oldLines.slice(257, 286).join('\n'); // 258 to 286
const pdfChunk = oldLines.slice(286).join('\n'); // 287 to end

// Extract <style> from new_dashboard.html
const newHtml = fs.readFileSync('public/new_dashboard.html', 'utf8');
const styleMatch = newHtml.match(/<style>\s*([\s\S]*?)\s*<\/style>/);
const newCss = styleMatch ? styleMatch[1] : '';

const mergedCss = newCss + '\n\n' + editorChunk + '\n\n' + excelChunk + '\n\n' + pdfChunk;
fs.writeFileSync('public/style.css', mergedCss);
console.log('Merged CSS');
