'use strict';

const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const executor = require('./bridge/niannian_step01_server_executor');

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

async function main() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'niannian-step01-visual-batch-'));
  try {
    const frames = [];
    for (const [shotId, point, color] of [['1', 'start', '#ff0000'], ['1', 'mid', '#00ff00'], ['1', 'end', '#0000ff'], ['2', 'start', '#ffffff'], ['2', 'mid', '#222222'], ['2', 'end', '#ffaa00']]) {
      const relativePath = 'artifacts/source_frames/S' + shotId.padStart(4, '0') + '_' + point + '.png';
      const absolutePath = path.join(root, relativePath);
      await fsp.mkdir(path.dirname(absolutePath), {recursive:true});
      await sharp({create:{width:1800,height:1200,channels:3,background:color}}).png().toFile(absolutePath);
      const bytes = await fsp.readFile(absolutePath);
      frames.push({shot_id:shotId,point,time_sec:0,relative_path:relativePath,sha256:sha256(bytes),bytes:bytes.length});
    }
    const originalHashes = new Map(frames.map(frame => [frame.relative_path, frame.sha256]));
    const derivatives = await executor.createVisualAnalysisFrames({root,frames,maxDimension:1024,quality:72});
    assert.equal(derivatives.frames.length, 6);
    for (const frame of derivatives.frames) {
      const sourcePath = derivatives.mappings.find(item => item.analysis_copy.relative_path === frame.relative_path).source.relative_path;
      assert.equal(originalHashes.get(sourcePath), derivatives.mappings.find(item => item.analysis_copy.relative_path === frame.relative_path).source.sha256);
      const metadata = await sharp(path.join(root, frame.relative_path)).metadata();
      assert.ok(Math.max(metadata.width, metadata.height) <= 1024);
    }
    const calls = [];
    const result = await executor.analyzeFramesBatched({
      config:{model:'test-vision',endpoint:'https://example.invalid/v1/responses',key:'test-key'},
      root,
      project:{id:'NN-test',source:{sha256:'source-sha'}},
      analysisRun:{id:'analysis-1-test'},
      timeline:[{shot_id:'1',start_sec:0,end_sec:1},{shot_id:'2',start_sec:1,end_sec:2}],
      frames:derivatives.frames,
      batchSize:1,
      fetchImpl:async (_url, options) => {
        const request = JSON.parse(options.body);
        const scope = JSON.parse(request.input[0].content[0].text);
        const sourceId = scope.segments[0].source_segment_id;
        calls.push({sourceId,imageCount:request.input[0].content.filter(item => item.type === 'input_image').length});
        return {ok:true,status:200,json:async () => ({output_text:JSON.stringify({segments:[{source_segment_id:sourceId,observed_facts:[],visible_text:[],uncertainty:[]}]})})};
      }
    });
    assert.deepEqual(calls, [{sourceId:'S0001',imageCount:3},{sourceId:'S0002',imageCount:3}]);
    assert.deepEqual(result.segments.map(item => item.source_segment_id), ['S0001','S0002']);
    process.stdout.write('STEP01_VISUAL_BATCH_CONTRACT_OK\n');
  } finally {
    await fsp.rm(root, {recursive:true,force:true});
  }
}

main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
