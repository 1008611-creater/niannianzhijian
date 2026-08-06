'use strict';
const assert=require('assert');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const {PROFILES}=require('./bridge/niannian_employee_model_profiles');
const {audit,auditText,repair,repairText,rollbackLatest}=require('./bridge/repair_mac_krill_env_only_config');

async function main(){
  const root=await fsp.mkdtemp(path.join(os.tmpdir(),'employee-profile-'));
  try{
    const config=path.join(root,'config.toml'),receipt=path.join(root,'receipt.json');
    const selectedProfile=PROFILES.mcgrox;
    const source='model_provider = "codex_local_access"\nmodel = "wrong"\n[model_providers.other]\nexperimental_bearer_token = "unrelated"\n[model_providers.codex_local_access]\nname = "OpenAI"\nenv_key = "KRILL_CODEX_API_KEY"\nrequires_openai_auth = false\nexperimental_bearer_token = "selected-secret"\nhttp_headers = { x = "selected-static" }\n';
    const projected=repairText(source,{profile:selectedProfile});
    assert.equal(projected.removed,3);assert(projected.text.includes('experimental_bearer_token = "unrelated"'));assert(!projected.text.includes('selected-secret'));assert(!projected.text.includes('selected-static'));assert(projected.text.includes('model_provider = "codex_local_access"'));assert(projected.text.includes('requires_openai_auth = true'));assert(!projected.text.includes('env_key = "KRILL_CODEX_API_KEY"'));
    const auditBefore=auditText(source,{profile:selectedProfile});assert.equal(auditBefore.valid,false);assert.equal(auditBefore.contract.raw_secret_recorded,false);
    await fsp.writeFile(config,source,{mode:0o600});const result=await repair({configPath:config,receiptPath:receipt,profile:selectedProfile});assert.equal(result.status,'repaired');assert.equal(result.provider_config_id,'codex_local_access');assert.equal(result.requires_openai_auth,true);assert.equal((await fsp.readFile(receipt,'utf8')).includes('selected-secret'),false);
    const auditAfter=await audit({configPath:config,profile:selectedProfile});assert.equal(auditAfter.status,'valid');assert.equal(auditAfter.provider_config_id,'codex_local_access');assert.equal(auditAfter.requires_openai_auth,true);assert.equal(auditAfter.raw_secret_recorded,false);
    const rollbackReceipt=path.join(root,'rollback.json');const rollback=await rollbackLatest({configPath:config,repairReceiptPath:receipt,receiptPath:rollbackReceipt});assert.equal(rollback.status,'restored_verified');assert.equal(await fsp.readFile(config,'utf8'),source);assert.equal((await fsp.readFile(rollbackReceipt,'utf8')).includes('selected-secret'),false);
    const asxs=repairText('model_provider="codex_local_access"\n[model_providers.codex_local_access]\nwire_api="chat_completions"\nrequires_openai_auth=true\n',{profile:PROFILES.asxs});assert(asxs.text.includes('env_key = "KRILL_CODEX_API_KEY"'));assert(asxs.text.includes('requires_openai_auth = false'));
    process.stdout.write(JSON.stringify({ok:true,verified:['McGrox OpenAI auth contract replaces legacy profile','legacy env_key removed from McGrox provider','selected static credential fields removed','unrelated provider untouched','redacted repair receipt','SHA-bound rollback restores only the exact repair backup','ASXS compatibility profile remains explicit']})+'\n');
  }finally{await fsp.rm(root,{recursive:true,force:true});}
}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
