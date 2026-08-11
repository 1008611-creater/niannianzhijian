const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildStage, runtimeFiles, activeBrandAssetFromIndex, committedSourcePaths } = require('./build_canonical_release_stage');

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-release-stage-'));
const candidateRoot = path.join(temporaryRoot, 'candidate');

try {
  const result = buildStage(candidateRoot);
  const packageManifest = JSON.parse(fs.readFileSync(result.package_manifest, 'utf8'));
  const summary = JSON.parse(fs.readFileSync(path.join(candidateRoot, 'release-candidate-summary.json'), 'utf8'));
  assert.equal(result.gate.release_ready, true);
  assert.equal(result.target, 'https://ai.cauai.fun');
  assert.equal(result.release.release_id, 'local-validation-stage');
  assert.match(result.release.source_git_revision, /^[a-f0-9]{40}$/);
  assert(committedSourcePaths().has('bridge/niannian_step04_abcd.js'));
  assert(
    ['diverged_requires_new_staged_release', 'verified_current_parity']
      .includes(summary.production_parity)
  );
  assert.equal(summary.production_parity, result.gate.production_parity);
  assert.equal(
    result.gate.next_gate,
    summary.production_parity === 'diverged_requires_new_staged_release'
      ? 'stage_and_verify_a_new_release_before_deploy'
      : 'remote_release_validation_before_deploy'
  );
  assert.equal(packageManifest.total_bytes, result.total_bytes);
  assert(packageManifest.files.length >= runtimeFiles.length);
  assert.equal(packageManifest.files.some(file => file === 'node_modules' || file.startsWith('node_modules/')), false);
  assert.match(packageManifest.dependency_source, /deployment-host node_modules/);
  assert(packageManifest.files.includes('mvp-step02-r13.js'));
  assert(packageManifest.files.includes('mvp-step03-r1.js'));
  assert(packageManifest.files.includes('mvp-step01-ledger-r1.js'));
  assert(packageManifest.files.includes('mvp-step01-story-r1.js'));
  assert(packageManifest.files.includes('mvp-source-truth-r1.js'));
  assert(packageManifest.files.includes('product-system.css'));
  assert(packageManifest.files.includes('hero-oil-paint.css'));
  assert(packageManifest.files.includes('sw.js'));
  assert(packageManifest.files.includes('manifest.webmanifest'));
  assert(packageManifest.files.includes('vendor/gsap-3.13.0.min.js'));
  assert(packageManifest.files.includes('vendor/gsap-flip-3.13.0.min.js'));
  assert(packageManifest.files.includes('assets/home/niannian-hero-oil-paint-quiet-v1.png'));
  assert(packageManifest.files.includes('assets/home/niannian-hero-oil-vortex-loop-v2.mp4'));
  assert(packageManifest.files.includes('assets/showcase/short-drama-keyart-v1.png'));
  assert(packageManifest.files.includes('assets/showcase/animation-drama-keyart-v1.png'));
  assert(packageManifest.files.includes('assets/showcase/redraw-keyart-partial-xuedi-v1.png'));
  assert(packageManifest.files.includes('assets/assets/showcase/animation-drama-keyart-v1.png'));
  assert.equal(activeBrandAssetFromIndex('<img class="hero-logo" src="./assets/brand/current.svg" alt="">'), 'assets/brand/current.svg');
  assert.throws(() => activeBrandAssetFromIndex('<img class="hero-logo" src="https://example.invalid/brand.svg" alt="">'), /release_stage_active_brand_asset_invalid/);
  assert(packageManifest.files.includes('assets/brand/niannian-ai-mark-transparent.svg'));
  assert.equal(packageManifest.files.includes('canvas.js'), false);
  assert.equal(packageManifest.files.includes('canvas.css'), false);
  assert.equal(packageManifest.files.includes('nomi-canvas-entry.js'), false);
  assert.equal(packageManifest.files.includes('mvp.js'), false);
  assert(packageManifest.files.includes('studio/index.html'));
  assert(packageManifest.files.includes('director-desk/index.html'));
  assert(packageManifest.files.some(file => file.startsWith('studio/assets/')));
  assert(packageManifest.files.some(file => file.startsWith('director-desk/')));
  assert(packageManifest.files.includes('bridge/niannian_shot_review.js'));
  assert(packageManifest.files.includes('bridge/niannian_video_channel_registry.js'));
  assert(packageManifest.files.includes('bridge/niannian_redraw_step02_vertical.js'));
  assert(packageManifest.files.includes('bridge/niannian_step02_runtime.js'));
  assert(packageManifest.files.includes('runtime/skill-bundles/shortdrama-localization-runtime-1/manifest.json'));
  assert(packageManifest.files.includes('runtime/skill-bundles/shortdrama-localization-runtime-1/instructions.md'));
  assert(packageManifest.files.includes('runtime/skill-bundles/shortdrama-step04-abcd-runtime-1/manifest.json'));
  assert(packageManifest.files.includes('runtime/skill-bundles/shortdrama-step04-abcd-runtime-1/instructions.md'));
  assert(packageManifest.files.includes('tools/render_step04_abcd_docx.py'));
  assert(packageManifest.files.includes('tools/qa_step04_abcd_docx_preview.js'));
  assert(packageManifest.files.includes('tools/vendor/docx-preview/dist/docx-preview.js'));
  assert(packageManifest.files.includes('tools/vendor/jszip/dist/jszip.min.js'));
  assert(packageManifest.files.includes('docs/step02-runtime-contract/README.md'));
  assert(packageManifest.files.includes('docs/step02-runtime-contract/step02-variant.schema.json'));
  assert(packageManifest.files.includes('scripts/probe_step02_mcgrox.js'));
  assert.equal(packageManifest.files.some(file => file.startsWith('bridge/mac-employee-training/')), false);
  assert.equal(packageManifest.files.includes('bridge/video_channel_evidence_registry.json'), false);
  assert.equal(packageManifest.files.some(file => file.startsWith('bridge/mac-skill-bundles/')), false);
  assert(packageManifest.files.includes('docs/shot-review-contract/contract-manifest.json'));
  assert(packageManifest.files.includes('docs/shot-review-contract/schemas/shot-review-model.schema.json'));
  assert.equal(packageManifest.files.some(file => /^(?:data-local|data|output|logs|\.local)(?:\/|$)/.test(file)), false);
  assert.deepEqual(
    result.gate.static_resource_closure.missing_optional_css_assets,
    []
  );
  process.stdout.write(JSON.stringify({ ok:true, file_count:result.file_count, total_bytes:result.total_bytes, verified:['isolated staging', 'deployment-host dependency materialization contract', 'active brand asset derived from current HTML', 'exact package manifest', 'release gate', 'local runtime data and node_modules excluded'] }) + '\n');
} finally {
  fs.rmSync(temporaryRoot, { recursive:true, force:true });
}
