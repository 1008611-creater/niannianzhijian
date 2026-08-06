'use strict';

const assert=require('assert');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const release=require('./bridge/niannian_mac_bridge_release');

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'niannian-bridge-release-'));
  try{
    const bundle=await release.buildReleaseBundle({sourceRoot:__dirname,bundleRoot:path.join(root,'bundle')});
    await assert.rejects(()=>release.buildReleaseBundle({sourceRoot:__dirname,bundleRoot:path.join(root,'override'),releaseVersion:'2026.07.21.999'}),/version_override_rejected/);
    const verified=await release.verifyReleaseBundle({bundleRoot:bundle.bundle_root});
    assert.equal(verified.manifest.release_version,release.RELEASE_VERSION);
    assert.equal(verified.manifest.files.length,release.BRIDGE_FILE_ALLOWLIST.length);
    assert.equal(verified.manifest.files.find(row=>row.path==='bridge/mac_relay_ssh_gateway.sh').install_target,'home:.local/bin/ai-brain-mac-relay-gateway.sh');
    assert.equal(verified.manifest.files.find(row=>row.path==='bridge/com.niannian.ai-brain.hq-refresh.plist').install_target,'home:Library/LaunchAgents/com.niannian.ai-brain.hq-refresh.plist');
    assert(verified.manifest.files.some(row=>row.path==='bridge/mac-employee-training/execute_redraw_step01_hq_full.js'));
    assert(verified.manifest.files.some(row=>row.path==='bridge/mac-employee-training/Run-NianNian-Step01-HQ-Composite.command'));
    for(const dependency of ['bridge/mac-employee-training/run_step01_hq_composite_probe.py','bridge/mac-employee-training/build_step01_hq_full_gate_v2.js','bridge/mac-employee-training/promote_step01_hq_full_toolchain.js','bridge/niannian_step01_hq_full_gate_v2.js'])assert(verified.manifest.files.some(row=>row.path===dependency),'missing sealed HQ launcher dependency: '+dependency);
    assert(verified.manifest.files.some(row=>row.path==='bridge/niannian_redraw_step01_mac_app_phase_transport.js'));
    assert.equal(verified.manifest.install_contract.sshd_reinstall_scope,'topology_key_or_listener_policy_change_only');
    const ready=release.negotiateBridge({release_version:release.RELEASE_VERSION,manifest_sha256:bundle.manifest_sha256},{status:'installed_verified',release_version:release.RELEASE_VERSION,manifest_sha256:bundle.manifest_sha256});
    assert.equal(ready.ready,true);
    const missing=release.bootstrapPlan({release_version:release.RELEASE_VERSION},{status:'missing'});
    assert.equal(missing.status,'mac_bridge_update_required');
    assert.equal(missing.execution_surface,'mac_codex_desktop_app_current_task');
    assert.equal(missing.forced_ssh_gateway_deploy_allowed,false);
    const oldInstalled=release.bootstrapPlan({release_version:release.RELEASE_VERSION},{status:'installed_verified',release_version:'2026.07.17.2',manifest_sha256:'a'.repeat(64)});
    assert.equal(oldInstalled.ordinary_update_allowed,false);
    assert.equal(oldInstalled.execution_surface,'mac_codex_desktop_app_current_task');
    const currentInstalled=release.bootstrapPlan({release_version:release.RELEASE_VERSION},{status:'installed_verified',release_version:release.RELEASE_VERSION,manifest_sha256:bundle.manifest_sha256});
    assert.equal(currentInstalled.ordinary_update_allowed,true);
    assert.equal(currentInstalled.execution_surface,'installed_fixed_install_release_relay');
    const ack=release.fixedAppBootstrapAcknowledgement({release_version:release.RELEASE_VERSION,manifest_sha256:bundle.manifest_sha256});
    assert.equal(ack.read_only,true);
    assert.equal(ack.production_write_requested,false);
    assert.equal(ack.shell_command_requested,false);
    const secretRoot=path.join(root,'secret-source');
    for(const relative of release.BRIDGE_FILE_ALLOWLIST){const target=path.join(secretRoot,...relative.split('/'));await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.copyFile(path.join(__dirname,...relative.split('/')),target);}
    await fsp.appendFile(path.join(secretRoot,...release.BRIDGE_FILE_ALLOWLIST[0].split('/')),'\napi_key="fixturecredential123456"\n');
    await assert.rejects(()=>release.buildReleaseBundle({sourceRoot:secretRoot,bundleRoot:path.join(root,'secret-bundle')}),/sensitive_content/);
    await fsp.appendFile(path.join(bundle.bundle_root,...release.BRIDGE_FILE_ALLOWLIST[0].split('/')),'tamper');
    await assert.rejects(()=>release.verifyReleaseBundle({bundleRoot:bundle.bundle_root}),/hash_mismatch/);
  }finally{await fsp.rm(root,{recursive:true,force:true});}
  process.stdout.write(JSON.stringify({ok:true,verified:['sealed bootstrap inventory includes bridge plus Step01 Mac executor runtime','sha and bounded regular-file verification','literal credential rejection without code-expression false positives','bridge version negotiation','old gateway cannot claim autonomous install-release','current gateway permits fixed install-release','sshd changes limited to topology policy','fixed App bootstrap acknowledgement is read-only']})+'\n');
}

main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
