'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {validateMatrix,validateN06,verifyN06ReferenceFiles,validateNegative,evaluateNegativeCase} = require('./bridge/mac-employee-training/validate_training_contract');

const root = path.join(__dirname, 'bridge', 'mac-employee-training');
const matrix = JSON.parse(fs.readFileSync(path.join(root, 'route_matrix.json'), 'utf8'));
const n06 = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'script_n06_v001_v002.json'), 'utf8'));
const negative = JSON.parse(fs.readFileSync(path.join(root, 'fixtures', 'negative_contracts.json'), 'utf8'));
async function main() {
  assert.equal(validateMatrix(matrix).rows, 12);
  assert.equal(validateN06(n06).refs, 4);
  assert.equal((await verifyN06ReferenceFiles(n06)).reference_count, 5);
  const tampered = JSON.parse(JSON.stringify(n06));
  tampered.groups.V001.references[0].sha256 = '0'.repeat(64);
  await assert.rejects(() => verifyN06ReferenceFiles(tampered), /V001_reference_reference_sha256_mismatch/);
  assert.equal(validateNegative(negative).cases, 7);
  for (const item of negative.cases) assert.equal(evaluateNegativeCase(item), item.expected_blocker);
  assert(matrix.rows.some(row => row.route_id === 'redraw_step05a_support_assets'));
  assert(matrix.rows.some(row => row.route_id === 'redraw_step05b_video_first_frames'));
  assert(matrix.rows.some(row => row.route_id === 'mimo_execution'));
  assert(matrix.forbidden_state_promotions.includes('downloaded->delivered'));
  assert.equal(matrix.employee_model_channel.channel_id,'codex_native_account_v1');
  assert.equal(matrix.employee_model_channel.launch_mode,'native_account');
  assert.equal(matrix.employee_model_channel.provider_config_id,'openai');
  assert.equal(matrix.employee_model_channel.raw_auth_read,false);
  assert.equal(matrix.employee_model_channel.real_delivery,false);
  assert.equal(matrix.side_effect_boundaries.media_provider_network_requested,false);
  assert(!Object.keys(matrix.adapter_identities).some(key => /krill|codex/i.test(key)));
  assert(!Object.prototype.hasOwnProperty.call(matrix.side_effect_boundaries,'provider_network_requested'));
  process.stdout.write(JSON.stringify({ok:true,verified:['parent and specialist route matrix','five Mac App threads visible with pin pending','native account employee model launch override contract','employee model and media provider identity separation','prompt compiler and task-spec sequence','Mimo-only media adapter identity','strict Step01 capability gate','N06 exact five-reference filesystem and SHA closure','fixture tamper rejection','V001/V002 real receipt QA lock','negative stale SHA/ref/confirmation/submit/endpoint/resolution/test-only V001 fixtures','media provider and production side effects disabled']}) + '\n');
}
main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
