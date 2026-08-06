'use strict';

const assert=require('assert');
const executor=require('./bridge/niannian_redraw_step01_fixed_app_phase_executor');

async function main(){
  assert.equal(executor.artifactTransportMode({artifactTransportMode:'cos'}),'cos');
  assert.equal(executor.artifactTransportMode({artifactTransportMode:'legacy_ssh',allowLegacySshTransport:true}),'legacy_ssh');
  assert.throws(()=>executor.artifactTransportMode({artifactTransportMode:'legacy_ssh'}),error=>error.code==='ARTIFACT_BROKER_NOT_CONFIGURED');
  await assert.rejects(()=>executor.copyPackageFromBroker({phaseKey:'step01phase-'+'a'.repeat(64),manifestSha256:'b'.repeat(64)}),error=>error.code==='ARTIFACT_BROKER_NOT_CONFIGURED');
  await assert.rejects(()=>executor.pushReturnToBroker({requestId:'request-0001',phaseKey:'step01phase-'+'a'.repeat(64)}),error=>error.code==='ARTIFACT_RETURN_UPLOAD_FAILED');
  process.stdout.write(JSON.stringify({ok:true,verified:['default fixed executor data mode is COS broker','legacy SCP requires explicit historical-recovery opt-in','missing broker session is typed and never falls through to SCP']})+'\n');
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
