/* Step04 D visual QA: docx-preview + Chromium only, never LibreOffice. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function asFileUrl(filePath) {
  return 'file:///' + path.resolve(filePath).replace(/\\/g, '/');
}

function packageFile(root, relative) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) throw new Error(`DOCX_QA_DEPENDENCY_MISSING:${target}`);
  return asFileUrl(target);
}

function packageBrowserExecutable() {
  const configured = String(process.env.NIANNIAN_STEP04_BROWSER_EXECUTABLE || process.env.CHROME_BIN || '').trim();
  if (configured) return configured;
  const bundled = path.resolve(__dirname, '..', 'runtime', 'playwright-browsers', 'chrome-linux', 'chrome');
  return fs.existsSync(bundled) ? bundled : undefined;
}

function loadPlaywright() {
  const candidates = [
    process.env.NIANNIAN_STEP04_PLAYWRIGHT_ROOT,
    path.resolve(__dirname, '..', 'node_modules', 'playwright'),
    path.resolve(__dirname, '..', 'node_modules', 'playwright-core'),
    path.resolve(__dirname, '..', 'niannian-ai-canonical-local', 'node_modules', 'playwright'),
    path.resolve(__dirname, '..', 'redraw_d7713a2f_1min_front4_20260803_184229', 'qa_renderer', 'node_modules', 'playwright'),
    path.resolve(process.env.APPDATA || '', 'npm', 'node_modules', 'playwright'),
  ];
  for (const candidate of candidates.filter(Boolean)) {
    if (fs.existsSync(candidate)) return require(candidate);
  }
  throw new Error(`DOCX_QA_PLAYWRIGHT_MISSING:${candidates.join('|')}`);
}

async function main() {
  const docxPath = path.resolve(argument('--docx'));
  const outDir = path.resolve(argument('--out-dir'));
  if (!argument('--docx') || !argument('--out-dir') || !fs.existsSync(docxPath)) {
    throw new Error('usage: node tools/qa_step04_abcd_docx_preview.js --docx <file.docx> --out-dir <qa-dir>');
  }
  const vendorRoot = path.resolve(__dirname, 'vendor');
  const { chromium } = loadPlaywright();
  const jszip = packageFile(vendorRoot, path.join('jszip', 'dist', 'jszip.min.js'));
  const preview = packageFile(vendorRoot, path.join('docx-preview', 'dist', 'docx-preview.js'));
  fs.mkdirSync(outDir, { recursive: true });
  const htmlPath = path.join(outDir, 'step04d_docx_preview.html');
  const screenshotPath = path.join(outDir, 'step04d_docx_preview.png');
  const receiptPath = path.join(path.dirname(docxPath), 'step04d_render_receipt.json');
  const renderReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  const requiredHeadings = renderReceipt.presentation_profile === 'prompt_review'
    ? ['B 层资产图提示词表', '三、完整生视频提示词']
    : ['A 层', 'B 层', 'C 层', 'D 层'];
  const encoded = fs.readFileSync(docxPath).toString('base64');
  const html = `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#555}.docx-wrapper{background:#555!important;padding:24px 0!important}.docx-wrapper>section{margin:0 auto 24px!important;box-shadow:0 2px 10px #222}
  </style><div id="container"></div><script src="${jszip}"></script><script src="${preview}"></script><script>
  const bytes=Uint8Array.from(atob(${JSON.stringify(encoded)}),c=>c.charCodeAt(0));
  docx.renderAsync(bytes,document.getElementById('container'),null,{breakPages:true,renderHeaders:true,renderFooters:true,useBase64URL:true,experimental:true})
    .then(()=>document.documentElement.dataset.rendered='true')
    .catch(error=>document.documentElement.dataset.renderError=String(error));
  </script>`;
  fs.writeFileSync(htmlPath, html, 'utf8');
  const browser = await chromium.launch({
    headless: true,
    executablePath: packageBrowserExecutable(),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: 1 });
    await page.goto(asFileUrl(htmlPath), { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.dataset.rendered === 'true' || document.documentElement.dataset.renderError, null, { timeout: 30000 });
    const qa = await page.evaluate(requiredHeadings => {
      if (document.documentElement.dataset.renderError) return { ok: false, error: document.documentElement.dataset.renderError };
      const pages = [...document.querySelectorAll('.docx-wrapper > section')];
      const overflow = [...document.querySelectorAll('table')].some(table => {
        const tableBox = table.getBoundingClientRect();
        const pageBox = table.closest('section')?.getBoundingClientRect();
        return Boolean(pageBox) && (tableBox.left < pageBox.left - 1 || tableBox.right > pageBox.right + 1);
      });
      const text = document.body.innerText || '';
      const tableCount = document.querySelectorAll('table').length;
      // Observed failure: a long Step04 package silently rendered as one
      // extremely tall page.  A compact one-page test document remains valid,
      // but a real multi-table production package must preserve page breaks.
      const paginationFailure = tableCount >= 8 && pages.length < 2;
      return { ok: pages.length > 0 && !overflow && !paginationFailure, page_count: pages.length, table_count: tableCount, overflow, pagination_failure: paginationFailure, has_required_headings: requiredHeadings.every(value => text.includes(value)) };
    }, requiredHeadings);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    if (!qa.ok || !qa.has_required_headings) throw new Error(`DOCX_QA_FAILED:${JSON.stringify(qa)}`);
    const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    if (receipt.output_docx_sha256 !== sha256(docxPath)) throw new Error('DOCX_QA_RECEIPT_SHA_MISMATCH');
    receipt.visual_qa = { status: 'passed', renderer: 'docx-preview + Chromium', qa_path: path.resolve(outDir, 'step04d_docx_visual_qa.json'), screenshot_path: screenshotPath, ...qa };
    fs.writeFileSync(path.join(outDir, 'step04d_docx_visual_qa.json'), JSON.stringify(receipt.visual_qa, null, 2) + '\n', 'utf8');
    fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    process.stdout.write(JSON.stringify({ result_type:'final_delivery', task_id:'step04d-docx-qa', evidence_path_or_url:screenshotPath, verified_result:'docx_preview_visual_qa_passed', next_action_or_blocker:'none', ...qa }) + '\n');
  } finally {
    await browser.close();
  }
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
