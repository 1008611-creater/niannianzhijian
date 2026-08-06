'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {createCanvasTextJobService} = require('./bridge/niannian_canvas_text_jobs');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'niannian-canvas-text-'));
  const service = createCanvasTextJobService({filePath:path.join(root, 'jobs.json')});
  const created = await service.create({ownerId:'user-1',projectId:'project-1',projectKind:'redraw',nodeId:'node-1',model:'synthetic-model',prompt:'hello',idempotencyKey:'text-12345678'});
  assert.equal(created.created, true);
  const reused = await service.create({ownerId:'user-1',projectId:'project-1',projectKind:'redraw',nodeId:'node-1',model:'synthetic-model',prompt:'hello',idempotencyKey:'text-12345678'});
  assert.equal(reused.created, false);
  const completed = await service.updateOwned('user-1', 'project-1', created.job.id, {status:'succeeded',text:'answer',completedAt:'2026-08-07T00:00:00.000Z'});
  assert.equal(service.publicJob(completed).raw.choices[0].message.content, 'answer');
  assert.equal((await service.getOwned('user-1', 'project-1', created.job.id)).status, 'succeeded');
  fs.rmSync(root, {recursive:true,force:true});
  console.log('CANVAS_TEXT_JOBS_CONTRACT_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
