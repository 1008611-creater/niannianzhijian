'use strict';

const assert = require('assert/strict');
const {readCanvasTextConfig, publicCanvasTextStatus, extractText, createCanvasTextRuntime} = require('./bridge/niannian_canvas_text_runtime');

async function run() {
  const missing = readCanvasTextConfig({});
  assert.equal(missing.provider, 'asxs');
  assert.equal(missing.baseUrl, 'https://api.asxs.top/v1');
  assert.equal(missing.credentialConfigured, false);
  assert.equal(missing.modelConfigured, false);
  assert.equal(missing.submitEnabled, false);
  assert.equal(publicCanvasTextStatus({NIANNIAN_TEXT_API_KEY:'synthetic-test-key',NIANNIAN_TEXT_MODEL:'synthetic-model',NIANNIAN_TEXT_PROVIDER_SUBMIT:'on'}).credentialConfigured, true);
  assert.equal(publicCanvasTextStatus({NIANNIAN_TEXT_API_KEY:'synthetic-test-key',NIANNIAN_TEXT_MODEL:'synthetic-model',NIANNIAN_TEXT_PROVIDER_SUBMIT:'on'}).apiKey, undefined);
  assert.equal(extractText({choices:[{message:{content:'  hello  '}}]}), 'hello');
  assert.equal(extractText({output_text:'  output  '}), 'output');

  const calls = [];
  const runtime = createCanvasTextRuntime({
    env:{NIANNIAN_TEXT_API_KEY:'synthetic-test-key',NIANNIAN_TEXT_API_BASE_URL:'https://api.asxs.top/v1',NIANNIAN_TEXT_MODEL:'synthetic-model',NIANNIAN_TEXT_PROVIDER_SUBMIT:'on'},
    fetchImpl:async (url, init) => {
      calls.push({url, init});
      return {ok:true, json:async () => ({choices:[{message:{content:'synthetic response'}}]})};
    }
  });
  const result = await runtime.submit({model:'synthetic-model',prompt:'say hello'});
  assert.equal(result.text, 'synthetic response');
  assert.equal(calls[0].url, 'https://api.asxs.top/v1/chat/completions');
  assert.match(calls[0].init.headers.Authorization, /^Bearer /);
  assert.match(calls[0].init.body, /synthetic-model/);
  assert.doesNotMatch(JSON.stringify(publicCanvasTextStatus({NIANNIAN_TEXT_API_KEY:'synthetic-test-key',NIANNIAN_TEXT_MODEL:'synthetic-model'})), /synthetic-test-key/);
  console.log('CANVAS_TEXT_RUNTIME_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
