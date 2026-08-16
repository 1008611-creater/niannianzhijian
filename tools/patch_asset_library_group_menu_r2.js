const fs = require('node:fs');

const bundlePath = 'studio/assets/AssetLibraryPanel-BHyPOGab-r4.js';
let source = fs.readFileSync(bundlePath, 'utf8');

if (!source.includes('[projectFilter,setProjectFilter]=c.useState(e||""),[F,G]')) {
  throw new Error('project filter state anchor not found');
}
source = source.replace(
  '[projectFilter,setProjectFilter]=c.useState(e||""),[F,G]',
  '[projectFilter,setProjectFilter]=c.useState(e||""),[pg,sg]=c.useState(!1),[F,G]'
);

const start = source.indexOf('s.jsxs("label",{className:"asset-library-project-filter');
const endMarker = ',"project-group-filter")';
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('project filter markup not found');

const replacement = 's.jsxs("div",{className:"asset-library-project-filter inline-flex h-8 min-w-0 max-w-[156px] shrink items-center gap-1 rounded-nomi-sm border border-nomi-line bg-nomi-paper px-1.5 text-caption text-nomi-ink-65","data-asset-project-filter":"true",children:[s.jsx("span",{className:"sr-only",children:"素材分组"}),s.jsx("span",{className:"asset-library-project-filter-label",children:"分组"}),s.jsxs("div",{className:"asset-library-project-filter-control",children:[s.jsx("button",{type:"button",className:"asset-library-project-filter-trigger","aria-label":"按画布分组","aria-haspopup":"listbox","aria-expanded":pg,onClick:()=>sg(a=>!a),children:s.jsx("span",{className:"asset-library-project-filter-value",children:projectFilter?(projectOptions.find(a=>a.id===projectFilter)?.name||projectFilter):"全部项目"})}),pg?s.jsxs("div",{className:"asset-library-project-filter-menu",role:"listbox","aria-label":"画布分组列表",children:[s.jsx("button",{type:"button",role:"option","aria-selected":projectFilter==="",className:y("asset-library-project-filter-option",!projectFilter&&"is-selected"),onClick:()=>{setProjectFilter(""),G(new Set),P.current=null,Le(),Y(null),sg(!1)},children:"全部项目"}),projectOptions.map(a=>s.jsx("button",{type:"button",role:"option","aria-selected":projectFilter===a.id,className:y("asset-library-project-filter-option",projectFilter===a.id&&"is-selected"),onClick:()=>{setProjectFilter(a.id),G(new Set),P.current=null,Le(),Y(null),sg(!1)},title:a.name,children:a.name},a.id))]}):null]})]},"project-group-filter")';
source = source.slice(0, start) + replacement + source.slice(end + endMarker.length);
fs.writeFileSync(bundlePath, source);
console.log('asset library custom project menu patch applied');
