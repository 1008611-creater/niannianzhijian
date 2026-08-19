'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'studio', 'assets', 'NomiStudioApp-DDB0IgSO-r28-19b89ec-r6.js');
const source = fs.readFileSync(file, 'utf8');
if (source.includes('renameRequestRef=y.useRef(0)')) {
  console.log('STUDIO_RENAME_METADATA_ALREADY_PATCHED');
  process.exit(0);
}
const before = 'const po=y.useCallback(()=>{const h=P.current;Yr(h);const w=ve.current;ve.current=null,w?.(),P.current=null,Wt(null),d(null),i("library"),n(It(),{replace:!1}),gv(),a()},[n,a]),Z=y.useCallback(h=>{if(!s)return;const w=h.trim()||e("appBar.untitledProject");if(w===s.name)return;const N={...s,name:w};d(N),Oe().then(async({service:K})=>{const{readCurrentWorkbenchProjectPayload:L}=await fe(async()=>{const{readCurrentWorkbenchProjectPayload:oe}=await Promise.resolve().then(()=>Wa);return{readCurrentWorkbenchProjectPayload:oe}},void 0,import.meta.url);return K.persistProject(N,L())}).catch(K=>{console.error("project rename save error",K),Ee(e("studio.renameFailed"),"error")})},[s,Oe,e])';
const after = 'const renameRequestRef=y.useRef(0),po=y.useCallback(()=>{const h=P.current;Yr(h);const w=ve.current;ve.current=null,w?.(),P.current=null,Wt(null),d(null),i("library"),n(It(),{replace:!1}),gv(),a()},[n,a]),Z=y.useCallback(h=>{if(!s)return;const w=h.trim()||e("appBar.untitledProject");if(w===s.name)return;const N={...s,name:w},requestId=++renameRequestRef.current;Oe().then(async({service:K})=>{const projects=Q()?.projects;if(projects&&typeof projects.updateMetadata==="function")return projects.updateMetadata(s.id,{name:w});const{readCurrentWorkbenchProjectPayload:L}=await fe(async()=>{const{readCurrentWorkbenchProjectPayload:oe}=await Promise.resolve().then(()=>Wa);return{readCurrentWorkbenchProjectPayload:oe}},void 0,import.meta.url);return K.persistProject(N,L())}).then(K=>{if(requestId!==renameRequestRef.current)return;d(K&&K.name?{...s,...K,name:K.name}:N)}).catch(K=>{if(requestId!==renameRequestRef.current)return;console.error("project rename save error",K),Ee(e("studio.renameFailed"),"error")})},[s,Oe,e])';

if (!source.includes(before)) throw new Error('当前主界面资源未找到预期的重命名逻辑');
fs.writeFileSync(file, source.replace(before, after));
console.log('STUDIO_RENAME_METADATA_PATCHED');
