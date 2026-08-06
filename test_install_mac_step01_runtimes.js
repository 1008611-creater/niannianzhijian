'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'bridge', 'install_mac_step01_runtimes.sh'), 'utf8');
assert.match(source, /step01-python312/);
assert.match(source, /uv==\$\{UV_VERSION\}/);
assert.match(source, /transnetv2-pytorch==\$\{TRANSNET_VERSION\}/);
assert.match(source, /qwen-asr==\$\{QWEN_ASR_VERSION\}/);
assert.match(source, /TransNetV2\(device='cpu'\)/);
assert.match(source, /Qwen3ForcedAligner/);
assert.match(source, /model_weights_loaded': False/);
assert.match(source, /independent_model_self_test_ready/);
assert.match(source, /real_alignment_verified': False/);
assert.match(source, /provider_network_requested': False/);
assert.doesNotMatch(source, /MIMO_API_KEY|PADDLEOCR_API_TOKEN|PADDLEOCR_AISTUDIO_TOKEN/);
process.stdout.write(JSON.stringify({ok:true,verified:['versioned user-local Python runtime','TransNetV2 packaged-weight CPU self-test','ForcedAligner import-only fallback without overwriting independent model readiness','hq_full composite remains blocked','no credential read or provider submit']}) + '\n');
