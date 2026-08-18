const fs = require('fs');
const path = require('path');

const assets = [
  'studio/assets/BaseGenerationNode-DLwEdORF-r4.js',
  'studio/assets/BaseGenerationNode-DLwEdORF-r5.js',
  'studio/assets/BaseGenerationNode-DLwEdORF-r6.js',
];

for (const relative of assets) {
  const file = path.join(__dirname, relative);
  const source = fs.readFileSync(file, 'utf8');
  if (!source.includes('tabIndex:0,role:"button"')) {
    throw new Error(`${relative}: node cards are not keyboard focusable`);
  }
  if (!source.includes('onFocus:()=>i(e.id,!1)')) {
    throw new Error(`${relative}: focusing a node does not select it`);
  }
  if (!source.includes('zIndex:t?12:2')) {
    throw new Error(`${relative}: selected node does not get promoted above overlaps`);
  }
  if (!source.includes('I.key==="Enter"||I.key===" "')) {
    throw new Error(`${relative}: Enter/Space node focus activation is missing`);
  }
}

console.log('canvas node focus contract: PASS');
