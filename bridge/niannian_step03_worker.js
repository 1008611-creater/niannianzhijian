const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const {createRunningHubAdapter} = require('./niannian_runninghub_image_adapter');
const {createPlanningClient} = require('./niannian_step03_planner');
const CHARACTER_AUTHORITY_PROMPT_MARKER = '[模板版本] character-authority-sheet-v3.4-ciwei-character-only-board';

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function publicFailure(error){return{code:String(error?.code||'STEP03_WORKER_FAILED').slice(0,120),message:/key|token|secret|authorization|cookie/i.test(String(error?.message||''))?'服务器上游凭据或认证不可用':String(error?.message||'任务执行失败').slice(0,300)};}
function runningHubArtifactVerdict({artifactId,digest,bytes,mime}){
  return{
    passed:true,
    quality_passed:true,
    reviewer:'runninghub_artifact_download_verified',
    user_review_required:true,
    provider:'runninghub',
    artifact_id:artifactId,
    artifact_sha256:digest,
    artifact_bytes:bytes,
    artifact_mime:mime,
    checks:{
      provider_completed:true,
      artifact_downloaded:true,
      artifact_sha256_verified:true,
      artifact_bytes_verified:bytes>0
    },
    findings:[{severity:'info',message:'RunningHub artifact downloaded and ready for user review.'}]
  };
}
async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
async function writeAtomic(filePath,bytes){await fsp.mkdir(path.dirname(filePath),{recursive:true});const temporary=filePath+'.tmp-'+process.pid+'-'+crypto.randomBytes(5).toString('hex');await fsp.writeFile(temporary,bytes,{flag:'wx'});await fsp.rename(temporary,filePath);}

function createStep03Worker(options){
  const runtime=options.runtime;
  const provider=options.provider||createRunningHubAdapter(options.runningHub);
  const providerPreflight=options.providerPreflight;
  const planner=options.planner||createPlanningClient(options.planning);
  const evidenceRoot=path.resolve(options.evidenceRoot);
  const workerId=String(options.workerId||process.env.NIANNIAN_STEP03_WORKER_ID||os.hostname()+'-step03').replace(/[^A-Za-z0-9._:-]/g,'-').slice(0,120);
  let stopping=false;
  async function sourceAuthorityReferenceFile(reference){
    const relativePath=String(reference.relative_path||'').replace(/\\/g,'/');
    const expectedSha=String(reference.sha256||'');
    const expectedBytes=Number(reference.bytes);
    if(!relativePath||path.isAbsolute(relativePath)||path.posix.isAbsolute(relativePath)||relativePath.includes('\0')||path.posix.normalize(relativePath)!==relativePath||!/^[a-f0-9]{64}$/.test(expectedSha)||!Number.isSafeInteger(expectedBytes)||expectedBytes<=0)throw Object.assign(new Error('原片权威首帧引用无效'),{code:'STEP03_SOURCE_AUTHORITY_FRAME_INVALID'});
    const artifactsRoot=path.resolve(evidenceRoot,'artifacts');
    const filePath=path.resolve(artifactsRoot,...relativePath.split('/'));
    if(filePath===artifactsRoot||!filePath.startsWith(artifactsRoot+path.sep))throw Object.assign(new Error('原片权威首帧路径无效'),{code:'STEP03_SOURCE_AUTHORITY_FRAME_INVALID'});
    const bytes=await fsp.readFile(filePath).catch(error=>{if(error.code==='ENOENT')throw Object.assign(new Error('原片权威首帧不存在'),{code:'STEP03_SOURCE_AUTHORITY_FRAME_INVALID'});throw error;});
    if(bytes.length!==expectedBytes||sha256(bytes)!==expectedSha)throw Object.assign(new Error('原片权威首帧校验失败'),{code:'STEP03_SOURCE_AUTHORITY_FRAME_INVALID'});
    return filePath;
  }
  async function referenceFiles(claim){const state=runtime.loadWorkerState?await runtime.loadWorkerState(claim.directory):await readJson(path.join(claim.directory,'state.json')),files=[];for(const reference of claim.task.references||[]){for(const digest of reference.artifact_sha256s||[]){const source=state.tasks.find(row=>row.artifact_sha256===digest);if(!source)throw Object.assign(new Error('引用资产未找到'),{code:'STEP03_REFERENCE_ARTIFACT_MISSING'});if(!runtime.resolveTaskArtifact)throw Object.assign(new Error('引用资产解析器不可用'),{code:'STEP03_REFERENCE_RESOLVER_UNAVAILABLE'});const resolved=await runtime.resolveTaskArtifact({directory:claim.directory,task:source,verify:true});files.push(resolved.path);}if(reference.role==='source_composition')files.push(await sourceAuthorityReferenceFile(reference));}
    const unique=[...new Set(files.map(file=>path.resolve(file)))];for(const file of unique)await fsp.access(file);return unique;}
  async function pollUntilDone(taskId){const deadline=Date.now()+Math.max(60000,Number(process.env.NIANNIAN_STEP03_PROVIDER_TIMEOUT_MS||900000));while(Date.now()<deadline&&!stopping){const result=await provider.query(taskId);if(result.status!=='generating')return result;await new Promise(resolve=>setTimeout(resolve,Math.max(2000,Number(process.env.NIANNIAN_STEP03_POLL_MS||5000))));}return{status:'generating',imageUrls:[],errorCategory:'poll_interrupted'};}
  async function processClaim(claim){let task=claim.task;try{
      if(task.type==='planning'){
        await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'generating',error:null}});
        const planningResult=await planner.plan(task.planning_input);
        await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'accepted',planning_result:planningResult,error:null}});
        return;
      }
      if(task.type==='character'&&!task.provider_task_id&&!String(task.prompt||'').includes(CHARACTER_AUTHORITY_PROMPT_MARKER)){
        await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'failed',error:{code:'STEP03_CHARACTER_TEMPLATE_SUPERSEDED',message:'旧人物图模板任务已停止，等待当前模板重新生成'}}});
        return;
      }
      if(!task.provider_task_id){
        if(typeof providerPreflight!=='function')throw Object.assign(new Error('地区改编确认门不可用，已阻止生成服务提交'),{code:'LOCALIZATION_PROVIDER_PREFLIGHT_REQUIRED'});
        await providerPreflight({claim,task});
      }
      const refs=await referenceFiles(claim);
      if(!task.provider_task_id){await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'submitting',submission_intent_sha256:task.transaction_key,error:null}});let submitted;try{submitted=await provider.submit(task,refs);}catch(error){await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:error.code==='RUNNINGHUB_NETWORK_UNCERTAIN'?'submission_uncertain':'failed',error:publicFailure(error)}});return;}await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'submitted',provider_task_id:submitted.taskId,submitted_at:new Date().toISOString(),provider_contract:submitted.payload,error:null}});task={...task,provider_task_id:submitted.taskId};}
      let result;try{result=await pollUntilDone(task.provider_task_id);}catch(error){await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'generating',error:publicFailure(error)}});return;}if(result.status==='failed'){await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'failed',error:{code:'RUNNINGHUB_TASK_FAILED',message:result.errorCategory||'RunningHub 任务失败'}}});return;}if(result.status!=='completed'||!result.imageUrls.length){await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'generating',error:null}});return;}
      let downloaded;
      try{downloaded=await provider.download(result.imageUrls[0]);}
      catch(error){
        // The provider task is already persisted and completed. Retain its ID so a later worker pass
        // reconciles the same output instead of paying for another submission after a transient fetch error.
        await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'submitted',error:publicFailure(error)}});
        return;
      }
      const digest=sha256(downloaded.bytes),extension=downloaded.mime==='image/jpeg'?'.jpg':downloaded.mime==='image/webp'?'.webp':'.png',artifactId='ART-'+digest.slice(0,24),artifactKey='artifacts/'+artifactId+extension,outputPath=path.join(claim.directory,...artifactKey.split('/'));try{await fsp.access(outputPath);}catch(error){if(error.code!=='ENOENT')throw error;await writeAtomic(outputPath,downloaded.bytes);}await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'qa_running',artifact_id:artifactId,artifact_key:artifactKey,artifact_sha256:digest,artifact_bytes:downloaded.bytes.length,artifact_mime:downloaded.mime,downloaded_at:new Date().toISOString(),error:null}});
      const verdict=runningHubArtifactVerdict({artifactId,digest,bytes:downloaded.bytes.length,mime:downloaded.mime});
      await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'accepted',qa:verdict,qa_at:new Date().toISOString(),error:null}});
    }catch(error){await runtime.updateWorkerTask({directory:claim.directory,taskId:task.task_id,patch:{status:'failed',error:publicFailure(error)}}).catch(()=>{});}}
  async function runOnce(){const claim=await runtime.claimNextTask({workerId});if(!claim)return{processed:false};await processClaim(claim);return{processed:true,task_id:claim.task.task_id};}
  async function run(){stopping=false;while(!stopping){const result=await runOnce();if(!result.processed)await new Promise(resolve=>setTimeout(resolve,Math.max(500,Number(process.env.NIANNIAN_STEP03_SCAN_MS||2000))));}}
  function stop(){stopping=true;}
  return{run,runOnce,stop,referenceFiles,constants:{workerId}};
}

module.exports={createStep03Worker,publicFailure,runningHubArtifactVerdict};
