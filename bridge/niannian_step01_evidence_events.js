'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');

const EVENT_SCHEMA = 'niannian_step01_evidence_event_v1';
const EVENT_TYPES = new Set([
  'analysis_run_created','analysis_run_superseded','package_published','dispatch_claimed','codex_turn_started','skill_route_selected',
  'analysis_service_task_reconciled','codex_turn_completed','server_analysis_started','server_analysis_completed','return_manifest_received',
  'return_uploaded','artifact_paths_verified','step01_validation_passed','step01_evidence_accepted',
  'step01_evidence_delivered','blocker_observed','projection_drift_detected','post_review_completed'
]);

function stableEventId(event) {
  // A recovery can supersede the same source run more than once. Bind the
  // replacement run so those historical events remain distinct and appendable.
  const canonical = [event.type,event.project_id,event.analysis_run_id,event.superseded_by || '',event.source_sha256,event.dispatch_id || '',event.phase_key || '',event.evidence_sha256 || '',event.status || ''].join('|');
  return 'step01event-' + crypto.createHash('sha256').update(canonical).digest('hex');
}
async function appendEvidenceEvent(filePath, event) {
  if (!EVENT_TYPES.has(event.type) || !event.project_id || !event.analysis_run_id || !/^[a-f0-9]{64}$/.test(String(event.source_sha256 || ''))) throw new Error('step01_evidence_event_contract_invalid');
  const payload={...event};delete payload.schema_version;delete payload.event_id;delete payload.at;
  const value = {...payload,schema_version:EVENT_SCHEMA,event_id:stableEventId(payload),at:new Date().toISOString()};
  await fsp.mkdir(path.dirname(filePath), {recursive:true});
  const existing = await readEvidenceEvents(filePath);
  const prior = existing.find(item => item.event_id === value.event_id);
  if (prior) {
    if (JSON.stringify({...prior,at:null}) !== JSON.stringify({...value,at:null})) throw new Error('step01_evidence_event_id_conflict');
    return prior;
  }
  const handle = await fsp.open(filePath, 'a', 0o600);
  try {
    await handle.writeFile(JSON.stringify(value) + '\n', 'utf8');
    await handle.sync();
  } finally { await handle.close(); }
  return value;
}
async function readEvidenceEvents(filePath) {
  let text;
  try { text = await fsp.readFile(filePath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  return text.split(/\r?\n/).filter(Boolean).flatMap((line,index) => {
    let value;
    try { value = JSON.parse(line); } catch { throw new Error('step01_evidence_event_json_invalid:' + (index + 1)); }
    // Historical job telemetry is preserved in this append-only file but is not
    // part of the source-evidence state machine.
    if (value.schema_version !== EVENT_SCHEMA) return [];
    if (value.schema_version !== EVENT_SCHEMA || !EVENT_TYPES.has(value.type) || !value.event_id) throw new Error('step01_evidence_event_row_invalid:' + (index + 1));
    return [value];
  });
}
function reduceEvidenceEvents(events, expected = {}) {
  const rows = events.filter(event => (!expected.projectId || event.project_id === expected.projectId) && (!expected.analysisRunId || event.analysis_run_id === expected.analysisRunId));
  if (!rows.length) return {status:'awaiting_start',accepted:false,delivered:false,blocker:null,eventCount:0,lastEvent:null};
  for (const event of rows) {
    if (expected.sourceSha256 && event.source_sha256 !== expected.sourceSha256) throw new Error('step01_evidence_event_source_mismatch');
    if (expected.sourceRevision !== undefined && Number(event.source_revision) !== Number(expected.sourceRevision)) throw new Error('step01_evidence_event_revision_mismatch');
  }
  const blockers = rows.filter(event => event.type === 'blocker_observed');
  const acceptedEvent = [...rows].reverse().find(event => event.type === 'step01_evidence_accepted');
  const serverAttempt = rows.some(event => event.type === 'server_analysis_started');
  const requiredAttemptEvents = serverAttempt
    ? ['server_analysis_started','skill_route_selected','analysis_service_task_reconciled','server_analysis_completed','return_manifest_received','artifact_paths_verified','step01_validation_passed']
    : ['dispatch_claimed','codex_turn_started','skill_route_selected','analysis_service_task_reconciled','codex_turn_completed','return_manifest_received','artifact_paths_verified','step01_validation_passed'];
  let attemptRows=[];
  if(acceptedEvent){
    if(!acceptedEvent.dispatch_id||!acceptedEvent.phase_key)throw new Error('step01_evidence_acceptance_attempt_binding_missing');
    attemptRows=rows.filter(event=>event.dispatch_id===acceptedEvent.dispatch_id&&event.phase_key===acceptedEvent.phase_key);
    const acceptedIndex=rows.indexOf(acceptedEvent),createdIndex=rows.findIndex(event=>event.type==='analysis_run_created');
    if(createdIndex<0||createdIndex>=acceptedIndex)throw new Error('step01_evidence_analysis_run_event_missing_or_late');
    let priorIndex=createdIndex;
    for(const type of requiredAttemptEvents){const index=rows.findIndex((event,rowIndex)=>rowIndex>priorIndex&&rowIndex<acceptedIndex&&event.type===type&&event.dispatch_id===acceptedEvent.dispatch_id&&event.phase_key===acceptedEvent.phase_key);if(index<0)throw new Error('step01_evidence_acceptance_event_chain_incomplete:'+type);priorIndex=index;}
  }else{
    const latestAttempt=[...rows].reverse().find(event=>event.dispatch_id&&event.phase_key);
    attemptRows=latestAttempt?rows.filter(event=>event.dispatch_id===latestAttempt.dispatch_id&&event.phase_key===latestAttempt.phase_key):[];
  }
  const seen = new Set(attemptRows.map(event => event.type));
  const acceptedIndex=acceptedEvent?rows.indexOf(acceptedEvent):-1;
  const deliveredEvent=acceptedEvent?[...rows.slice(acceptedIndex+1)].reverse().find(event=>event.type==='step01_evidence_delivered'&&event.dispatch_id===acceptedEvent.dispatch_id&&event.phase_key===acceptedEvent.phase_key):null;
  let status = 'queued';
  if (seen.has('dispatch_claimed')) status = 'capability_preflight';
  if (seen.has('package_published')) status = 'package_published';
  if (seen.has('codex_turn_started') || seen.has('server_analysis_started')) status = 'codex_running';
  if (seen.has('codex_turn_completed') || seen.has('server_analysis_completed')) status = 'return_received';
  if (seen.has('artifact_paths_verified')) status = 'reducer_verifying';
  if (acceptedEvent) status = 'evidence_ready';
  const latestBlocker = blockers.length ? blockers[blockers.length - 1] : null;
  if (latestBlocker && (!acceptedEvent || rows.indexOf(latestBlocker) > rows.indexOf(acceptedEvent))) status = String(latestBlocker.status || 'blocked_contract');
  if(deliveredEvent&&deliveredEvent.evidence_sha256!==acceptedEvent.evidence_sha256)throw new Error('step01_evidence_delivery_sha_mismatch');
  return {status,accepted:Boolean(acceptedEvent),delivered:Boolean(deliveredEvent),blocker:latestBlocker,eventCount:rows.length,lastEvent:rows[rows.length - 1],acceptedEvent,deliveredEvent};
}

module.exports = {EVENT_SCHEMA,EVENT_TYPES,appendEvidenceEvent,readEvidenceEvents,reduceEvidenceEvents,stableEventId};
