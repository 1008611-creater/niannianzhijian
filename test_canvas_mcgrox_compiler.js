'use strict';

const assert = require('node:assert/strict');
const compiler = require('./bridge/niannian_canvas_mcgrox_compiler');

async function run() {
  const unavailable = compiler.configuredStatus({NIANNIAN_GPT_API_KEY:'',NIANNIAN_GPT56_MODEL:'gpt-5.6'});
  assert.equal(unavailable.provider, 'mcgrox');
  assert.equal(unavailable.wireApi, 'responses');
  assert.equal(unavailable.submitEnabled, false);

  const calls = [];
  const runtime = compiler.createCanvasMcgroxCompiler({
    env:{NIANNIAN_GPT_API_KEY:'test-only',NIANNIAN_GPT56_MODEL:'gpt-5.6',NIANNIAN_GPT_API_BASE_URL:'https://www.mcgrox.top'},
    responsesClient:{async call(body) {
      calls.push(body);
      return {output:[{content:[{type:'output_text',text:JSON.stringify({screenplay:'场景一：雨夜街头。',treatment:'人物在雨夜相遇。',story_bible:'主角保持雨夜重逢主线。'})}]}]};
    }}
  });
  const result = await runtime.compile({
    skillKey:'screenwriter',
    skillVersion:'1.0.0',
    description:'将故事编排为剧本。',
    inputs:{story:'雨夜重逢的短剧故事。'},
    outputPorts:[{id:'screenplay',type:'screenplay'},{id:'treatment',type:'treatment'},{id:'story_bible',type:'story_bible'}]
  });
  assert.equal(result.model, 'gpt-5.6');
  assert.equal(result.outputs.screenplay, '场景一：雨夜街头。');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].text.format.type, 'json_schema');
  assert.deepEqual(calls[0].text.format.schema.required, ['screenplay','treatment','story_bible']);
  assert.equal(JSON.stringify(calls[0]).includes('test-only'), false, 'credential must never enter the compiler request body');
  assert.throws(() => compiler.validateOutputs({screenplay:'only one'}, [{id:'screenplay'},{id:'treatment'}]), error => error.code === 'CANVAS_COMPILER_SCHEMA_INVALID');
  console.log(JSON.stringify({ok:true,verified:['MCGrox Responses compiler uses strict JSON only','credentials stay out of node/compiler payloads','declared ports are required and validated']}));
}

run().catch(error => { console.error(error.stack || error.message || String(error)); process.exitCode = 1; });
