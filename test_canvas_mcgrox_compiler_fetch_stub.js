'use strict';

const originalFetch = global.fetch;

global.fetch = async function canvasMcgroxTestFetch(url, options = {}) {
  if (String(url).startsWith('https://mcgrox.test/')) {
    const request = JSON.parse(String(options.body || '{}'));
    const required = request?.text?.format?.schema?.required || [];
    const outputs = Object.fromEntries(required.map(port => [port, port === 'image_prompt' ? '电影感雨夜关键帧提示词。' : port === 'video_prompt' ? '雨夜人物行走，稳定跟拍的视频提示词。' : port + ' 已编排输出。']));
    return new Response(JSON.stringify({output_text:JSON.stringify(outputs)}), {status:200,headers:{'content-type':'application/json'}});
  }
  return originalFetch(url, options);
};
