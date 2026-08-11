'use strict';

const {spawnSync} = require('node:child_process');

const tests = [
  'test_studio_root_module_identity.js',
  'test_r3f_portal_cleanup.js',
  'test_web_canvas_persistence_binding.js',
  'test_web_runtime_adapter.js',
  'test_canvas_provider_config.js',
  'test_canvas_text_runtime.js',
  'test_canvas_image2_runtime.js',
  'test_canvas_h3_runtime.js',
  'test_canvas_animate_runtime.js',
  'test_nomi_h3_multiref_contract.js',
  'test_nomi_h3_result_delivery_http.js',
  'test_canvas_generation_http.js',
  'test_canvas_assets_http.js',
  'test_canvas_generated_video_assets.js',
  'test_project_library_rows.js',
  'test_pwa_shell.js',
  'test_release_identity.js',
  'test_exact_preview_contract.js',
  'test_build_canonical_release_stage.js',
  'scripts/validate_frontend_authority.js'
];

for (const test of tests) {
  process.stdout.write(`\n[quality] ${test}\n`);
  const result = spawnSync(process.execPath, [test], {stdio: 'inherit', env: {...process.env, CI: 'true'}});
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(`[quality] failed: ${test}\n`);
    process.exit(result.status || 1);
  }
}

process.stdout.write(`\n[quality] passed ${tests.length} contract tests\n`);
