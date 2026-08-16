const fs = require('node:fs');

const bundlePath = 'studio/assets/AssetLibraryPanel-BHyPOGab-r4.js';
const source = fs.readFileSync(bundlePath, 'utf8');

if (source.includes('data-asset-project-filter:"true"')) {
  fs.writeFileSync(bundlePath, source.replace('data-asset-project-filter:"true"', '"data-asset-project-filter":"true"'));
  console.log('asset library data attribute repaired');
  process.exit(0);
}

const oldLoader = source.match(/function Xt\(currentProjectId\)\{.*?\}const Ee=/s)?.[0];
if (!oldLoader) throw new Error('asset library loader not found');

const newLoader = 'async function assetLibraryLoadProject(api,projectId,isCancelled){let cursor=null;const assets=[];do{if(isCancelled())return assets;try{const result=await api.assets.list({projectId,cursor,limit:Wt});for(const item of result?.items||[]){const asset=Jt(item);asset&&assets.push(asset)}cursor=result?.cursor||null}catch{cursor=null}}while(cursor&&!isCancelled());return assets}function Xt(currentProjectId){const[e,t]=c.useState([]),[i,r]=c.useState(!1),[o,n]=c.useState(0),[u,l]=c.useState([]),b=c.useCallback(()=>n(g=>g+1),[]);return c.useEffect(()=>{let g=!1;return(async()=>{const d=ce();if(!d?.projects||!d.assets?.list){t([]),l([]),r(!1);return}r(!0);const p=d.projects.listAsync?await d.projects.listAsync():d.projects.list(),m=Array.isArray(p)?p.filter(k=>k&&typeof k.id==="string"&&k.id.trim()).map(k=>({id:k.id.trim(),name:typeof k.name==="string"&&k.name.trim()?k.name.trim():k.id.trim()})):[],h=m.map(k=>k.id),v=Yt(p),w=[];for(const k of v)h.includes(k)||h.push(k);currentProjectId&&!h.includes(currentProjectId)&&h.unshift(currentProjectId);const projectList=currentProjectId&&h.includes(currentProjectId)?currentProjectId:h[0];l(currentProjectId&&!m.some(k=>k.id===currentProjectId)?[...m,{id:currentProjectId,name:currentProjectId}]:m);if(projectList){const first=await assetLibraryLoadProject(d,projectList,()=>g);if(g)return;w.push(...first);t(Zt(w));r(!1)}const remaining=h.filter(k=>k!==projectList);const batches=await Promise.all(remaining.map(k=>assetLibraryLoadProject(d,k,()=>g)));if(g)return;for(const batch of batches)w.push(...batch);t(Zt(w));r(!1)})().catch(()=>{g||(t([]),l([]),r(!1))}),()=>{g=!0}},[o,currentProjectId]),{assets:e,projects:u,loading:i,refresh:b}}const Ee=';

let output = source.replace(oldLoader, newLoader);
const oldGroup = 'className:"inline-flex h-8 shrink-0 items-center gap-1.5 rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2 text-caption text-nomi-ink-65"';
const newGroup = 'className:"asset-library-project-filter inline-flex h-8 min-w-0 max-w-[156px] shrink items-center gap-1 rounded-nomi-sm border border-nomi-line bg-nomi-paper px-1.5 text-caption text-nomi-ink-65"';
if (!output.includes(oldGroup)) throw new Error('asset library group class not found');
output = output.replace(oldGroup, newGroup);
const oldSelect = 'className:"min-w-20 max-w-32 bg-transparent outline-none cursor-pointer"';
const newSelect = 'className:"asset-library-project-filter-select min-w-0 w-[108px] max-w-[108px] truncate bg-transparent outline-none cursor-pointer"';
if (!output.includes(oldSelect)) throw new Error('asset library group select class not found');
output = output.replace(oldSelect, newSelect);
const oldGroupLabel = 'children:[s.jsx("span",{className:"sr-only",children:"素材分组"}),s.jsx("span",{children:"分组"}),s.jsx("select"';
const newGroupLabel = '"data-asset-project-filter":"true",children:[s.jsx("span",{className:"sr-only",children:"素材分组"}),s.jsx("span",{className:"asset-library-project-filter-label",children:"分组"}),s.jsx("select"';
if (!output.includes(oldGroupLabel)) throw new Error('asset library group label not found');
output = output.replace(oldGroupLabel, newGroupLabel);
const oldToolbar = 's.jsxs("div",{className:"flex min-w-0 items-center gap-2",children:[s.jsx(Ge,{className:"min-w-0 flex-1"';
const newToolbar = 's.jsxs("div",{className:"asset-library-toolbar flex min-w-0 items-center gap-2",children:[s.jsx(Ge,{className:"asset-library-search min-w-[72px] flex-1"';
if (!output.includes(oldToolbar)) throw new Error('asset library toolbar not found');
output = output.replace(oldToolbar, newToolbar);
const oldImage = 's.jsx(he,{className:"block h-auto w-full object-contain",thumbnailSrc:t.thumbUrl,src:t.renderUrl,alt:t.name})';
const newImage = 's.jsx(he,{className:"asset-library-card-image block h-auto w-full object-contain",thumbnailSrc:t.thumbUrl,src:t.renderUrl,alt:t.name,loading:"lazy",decoding:"async"})';
if (!output.includes(oldImage)) throw new Error('asset library image card not found');
output = output.replace(oldImage, newImage);

fs.writeFileSync(bundlePath, output);
console.log('asset library ux patch applied');
