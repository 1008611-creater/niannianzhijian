#!/usr/bin/env node
'use strict';

const fs = require('fs').promises;
const path = require('path');
const story = require('../bridge/niannian_step01_story_authority');
const ledgerModule = require('../bridge/niannian_step01_source_ledger');

async function main() {
  const dataRoot = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
  const projectId = process.env.NIANNIAN_STORY_PROJECT_ID || 'NN-20260715083045-8120F5';
  const projects = JSON.parse(await fs.readFile(path.join(dataRoot, 'projects.json'), 'utf8'));
  const project = (Array.isArray(projects) ? projects : projects.projects || []).find(item => item.id === projectId);
  if (!project) throw new Error('STEP01_STORY_PROJECT_NOT_FOUND');
  const evidenceRoot = path.join(dataRoot, 'step01-evidence', projectId, 'EP001');
  const ledger = await ledgerModule.readLedger({evidenceRoot, overlayRoot:path.join(dataRoot, 'step01-source-ledger-overlays'), project});
  const sourceKey = String(project.source?.storage_key || '').replace(/\\/g, '/');
  const sourceVideoPath = sourceKey.startsWith('uploads/') && !sourceKey.includes('..') ? path.resolve(dataRoot, ...sourceKey.split('/')) : null;
  const result = await story.generate({root:path.join(dataRoot, 'step01-story-authority'), project, ledger, scriptText:'', requestGemini:true, sourceVideoPath, evidenceRoot});
  const sidecar = result.gemini_sidecar || {};
  process.stdout.write(JSON.stringify({
    project_id:projectId,
    story_status:result.status,
    gemini_provider:sidecar.provider || null,
    gemini_model:sidecar.model || null,
    gemini_status:sidecar.status || null,
    selected_shot_ids:sidecar.selected_shot_ids || [],
    reviewed_frame_shot_ids:sidecar.reviewed_frame_shot_ids || [],
    analysis_count:Array.isArray(sidecar.analyses) ? sidecar.analyses.length : 0,
    error_code:sidecar.error_code || null
  }) + '\n');
}

main().catch(error => { process.stderr.write(String(error.stack || error) + '\n'); process.exitCode = 1; });
