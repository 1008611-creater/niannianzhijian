const path = require('path');
const fsp = require('fs').promises;
const step03RuntimeBackend = require('../bridge/niannian_step03_runtime');
const {createStep03Worker} = require('../bridge/niannian_step03_worker');
const {createLocalizationConfirmationService} = require('../bridge/niannian_localization_confirmation');

const root = path.resolve(__dirname,'..');
const dataRoot = path.resolve(process.env.DATA_DIR || path.join(root,'data'));
const evidenceRoot = path.resolve(process.env.NIANNIAN_EXACT_STEP01_EVIDENCE_ROOT || path.join(dataRoot,'step01-evidence','NN-20260715083045-8120F5','EP001'));
const bundleRoot = path.resolve(process.env.NIANNIAN_STEP03_SKILL_BUNDLE_ROOT || path.join(root,'runtime','skill-bundles','shortdrama-visual-assets-runtime-1'));
const expected = {
  projectId:'NN-20260715083045-8120F5',
  analysisRunId:'analysis-1-0dc5c5d751592e9fd0656a81',
  sourceSha256:'a46f74392e2b3f7ec813b4eba5a0cd9756a7c30225e0033fd671d2cab21cd30c',
  sourceBytes:145897161
};
const runtime = step03RuntimeBackend.createStep03Service({
  root:path.resolve(process.env.NIANNIAN_STEP03_RUNTIME_ROOT || path.join(dataRoot,'step03-runtime')),
  evidenceRoot,
  bundleRoot,
  expected,
  step02Service:{getVariant(){throw new Error('STEP03_WORKER_CANNOT_READ_STEP02');}}
});
const localization = createLocalizationConfirmationService({root:path.join(dataRoot,'localization-confirmation')});
async function providerPreflight({claim,task}) {
  const plan=JSON.parse(await fsp.readFile(path.join(claim.directory,'plan.json'),'utf8'));
  const projects=JSON.parse(await fsp.readFile(path.join(dataRoot,'projects.json'),'utf8'));
  const project=projects.find(row=>row.id===plan.project_id),authorityRevision=project?.canonical?.authority_revision||project?.analysis?.authorityRevisionId||project?.analysis?.runId,acceptance=project?.step02?.acceptance;
  if(!project||!authorityRevision||!acceptance?.sha256)throw Object.assign(new Error('当前项目缺少原片时间轴确认绑定'),{code:'LOCALIZATION_PROVIDER_PROJECT_BINDING_REQUIRED'});
  const acceptedStep02={project_id:project.id,authority_revision:authorityRevision,acceptance_identity:acceptance.sha256,accepted:acceptance.status==='accepted',artifact_ledger_verified:acceptance.downstream_consumable===true};
  return localization.requireProviderTask({projectId:project.id,authorityRevision,acceptedStep02,taskId:task.task_id,task});
}
const worker = createStep03Worker({runtime,evidenceRoot,planning:{bundleRoot,evidenceRoot},providerPreflight});
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>worker.stop());
worker.run().catch(error=>{process.stderr.write(JSON.stringify({code:error.code||'STEP03_WORKER_CRASHED',message:String(error.message||error).slice(0,300)})+'\n');process.exitCode=1;});
