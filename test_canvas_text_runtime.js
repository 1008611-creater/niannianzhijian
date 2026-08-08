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

  const failedRuntime = createCanvasTextRuntime({
    env:{NIANNIAN_TEXT_API_KEY:'synthetic-test-key',NIANNIAN_TEXT_MODEL:'synthetic-model',NIANNIAN_TEXT_PROVIDER_SUBMIT:'on'},
    fetchImpl:async () => ({ok:false,status:429,json:async () => ({error:{message:'provider detail must not escape'}})})
  });
  await assert.rejects(() => failedRuntime.submit({model:'synthetic-model',prompt:'do not log this prompt'}), error => {
    assert.equal(error.code, 'CANVAS_TEXT_PROVIDER_FAILED');
    assert.equal(error.providerHttpStatus, 429);
    assert.equal(typeof error.durationMs, 'number');
    assert.doesNotMatch(JSON.stringify(error), /do not log this prompt|provider detail/);
    return true;
  });

  const networkRuntime = createCanvasTextRuntime({
    env:{NIANNIAN_TEXT_API_KEY:'synthetic-test-key',NIANNIAN_TEXT_MODEL:'synthetic-model',NIANNIAN_TEXT_PROVIDER_SUBMIT:'on'},
    fetchImpl:async () => { throw new Error('network detail must not escape'); }
  });
  await assert.rejects(() => networkRuntime.submit({model:'synthetic-model',prompt:'another private prompt'}), error => {
    assert.equal(error.code, 'CANVAS_TEXT_PROVIDER_NETWORK');
    assert.equal(error.providerHttpStatus, null);
    assert.equal(typeof error.durationMs, 'number');
    assert.doesNotMatch(JSON.stringify(error), /another private prompt|network detail/);
    return true;
  });
  console.log('CANVAS_TEXT_RUNTIME_CONTRACT_OK');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
