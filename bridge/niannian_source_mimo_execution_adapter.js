'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');
const specContract = require('./niannian_source_video_task_spec');
const adapterContract = require('./niannian_source_video_adapter_contract');

const STATUS = Object.freeze({queued:50,generating:[20,60],completed:1,failed:40});
const POLL_INTERVAL_MS = 10_000;

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function redactedProviderId(value, prefix) {
  const raw = String(value || '');
  if (!/^[A-Za-z0-9._:-]{3,240}$/.test(raw)) throw adapterContract.contractError('SOURCE_MIMO_PROVIDER_ID_INVALID');
  return prefix + '-' + hash(raw).slice(0,24);
}
async function exactMaterial(reference) {
  const stats = await fsp.lstat(reference.exact_path).catch(()=>null);
  if (!stats?.isFile() || stats.isSymbolicLink()) throw adapterContract.contractError('SOURCE_MIMO_UPLOAD_ARTIFACT_INVALID');
  const bytes = await fsp.readFile(reference.exact_path);
  if (bytes.length!==Number(reference.bytes) || hash(bytes)!==reference.sha256) throw adapterContract.contractError('SOURCE_MIMO_UPLOAD_ARTIFACT_TAMPER');
  return bytes;
}
function createMemoryOpaqueVault(){const values=new Map();return{protection:'memory_test_only',put(key,value){values.set(String(key),String(value));},get(key){if(!values.has(String(key)))throw adapterContract.contractError('SOURCE_MIMO_OPAQUE_ID_VAULT_MISSING');return values.get(String(key));},size(){return values.size;}};}

function createMimoAdapter({transport,mode='synthetic_fake_transport',opaqueVault=createMemoryOpaqueVault()}={}) {
  const fake = mode === 'synthetic_fake_transport';
  if (!transport) throw adapterContract.contractError('SOURCE_MIMO_TRANSPORT_REQUIRED');
  if(!opaqueVault||typeof opaqueVault.put!=='function'||typeof opaqueVault.get!=='function'||(fake?opaqueVault.protection!=='memory_test_only':opaqueVault.protection!=='protected_mac_local'))throw adapterContract.contractError('SOURCE_MIMO_OPAQUE_ID_VAULT_INVALID');
  const adapter = {
    schema_version:'source_video_channel_adapter_v1',channel_id:specContract.CHANNEL,adapter_identity:specContract.ADAPTER_IDENTITY,endpoint_identity:specContract.ENDPOINT_IDENTITY,auth_namespace:specContract.AUTH_NAMESPACE,poll_interval_ms:POLL_INTERVAL_MS,never_call_cancel:true,status_codes:STATUS,mode,
    async preflight({spec}) {
      specContract.validateSpec(spec,{jobRoot:path.dirname(path.dirname(spec.output_roots.transaction_root)),allowTestOnly:true});
      if (spec.provider!==this.channel_id || spec.adapter_identity!==this.adapter_identity || spec.endpoint_identity!==this.endpoint_identity || spec.auth_namespace!==this.auth_namespace) throw adapterContract.contractError('SOURCE_MIMO_SPEC_BINDING_INVALID');
      await specContract.revalidateSpecFiles(spec,{jobRoot:path.dirname(path.dirname(spec.output_roots.transaction_root))});
      if (!fake) throw adapterContract.contractError('SOURCE_MIMO_REAL_PROVIDER_DISABLED');
      const result = await transport.preflight({endpoint_identity:this.endpoint_identity,auth_namespace:this.auth_namespace,network_allowed:false,token_requested:false});
      if (!result || result.status!=='ready' || result.network_called!==false || result.secret_read!==false) throw adapterContract.contractError('SOURCE_MIMO_PREFLIGHT_INVALID');
      return {status:'ready',capability:'fake_mimo_contract',network_called:false,secret_read:false,provider_submit_requested:false};
    },
    async stageUploads({spec}) {
      const materials=[];
      for (const reference of spec.references) {
        await exactMaterial(reference);
        const staged=await transport.stageUpload({asset_id:reference.asset_id,material_type:reference.material_type,sha256:reference.sha256,bytes:reference.bytes,duty_zh:reference.duty_zh,network_allowed:false});
        if(!staged||staged.network_called!==false||!staged.provider_material_id)throw adapterContract.contractError('SOURCE_MIMO_UPLOAD_STAGE_INVALID');
        const providerMaterialId=redactedProviderId(staged.provider_material_id,'material'), audioVid=reference.material_type==='audio'?redactedProviderId(staged.audio_vid||staged.provider_material_id,'audio'):null;
        opaqueVault.put(providerMaterialId,staged.provider_material_id);if(audioVid)opaqueVault.put(audioVid,staged.audio_vid||staged.provider_material_id);
        materials.push({asset_id:reference.asset_id,material_type:reference.material_type,sha256:reference.sha256,bytes:reference.bytes,duty_zh:reference.duty_zh,provider_material_id:providerMaterialId,audio_vid:audioVid});
      }
      const audio=materials.filter(item=>item.material_type==='audio');
      return {status:'uploads_staged',materials,audio_count:audio.length,audio_payload_shape:'audioVid',voice_timbre_status:audio.length&&audio.every(item=>item.audio_vid)?'locked_for_fake_payload':'voice_timbre_unlocked',network_called:false,provider_upload_requested:false};
    },
    async readbackInputs({spec,uploads}) {
      const result=await transport.readbackInputs({spec_id:spec.spec_id,materials:uploads.materials,network_allowed:false});
      if(!result||result.status!=='matched'||result.network_called!==false)throw adapterContract.contractError('SOURCE_MIMO_INPUT_READBACK_INVALID');
      const imagePayload=uploads.materials.filter(item=>item.material_type==='image').map(item=>({material_id:item.provider_material_id}));
      const audioPayload=uploads.materials.filter(item=>item.material_type==='audio').map(item=>({audioVid:item.audio_vid}));
      const executionPayload={prompt_sha256:spec.prompt.sha256,duration:Math.ceil(spec.media.source_duration_seconds),aspectRatio:spec.media.aspect_ratio,images:imagePayload.map(item=>({material_id:opaqueVault.get(item.material_id)})),audio:audioPayload.map(item=>({audioVid:opaqueVault.get(item.audioVid)}))};
      const voiceStatus=audioPayload.length&&audioPayload.every(item=>item.audioVid)?'locked_for_fake_payload':'voice_timbre_unlocked';
      const receipt={status:'inputs_readback',image_count:imagePayload.length,audio_count:audioPayload.length,audio_payload_shape:'audioVid',audio:audioPayload,voice_timbre_status:voiceStatus,payload:{prompt_sha256:spec.prompt.sha256,duration:executionPayload.duration,aspectRatio:executionPayload.aspectRatio,images:imagePayload,audio:audioPayload},network_called:false};
      Object.defineProperty(receipt,'_executionPayload',{value:executionPayload,enumerable:false});return receipt;
    },
    async submit({spec,inputs}) {
      if(!fake||spec.test_only!==true)throw adapterContract.contractError('SOURCE_MIMO_SUBMIT_AUTHORITY_REQUIRED');
      await specContract.revalidateSpecFiles(spec,{jobRoot:path.dirname(path.dirname(spec.output_roots.transaction_root))});
      const result=await transport.submit({transaction_id:spec.transaction_id,payload:inputs._executionPayload||inputs.payload,network_allowed:false,test_only:true});
      if(!result||result.network_called!==false||!result.provider_task_id)throw adapterContract.contractError('SOURCE_MIMO_SUBMIT_UNKNOWN');
      const providerTaskId=redactedProviderId(result.provider_task_id,'task'), recoveryKey=hash(String(result.provider_task_id));opaqueVault.put(recoveryKey,result.provider_task_id);
      return {status:'provider_task_created',provider_task_id:providerTaskId,provider_task_recovery_key:recoveryKey,provider_status:STATUS.queued,network_called:false,provider_submit_requested:false,test_only:true,audio_count:inputs.audio_count,audio_vids:inputs.audio.map(item=>item.audioVid),audio_payload_shape:'audioVid',voice_timbre_status:inputs.voice_timbre_status};
    },
    async poll({providerTask}) {
      const result=await transport.poll({provider_task_id:opaqueVault.get(providerTask.provider_task_recovery_key),interval_ms:POLL_INTERVAL_MS,never_call_cancel:true,network_allowed:false});
      if(!result||result.network_called!==false)throw adapterContract.contractError('SOURCE_MIMO_POLL_INVALID');
      const code=Number(result.provider_status);
      if(code===STATUS.failed)throw adapterContract.contractError('SOURCE_MIMO_PROVIDER_FAILED');
      if(code!==STATUS.completed&&!STATUS.generating.includes(code)&&code!==STATUS.queued)throw adapterContract.contractError('SOURCE_MIMO_PROVIDER_STATUS_INVALID');
      const downloadKey=result.download_key?hash(String(result.download_key)):null;if(downloadKey)opaqueVault.put(downloadKey,result.download_key);
      return {status:code===STATUS.completed?'completed':'polling',provider_status:code,provider_task_id:providerTask.provider_task_id,provider_task_recovery_key:providerTask.provider_task_recovery_key,download_key:downloadKey,network_called:false,poll_interval_ms:POLL_INTERVAL_MS,cancel_called:false};
    },
    async download({spec,poll}) {
      if(poll.status!=='completed'||!poll.download_key)throw adapterContract.contractError('SOURCE_MIMO_DOWNLOAD_NOT_READY');
      const result=await transport.download({download_key:opaqueVault.get(poll.download_key),output_root:spec.output_roots.media_root,network_allowed:false});
      if(!result||result.network_called!==false||!Buffer.isBuffer(result.bytes)||!result.bytes.length)throw adapterContract.contractError('SOURCE_MIMO_DOWNLOAD_INVALID');
      await fsp.mkdir(spec.output_roots.media_root,{recursive:true});
      const outputPath=path.join(spec.output_roots.media_root,'synthetic-'+spec.group_id.toLowerCase()+'.mp4');
      const existing=await fsp.readFile(outputPath).catch(()=>null);
      if(existing){if(hash(existing)!==hash(result.bytes))throw adapterContract.contractError('SOURCE_MIMO_DOWNLOAD_IDEMPOTENCY_CONFLICT');}
      else await fsp.writeFile(outputPath,result.bytes,{flag:'wx'});
      return {status:'downloaded',exact_path:outputPath,sha256:hash(result.bytes),bytes:result.bytes.length,network_called:false,test_only:true};
    },
    async probe({spec,download}) {
      const artifact=await fsp.readFile(download.exact_path).catch(()=>null);if(!artifact||artifact.length!==Number(download.bytes)||hash(artifact)!==download.sha256)throw adapterContract.contractError('SOURCE_MIMO_DOWNLOADED_ARTIFACT_TAMPER');
      const result=await transport.probe({exact_path:download.exact_path,sha256:download.sha256,expected:{duration_sec:spec.media.duration_sec,aspect_ratio:spec.media.aspect_ratio,audio_required:spec.media.audio_count>0}});
      if(!result||result.status!=='passed')throw adapterContract.contractError('SOURCE_MIMO_MEDIA_PROBE_FAILED');
      const duration=Number(result.duration_sec),width=Number(result.width),height=Number(result.height),audioStreams=Number(result.audio_stream_count||0),expectedResolution=String(spec.qa_requirements.resolution_policy).match(/^(\d+)x(\d+)$/);
      if(!Number.isFinite(duration)||Math.abs(duration-Number(spec.media.duration_sec))>Number(spec.qa_requirements.duration_tolerance_seconds)||!Number.isFinite(width)||!Number.isFinite(height)||Math.abs(width/height-9/16)>0.02||(expectedResolution&&(width!==Number(expectedResolution[1])||height!==Number(expectedResolution[2])))||(spec.qa_requirements.audio_required&&audioStreams<1))throw adapterContract.contractError('SOURCE_MIMO_MEDIA_PROBE_FAILED');
      const receipt={status:'passed',artifact_sha256:download.sha256,duration_sec:duration,width,height,audio_stream_count:audioStreams,requirements:spec.qa_requirements,test_only:true};receipt.receipt_sha256=specContract.canonicalSha(receipt);return receipt;
    },
    async visualQa({spec,download,probe}) {
      const result=await transport.visualQa({spec_id:spec.spec_id,artifact_sha256:download.sha256,probe,test_only:true,local_image_editing_allowed:false});
      if(!result||result.status!=='passed'||result.independent_receipt!==true||!/^[a-f0-9]{64}$/.test(String(result.evidence_sha256||''))||!Array.isArray(result.checks)||!result.checks.length||result.local_image_editing_used!==false)throw adapterContract.contractError('SOURCE_MIMO_CONTENT_QUALITY_FAILED');
      const receipt={status:'passed',artifact_sha256:download.sha256,probe_receipt_sha256:probe.receipt_sha256,checks:result.checks,evidence_sha256:result.evidence_sha256,independent_receipt:true,local_image_editing_used:false,test_only:true};receipt.receipt_sha256=specContract.canonicalSha(receipt);return receipt;
    },
    classifyError(error) {
      const code=String(error?.code||error?.message||'');
      if(/STALE|AUTHORITY/.test(code))return adapterContract.typedBlocker('stale_authority',code,false);
      if(/AUTH|TOKEN|KEYCHAIN/.test(code))return adapterContract.typedBlocker('auth',code,true);
      if(/CAPABILITY/.test(code))return adapterContract.typedBlocker('capability',code,true);
      if(/QUOTA/.test(code))return adapterContract.typedBlocker('quota',code,false);
      if(/COST/.test(code))return adapterContract.typedBlocker('cost_authorization',code,false);
      if(/POLICY/.test(code))return adapterContract.typedBlocker('provider_policy',code,false);
      if(/UPLOAD/.test(code))return adapterContract.typedBlocker('upload',code,true);
      if(/SUBMIT_UNKNOWN/.test(code))return adapterContract.typedBlocker('submit_unknown',code,true);
      if(/PROVIDER_FAILED/.test(code))return adapterContract.typedBlocker('provider_failed',code,false);
      if(/POLL/.test(code))return adapterContract.typedBlocker('poll_timeout',code,true);
      if(/DOWNLOAD/.test(code))return adapterContract.typedBlocker('download',code,true);
      if(/PROBE/.test(code))return adapterContract.typedBlocker('media_probe',code,true);
      if(/QUALITY/.test(code))return adapterContract.typedBlocker('content_quality',code,false);
      return adapterContract.typedBlocker('transport',code,true);
    },
    async resume({spec,providerTask,submitUnknown=false}) {
      if(submitUnknown===true){
        const recovered=await transport.reconcileSubmission({transaction_id:spec.transaction_id,idempotency_key:spec.idempotency_key,prompt_sha256:spec.prompt.sha256,network_allowed:false,never_call_cancel:true});
        if(!recovered||recovered.network_called!==false||recovered.unique_match!==true||!recovered.provider_task_id)throw adapterContract.contractError('SOURCE_MIMO_SUBMIT_UNKNOWN');
        const providerTaskId=redactedProviderId(recovered.provider_task_id,'task'),recoveryKey=hash(String(recovered.provider_task_id)),downloadKey=recovered.download_key?hash(String(recovered.download_key)):null;opaqueVault.put(recoveryKey,recovered.provider_task_id);if(downloadKey)opaqueVault.put(downloadKey,recovered.download_key);
        return {provider_task_id:providerTaskId,provider_task_recovery_key:recoveryKey,provider_status:Number(recovered.provider_status||STATUS.queued),download_key:downloadKey,network_called:false,reconciled:true,submit_unknown_reconciled:true};
      }
      if(!providerTask?.provider_task_recovery_key)throw adapterContract.contractError('SOURCE_MIMO_RESUME_TASK_REQUIRED');
      const result=await transport.reconcile({provider_task_id:opaqueVault.get(providerTask.provider_task_recovery_key),network_allowed:false,never_call_cancel:true});
      if(!result||result.network_called!==false||result.unique_match!==true)throw adapterContract.contractError('SOURCE_MIMO_SUBMIT_UNKNOWN');
      return {provider_task_id:providerTask.provider_task_id,provider_task_recovery_key:providerTask.provider_task_recovery_key,provider_status:Number(result.provider_status),download_key:result.download_key?hash(String(result.download_key)):null,network_called:false,reconciled:true};
    }
  };
  return adapterContract.validateAdapter(adapter);
}

module.exports={POLL_INTERVAL_MS,STATUS,createMemoryOpaqueVault,createMimoAdapter,redactedProviderId};
