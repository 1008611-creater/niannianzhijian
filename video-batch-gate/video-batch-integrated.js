(function (global) {
  'use strict';

  let mountedKey='';
  let scheduled=false;

  function route() {
    const match=String(global.location.hash||'').match(/^#?redraw\/([^/]+)\/stage\/03(?:\/market\/[^/]+)?/);
    return match ? {projectId:decodeURIComponent(match[1])} : null;
  }

  function errorPanel(target,message) {
    target.innerHTML='<section class="video-batch-panel is-empty" role="alert"><h2>视频方案暂不可用</h2><p></p><button class="video-batch-confirm" type="button" data-video-batch-retry>重新读取</button></section>';
    target.querySelector('p').textContent=message||'请稍后重试';
    target.querySelector('[data-video-batch-retry]')?.addEventListener('click',()=>{mountedKey='';void mount();});
  }

  async function mount() {
    scheduled=false;
    const current=route();
    const workspace=document.querySelector('.step05-reference-workspace');
    const confirmed=workspace && /视频参考图已确认/.test(workspace.textContent||'');
    document.querySelectorAll('[data-video-batch-integrated]').forEach(node=>{if(!confirmed||!workspace?.parentElement?.contains(node))node.remove();});
    if(!current||!confirmed||!workspace.parentElement||!global.NiannianVideoBatchPanel)return;
    const key=current.projectId+'|'+(workspace.dataset.videoBatchWorkspaceKey||(workspace.dataset.videoBatchWorkspaceKey=Math.random().toString(36).slice(2)));
    if(mountedKey===key&&document.querySelector('[data-video-batch-integrated]'))return;
    mountedKey=key;
    const target=document.createElement('section');target.dataset.videoBatchIntegrated='';target.setAttribute('aria-live','polite');workspace.insertAdjacentElement('afterend',target);
    try {
      const localization=await fetch('/api/projects/'+encodeURIComponent(current.projectId)+'/localization-confirmation',{headers:{Accept:'application/json'},cache:'no-store'});
      if(!localization.ok)throw new Error('当前地区改编确认状态无法读取');
      const body=await localization.json();
      const revision=localization.headers.get('x-localization-revision');
      if(!body.localization?.downstream_ready||!revision)throw new Error('请先确认当前地区改编稿');
      const controller=global.NiannianVideoBatchPanel.createController({target,endpoint:'/api/projects/'+encodeURIComponent(current.projectId)+'/video-batches/current',requestHeaders:{'X-Localization-Revision':revision}});
      target.videoBatchController=controller;
      await controller.load();
    } catch(error) { errorPanel(target,String(error?.message||'视频方案加载失败')); }
  }

  function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>void mount(),0);}
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  global.addEventListener('hashchange',()=>{mountedKey='';schedule();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})(window);
