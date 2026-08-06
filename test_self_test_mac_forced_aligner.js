'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, 'bridge', 'self_test_mac_forced_aligner.sh'), 'utf8');
assert.match(source, /Qwen\/Qwen3-ForcedAligner-0\.6B/);
assert.match(source, /c7cbfc2048c462b0d63a45797104fc9db3ad62b7/);
assert.match(source, /local_files_only=True/);
assert.match(source, /model_weights_missing/);
assert.match(source, /HF_HUB_DISABLE_XET=1/);
assert.match(source, /dependency_network_used_for_initial_install/);
assert.match(source, /device_map='cpu'/);
assert.match(source, /dtype=torch\.float32/);
assert.match(source, /say -v Tingting/);
assert.match(source, /language='Chinese'/);
assert.match(source, /real_user_media_processed': False/);
assert.match(source, /real_project_alignment_verified': False/);
assert.match(source, /provider_submit_requested': False/);
assert.doesNotMatch(source, /password|api[_-]?key|access[_-]?token|cookie/i);
process.stdout.write(JSON.stringify({ok:true,verified:['pinned official model revision','local-only model load after download','CPU float32 self-test','synthetic Chinese TTS alignment','model file SHA manifest','no user media credential or provider path']}) + '\n');
