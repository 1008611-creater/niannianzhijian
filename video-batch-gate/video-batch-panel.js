(function (global) {
  'use strict';

  const money = (minor, currency) => new Intl.NumberFormat('zh-CN', {style:'currency',currency:currency||'CNY'}).format(Number(minor||0)/100);
  const seconds = value => Number(value||0) + ' 秒';
  const escapeHtml = value => String(value??'').replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));

  function statusTone(state) {
    if (state === '等待提交/处理中') return 'ready';
    if (state === '等待你确认' || state === '预检通过') return 'confirm';
    if (state === '授权已过期' || state === '输入已变化需重确认') return 'warning';
    return 'pending';
  }

  function render(target, model, options = {}) {
    if (!model) {
      target.innerHTML='<section class="video-batch-panel is-empty" aria-live="polite"><h2>第一批视频生成方案</h2><p>视频参考图全部确认后，这里会自动生成免费预检方案。</p></section>';
      return;
    }
    const plan=model.plan;
    const quote=model.quote;
    const action=model.action;
    const checks=(model.preflight?.checks||[]).map(item=>'<li class="is-'+escapeHtml(item.status)+'"><i aria-hidden="true">'+(item.status==='pass'?'✓':'!')+'</i><span>'+escapeHtml(item.label)+'</span><small>'+escapeHtml(item.message)+'</small></li>').join('');
    const confirmableStates=new Set(['等待你确认','授权已过期','输入已变化需重确认']);
    const button=action?.type==='cost_authorization'&&confirmableStates.has(model.state)
      ? '<button class="video-batch-confirm" type="button" data-video-batch-confirm>'+(model.state==='等待你确认'?'确认生成本批视频':'重新确认生成本批视频')+'</button>'
      : '<button class="video-batch-confirm" type="button" disabled>'+escapeHtml(model.state==='等待提交/处理中'?'已确认，等待后续提交':'当前不可确认')+'</button>';
    target.innerHTML='<section class="video-batch-panel is-'+statusTone(model.state)+'" aria-labelledby="video-batch-title">'
      +'<header><div><span>FIRST REAL VIDEO · 最后确认门</span><h2 id="video-batch-title">第一批视频生成方案</h2><p>免费预检不会上传素材、不会提交任务，也不会扣费。</p></div><strong class="video-batch-state" tabindex="-1">'+escapeHtml(model.state)+'</strong></header>'
      +(plan?'<dl class="video-batch-metrics"><div><dt>视频数量</dt><dd>'+escapeHtml(plan.task_count)+' 条</dd></div><div><dt>总时长</dt><dd>'+seconds(plan.total_duration_seconds)+'</dd></div><div><dt>画面比例</dt><dd>'+escapeHtml(plan.aspect_ratio)+'</dd></div><div><dt>清晰度</dt><dd>'+escapeHtml(plan.resolution)+'</dd></div><div><dt>预计费用</dt><dd>'+money(quote?.estimated_cost_minor_units,quote?.currency)+'</dd></div><div><dt>费用上限</dt><dd>'+money(quote?.max_cost_minor_units,quote?.currency)+'</dd></div><div><dt>预计等待</dt><dd>约 '+Math.max(1,Math.ceil(Number(plan.estimated_wait_seconds||0)/60))+' 分钟</dd></div></dl>':'')
      +'<div class="video-batch-body"><section><h3>免费预检</h3><ul class="video-batch-checks">'+checks+'</ul></section><aside><h3>下一步</h3><p class="video-batch-issue">'+escapeHtml(model.earliest_issue||(model.submit_allowed?'本批已确认，等待后续真实执行恢复同一任务。':'所有准备项已完成，请确认本批数量、参数与费用上限。'))+'</p>'+button+'<small>本次确认只授权页面所示的精确批次。任何输入或费用变化都会要求重新确认。</small></aside></div>'
      +'</section>';
    const confirm=target.querySelector('[data-video-batch-confirm]');
    if (confirm) confirm.addEventListener('click',()=>options.onConfirm?.({model,button:confirm}));
  }

  function createController({target,endpoint,fetchImpl=global.fetch,requestHeaders={}}) {
    let etag=null; let model=null;
    async function load() {
      target.innerHTML='<section class="video-batch-panel is-loading" aria-live="polite"><h2>正在生成方案</h2><p>正在完成免费预检…</p></section>';
      const response=await fetchImpl(endpoint,{headers:{Accept:'application/json',...requestHeaders},cache:'no-store'});
      const body=await response.json();
      if(!response.ok) throw new Error(body.message||'视频方案加载失败');
      etag=response.headers.get('etag'); model=body;
      render(target,model,{onConfirm:confirm});
      return body;
    }
    async function confirm({button}) {
      button.disabled=true; button.textContent='正在确认…';
      try {
        const key='video-batch-confirm-'+global.crypto.randomUUID();
        const response=await fetchImpl(endpoint+'/confirm',{method:'POST',headers:{...requestHeaders,'Content-Type':'application/json','If-Match':etag,'Idempotency-Key':key},body:JSON.stringify({confirm_generate:true,quote_revision:model.quote.revision,confirmed_max_cost:{currency:model.quote.currency,minor_units:model.quote.max_cost_minor_units}})});
        const body=await response.json();
        if(!response.ok) throw new Error(body.message||'确认失败');
        etag=response.headers.get('etag'); model=body; render(target,model,{onConfirm:confirm});
        target.querySelector('.video-batch-state')?.focus?.();
      } catch(error) {
        render(target,model,{onConfirm:confirm});
        const issue=target.querySelector('.video-batch-issue'); if(issue){issue.textContent=error.message;issue.setAttribute('role','alert');}
        target.querySelector('[data-video-batch-confirm]')?.focus();
      }
    }
    return {load,confirm,get etag(){return etag;},get model(){return model;}};
  }

  global.NiannianVideoBatchPanel={createController,render};
})(window);
