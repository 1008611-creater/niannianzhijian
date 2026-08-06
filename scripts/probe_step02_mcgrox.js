const path = require('path');
const {createStep02Service} = require('../bridge/niannian_step02_runtime');

async function run() {
  const includeImage = process.argv.includes('--image');
  const service = createStep02Service({
    root:path.join(__dirname,'..','data','step02-probe-unused'),
    evidenceRoot:path.join(__dirname,'..','data','step01-evidence','NN-20260715083045-8120F5','EP001'),
    bundleRoot:path.join(__dirname,'..','runtime','skill-bundles','shortdrama-localization-runtime-1'),
    shotReviewService:null,
    expected:{projectId:'NN-20260715083045-8120F5',analysisRunId:'analysis-1-0dc5c5d751592e9fd0656a81',sourceSha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',sourceBytes:145897161}
  });
  const result = await service.probe({includeImage});
  const model = process.env.NIANNIAN_GPT56_MODEL || 'gpt-5.6';
  if (result.ok !== true || result.wire_api !== 'responses' || result.response_model !== model || result.image_input !== includeImage) throw Object.assign(new Error(includeImage?'MCGROX_VISION_INPUT_UNSUPPORTED':'MCGROX_STRICT_JSON_UNSUPPORTED'),{code:includeImage?'MCGROX_VISION_INPUT_UNSUPPORTED':'MCGROX_STRICT_JSON_UNSUPPORTED'});
  process.stdout.write(JSON.stringify({ok:true,probe:includeImage?'image_input_strict_json':'strict_json',wire_api:'responses',model:result.response_model,image_input:result.image_input,secrets_exposed:false})+'\n');
}

run().catch(error=>{process.stderr.write(JSON.stringify({ok:false,code:error.code||'MCGROX_PROBE_FAILED',error:'McGrox capability probe failed',secrets_exposed:false})+'\n');process.exitCode=1;});
