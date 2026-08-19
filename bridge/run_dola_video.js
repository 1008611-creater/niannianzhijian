'use strict';

const controller = require('./niannian_dola_playwright_controller');
const {withDolaPromptPrefix} = require('./niannian_dola_desktop_api_adapter');

function usage() {
  console.log('用法: node bridge/run_dola_video.js --prompt "提示词" [--ratio 16:9] [--image 文件] [--video 文件] [--audio 文件] [--submit]');
}

function args(argv) {
  const out = {images:[], videos:[], audios:[], ratio:'16:9', submit:false, dryRun:false};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--help' || key === '-h') { usage(); process.exit(0); }
    if (key === '--submit') { out.submit = true; continue; }
    if (key === '--dry-run') { out.dryRun = true; continue; }
    const value = argv[++i];
    if (!value) throw new Error(`${key} 缺少参数`);
    if (key === '--prompt') out.prompt = value;
    else if (key === '--ratio') out.ratio = value;
    else if (key === '--image') out.images.push(value);
    else if (key === '--video') out.videos.push(value);
    else if (key === '--audio') out.audios.push(value);
    else throw new Error(`未知参数: ${key}`);
  }
  if (!out.prompt && !out.dryRun) throw new Error('--prompt 必填');
  return out;
}

async function main() {
  const input = args(process.argv.slice(2));
  const browser = await controller.connect();
  try {
    const page = await controller.videoPage(browser);
    await controller.ensureDurationAndRatio(page, {aspectRatio:input.ratio});
    const preflight = {
      pageUrl: page.url(),
      model: 'Dreamina Seedance 2.5',
      durationSeconds: 30,
      aspectRatio: input.ratio,
      assets: {image: input.images.length, video: input.videos.length, audio: input.audios.length}
    };
    if (!input.submit) {
      console.log(JSON.stringify({ok:true,mode:'preflight',preflight}, null, 2));
      return;
    }
    const assets = [
      ...input.images.map(path => ({kind:'reference_image', path})),
      ...input.videos.map(path => ({kind:'reference_video', path})),
      ...input.audios.map(path => ({kind:'reference_audio', path}))
    ];
    const promptSent = withDolaPromptPrefix(input.prompt);
    const prepared = await controller.prepare({browser, page, prompt:promptSent, aspectRatio:input.ratio, assets});
    const submitted = await controller.submit({browser, page, prompt:promptSent, aspectRatio:input.ratio});
    console.log(JSON.stringify({ok:true,mode:'submitted',preflight,promptSent,prepared:prepared.counts,submitted:{pageUrl:submitted.pageUrl}}, null, 2));
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(JSON.stringify({ok:false,code:error.code || 'DOLA_MANUAL_RUN_FAILED',error:error.message || String(error)}, null, 2));
  process.exitCode = 1;
});
