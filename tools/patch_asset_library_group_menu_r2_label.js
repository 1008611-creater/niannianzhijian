const fs = require('node:fs');
const path = 'studio/assets/AssetLibraryPanel-BHyPOGab-r4.js';
let source = fs.readFileSync(path, 'utf8');
const oldText = 'children:[s.jsx("span",{className:"sr-only",children:"素材分组"}),s.jsxs("div",{className:"asset-library-project-filter-control"';
const newText = 'children:[s.jsx("span",{className:"sr-only",children:"素材分组"}),s.jsx("span",{className:"asset-library-project-filter-label",children:"分组"}),s.jsxs("div",{className:"asset-library-project-filter-control"';
if (!source.includes(oldText)) throw new Error('custom project menu label anchor not found');
source = source.replace(oldText, newText);
fs.writeFileSync(path, source);
console.log('asset library custom project menu label patched');
