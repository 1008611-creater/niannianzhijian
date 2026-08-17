const fs = require('node:fs');
const path = require('node:path');

const bundlePath = path.join(__dirname, '..', 'studio', 'assets', 'AssetLibraryPanel-BHyPOGab-r4.js');
let source = fs.readFileSync(bundlePath, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) throw new Error('asset library ' + label + ' marker not found');
  source = source.replace(before, after);
}

replaceOnce(
  'return{id:`${i}:${r}`,kind:t,name:e.name||r.split("/").pop()||t,createdAt:e.createdAt,updatedAt:e.updatedAt,renderUrl:o,ownerNodeId:typeof e.data.ownerNodeId=="string"&&e.data.ownerNodeId.trim()?e.data.ownerNodeId.trim():void 0,source:"project",origin:{source:"project",projectId:i,relativePath:r}}}',
  'return{id:`${i}:${r}`,assetId:String(e.id||"").trim()||void 0,kind:t,name:e.name||r.split("/").pop()||t,createdAt:e.createdAt,updatedAt:e.updatedAt,renderUrl:o,ownerNodeId:typeof e.data.ownerNodeId=="string"&&e.data.ownerNodeId.trim()?e.data.ownerNodeId.trim():void 0,source:"project",origin:{source:"project",projectId:i,relativePath:r,assetId:String(e.id||"").trim()||void 0}}}',
  'asset identity'
);

replaceOnce(
  'se=c.useMemo(()=>Re(S),[S]),oe=c.useMemo(()=>d==="project"?se:re,[re,se,d])',
  'se=c.useMemo(()=>Re(M.filter(a=>a.origin?.projectId===e)),[M,e]),oe=c.useMemo(()=>d==="project"?se:re,[re,se,d])',
  'project asset source'
);

replaceOnce(
  'r(!0);const p=d.projects.listAsync?await d.projects.listAsync():d.projects.list(),m=Array.isArray(p)?p.filter(k=>k&&typeof k.id==="string"&&k.id.trim()).map(k=>({id:k.id.trim(),name:typeof k.name==="string"&&k.name.trim()?k.name.trim():k.id.trim()})):[],h=m.map(k=>k.id),v=Yt(p),w=[];',
  'r(!0);let q=null;try{q=d.assets.listAll?await d.assets.listAll({projectId:currentProjectId}):null}catch{}if(g)return;if(q){const U=Array.isArray(q.items)?q.items.map(Jt).filter(Boolean):[],J=Array.isArray(q.projects)?q.projects.filter(K=>K&&typeof K.id==="string"&&K.id.trim()).map(K=>({id:K.id.trim(),name:typeof K.name==="string"&&K.name.trim()?K.name.trim():K.id.trim()})):[];currentProjectId&&!J.some(K=>K.id===currentProjectId)&&J.unshift({id:currentProjectId,name:currentProjectId}),l(J),t(Zt(U)),r(!1);return}const p=d.projects.listAsync?await d.projects.listAsync():d.projects.list(),m=Array.isArray(p)?p.filter(k=>k&&typeof k.id==="string"&&k.id.trim()).map(k=>({id:k.id.trim(),name:typeof k.name==="string"&&k.name.trim()?k.name.trim():k.id.trim()})):[],h=m.map(k=>k.id),v=Yt(p),w=[];',
  'server asset catalog'
);

replaceOnce(
  'ye=c.useMemo(()=>R.filter(a=>F.has(a.id)),[F,R]),_=c.useMemo(()=>B?ye:[],[B,ye])',
  'ye=c.useMemo(()=>R.filter(a=>F.has(a.id)),[F,R]),foreignSelection=c.useMemo(()=>d==="all"?ye.filter(a=>a.origin?.projectId!==e&&a.assetId):[],[d,e,ye]),_=c.useMemo(()=>B?ye:[],[B,ye])',
  'foreign selection'
);

replaceOnce(
  '}},[M,e,O,L,_,n]),ct=',
  '}},[M,e,O,L,_,n]),CrossProjectReuse=c.useCallback(async()=>{if(!e||foreignSelection.length===0)return;const a=ce()?.assets?.reference;if(!a){N("当前环境暂不支持跨项目引用","error");return}try{const h=await Promise.all(foreignSelection.map(v=>a({projectId:e,sourceProjectId:v.origin.projectId,sourceAssetId:v.assetId}))),C=h.filter(v=>v.created).length;L(),O(),G(new Set),p("project"),setProjectFilter(e),N(C?`已引用 ${C} 个素材到当前项目`:"所选素材已在当前项目","success")}catch(h){console.error("cross project asset reference failed",h),N(h instanceof Error?h.message:"素材引用失败","error")}},[e,foreignSelection,O,L]),ct=',
  'reference action'
);

replaceOnce(
  '}):null,ut=s.jsx(',
  '}):null,referenceAction=d==="all"&&foreignSelection.length>0?s.jsxs("button",{type:"button",className:y("inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-nomi-sm border border-nomi-line bg-nomi-paper px-2.5","cursor-pointer text-caption font-semibold text-nomi-ink-65 transition-[background,color,border-color] duration-[var(--nomi-transition-fast)]","hover:border-nomi-accent hover:bg-nomi-accent-soft hover:text-nomi-accent"),"aria-label":"引用到当前项目",title:"引用到当前项目",onClick:CrossProjectReuse,children:[s.jsx(jt,{size:15,stroke:1.8,"aria-hidden":!0}),"引用到当前项目"]}):null,ut=s.jsx(',
  'reference button'
);

replaceOnce(
  'children:[ut,ct]}),d!=="smart"?s.jsxs("div",{className:"asset-library-toolbar flex min-w-0 items-center gap-2",children:[s.jsx(Ge,',
  'children:[ut,ct]}),d!=="smart"?s.jsxs("div",{className:"asset-library-toolbar flex min-w-0 items-center gap-2",children:[s.jsx(Ge,',
  'toolbar marker'
);

replaceOnce(
  ']},"project-group-filter"),dt,B?ne?',
  ']},"project-group-filter"),referenceAction,dt,B?ne?',
  'reference button placement'
);

replaceOnce(
  's.jsxs("div",{className:"asset-library-project-filter',
  'd==="all"?s.jsxs("div",{className:"asset-library-project-filter',
  'project filter visibility'
);

replaceOnce(
  ']},"project-group-filter"),referenceAction',
  ']},"project-group-filter"):null,referenceAction',
  'project filter visibility close'
);

if (!source.includes('onDragStartAsset:B?Ae:Se')) throw new Error('asset library project drag marker not found');
source = source.replaceAll('onDragStartAsset:B?Ae:Se', 'onDragStartAsset:Se');

fs.writeFileSync(bundlePath, source);
console.log('cross-project asset reuse patch applied');
