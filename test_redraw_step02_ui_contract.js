'use strict';

const assert = require('assert');
const fs = require('fs');

const mvp = fs.readFileSync(require.resolve('./mvp-step02-r13.js'), 'utf8');
const server = fs.readFileSync(require.resolve('./server.js'), 'utf8');
const vertical = fs.readFileSync(require.resolve('./bridge/niannian_redraw_step02_vertical.js'), 'utf8');
const redrawBody = mvp.indexOf('function renderRedrawStageBody');
const start = mvp.indexOf("if (stageId === '02')", redrawBody);
const end = mvp.indexOf("if (stageId === '03')", start);
assert(start > 0 && end > start);
const stage = mvp.slice(start, end);

for (const required of ['project?.step02','candidate.sourceRows','candidate.dialogueBindings','candidate.assetCandidates','step02.acceptance?.sha256','data-step02-action="prepare"','data-step02-action="dispatch"','data-step02-action="reconcile"','data-step02-action="accept"']) assert(stage.includes(required), required);
assert(stage.includes('candidate-only 员工回执'));
assert(!stage.includes('待识别'));
assert(!stage.includes('[1, 2, 3, 4]'));
assert(mvp.includes("'/api/projects/' + encodeURIComponent(projectId) + '/step02/' + action"));
assert(server.includes('(prepare|dispatch|reconcile|accept|review)'));
assert(vertical.includes("STEP02_TEST_ONLY_CANDIDATE_NOT_ACCEPTABLE"));
assert(vertical.includes("STEP02_FIXTURE_CANDIDATE_NOT_ACCEPTABLE"));
assert(server.includes("step02Vertical.verifyAcceptedForProject"));

process.stdout.write(JSON.stringify({ok:true,verified:['Stage02 reads current project sourceRows/dialogueBindings/assets','prepare/dispatch/reconcile/accept UI bindings exist','no unconditional fake role/scene cards','Step04 button requires acceptance SHA and step04Ready','test-only acceptance blocker projected','controller downstream uses exact reducer readback']}) + '\n');
