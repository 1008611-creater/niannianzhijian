'use strict';

const crypto=require('crypto');
const broker=require('./niannian_step01_artifact_broker');

async function main(){
  const config=broker.configuredCosBroker(process.env);
  if(config.ready!==true){process.stdout.write(JSON.stringify({ok:false,code:'ARTIFACT_BROKER_NOT_CONFIGURED',provider:'tencent-cos',state_mutated:false})+'\n');process.exitCode=2;return;}
  const suffix=crypto.randomBytes(8).toString('hex');
  const binding={project_id:'NN-STEP01-PROBE-0001',analysis_run_id:'analysis-broker-probe-'+suffix,phase_key:'step01phase-'+crypto.createHash('sha256').update('probe|'+suffix).digest('hex'),package_manifest_sha256:crypto.createHash('sha256').update('probe-manifest|'+suffix).digest('hex')};
  const receipt=await broker.runSyntheticProbe(broker.createCosBroker(config),binding,{request_id:'probe-'+suffix});
  process.stdout.write(JSON.stringify({ok:true,receipt})+'\n');
}
main().catch(error=>{process.stdout.write(JSON.stringify({ok:false,code:error.code||'ARTIFACT_BROKER_PROBE_FAILED',diagnostic:broker.sanitizeDiagnostic(error,'synthetic_probe')})+'\n');process.exitCode=1;});
