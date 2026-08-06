const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..', '..');
const canonicalRoot = path.resolve(__dirname, '..');
const candidateRoot = path.join(workspaceRoot, 'authority', 'candidates', 'niannian-smart-cut-node-r2');
const studioRoot = path.join(candidateRoot, 'studio-source');
const editorRoot = path.join(workspaceRoot, '.openchatcut-runtime');
const outputRoot = path.join(candidateRoot, 'public-source-staging-20260806-r4');

const studioOutput = path.join(outputRoot, 'niannian-nomi-smart-cut-source-20260806');
const bridgeOutput = path.join(outputRoot, 'niannian-smart-cut-bridge-source-20260806');

const excludedNames = new Set([
  '.env', '.env.local', '.env.production', 'node_modules', 'dist', 'desktop-dist', 'data', 'data-local',
  'output', 'outputs', 'runtime', 'release', 'release-staging', 'logs', '.work', '.tmp', '.git',
  'test-results', 'coverage', '.playwright-cli', '.code-review-graph', '.build',
]);

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function hashFile(filePath) {
  return sha256(await fsp.readFile(filePath));
}

function safeCopyFilter(source) {
  const base = path.basename(source);
  if (excludedNames.has(base)) return false;
  if (source === path.join(canonicalRoot, 'studio')) return false;
  if (source === path.join(canonicalRoot, 'brand-exploration')) return false;
  if (source === path.join(canonicalRoot, 'open-source')) return false;
  if (source === path.join(editorRoot, 'public', 'media', 'uploads')) return false;
  return true;
}

async function ensureMissing(dir) {
  try {
    await fsp.access(dir);
    throw new Error(`公开源码暂存目录已存在，拒绝覆盖：${dir}`);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
}

async function copySource(source, destination) {
  await fsp.cp(source, destination, {recursive: true, filter: safeCopyFilter});
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function main() {
  for (const required of [studioRoot, editorRoot, canonicalRoot]) await fsp.access(required);
  await ensureMissing(outputRoot);
  await fsp.mkdir(outputRoot, {recursive: true});

  await copySource(studioRoot, studioOutput);
  await copySource(canonicalRoot, path.join(bridgeOutput, 'main-site'));
  await copySource(editorRoot, path.join(bridgeOutput, 'editor'));

  const studioDistIndex = path.join(studioRoot, 'dist', 'index.html');
  const smartCutCard = path.join(studioRoot, 'src', 'workbench', 'generationCanvas', 'nodes', 'render', 'SmartCutCardBody.tsx');
  const smartCutApi = path.join(studioRoot, 'src', 'workbench', 'api', 'smartCutApi.ts');
  const bridge = path.join(canonicalRoot, 'bridge', 'niannian_smart_cut_jobs.js');
  const server = path.join(canonicalRoot, 'server.js');
  const editorPlugin = path.join(editorRoot, 'server', 'plugins', 'niannian-smart-cut.ts');

  const common = {
    release: '20260806',
    generatedAt: new Date().toISOString(),
    upstream: {
      repository: 'https://github.com/aqm857886159/Nomi',
      license: 'AGPL-3.0-only',
      version: JSON.parse(await fsp.readFile(path.join(studioRoot, 'package.json'), 'utf8')).version,
    },
    exclusions: ['user media', 'data/', 'data-local/', '.env*', 'API keys', 'tokens', 'cookies', 'signed URLs', 'node_modules/', 'generated runtime files'],
  };

  await writeJson(path.join(studioOutput, 'RELEASE_MANIFEST.json'), {
    ...common,
    package: 'niannian-nomi-smart-cut-source-20260806',
    publishedRuntime: {
      path: '/studio/',
      buildCommand: 'node node_modules/vite/bin/vite.js build --mode production',
      distIndexSha256: await hashFile(studioDistIndex),
    },
    smartCutSources: {
      card: {path: 'src/workbench/generationCanvas/nodes/render/SmartCutCardBody.tsx', sha256: await hashFile(smartCutCard)},
      api: {path: 'src/workbench/api/smartCutApi.ts', sha256: await hashFile(smartCutApi)},
    },
  });

  await writeJson(path.join(bridgeOutput, 'RELEASE_MANIFEST.json'), {
    ...common,
    package: 'niannian-smart-cut-bridge-source-20260806',
    components: {
      mainSite: {path: 'main-site', entry: 'main-site/server.js', sha256: await hashFile(server)},
      smartCutBridge: {path: 'main-site/bridge/niannian_smart_cut_jobs.js', sha256: await hashFile(bridge)},
      editor: {path: 'editor', entry: 'editor/server/plugins/niannian-smart-cut.ts', sha256: await hashFile(editorPlugin)},
    },
    runtimeConfiguration: ['NIANNIAN_SMART_CUT_BRIDGE_SECRET', 'NIANNIAN_SMART_CUT_EDITOR_URL', 'NIANNIAN_SMART_CUT_MAIN_URL', 'NIANNIAN_SMART_CUT_EDITOR_PUBLIC_URL'],
    configurationRule: '只在服务器环境变量中设置；禁止提交、打包、写入浏览器项目或源码下载包。',
  });

  process.stdout.write(JSON.stringify({outputRoot, studioOutput, bridgeOutput}, null, 2) + '\n');
}

main().catch((error) => {
  process.stderr.write(String(error?.stack || error) + '\n');
  process.exitCode = 1;
});
