'use strict';

const crypto=require('crypto');
const fsp=require('fs').promises;
const os=require('os');
const path=require('path');
const {activeProfile}=require('./niannian_employee_model_profiles');

const FORBIDDEN=new Set(['experimental_bearer_token','http_headers','http_headers_json','authorization']);
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function quoted(value){return JSON.stringify(value);}
function scalar(value){return typeof value==='string'?quoted(value):String(value);}
function rootFields(profile){return [
  ['model_provider',quoted(profile.config_provider_id)],
  ...(profile.model?[['model',quoted(profile.model)]]:[]),
  ...(profile.review_model?[['review_model',quoted(profile.review_model)]]:[]),
  ...(profile.model_reasoning_effort?[['model_reasoning_effort',quoted(profile.model_reasoning_effort)]]:[]),
  ...(typeof profile.disable_response_storage==='boolean'?[['disable_response_storage',String(profile.disable_response_storage)]]:[]),
  ...(profile.network_access?[['network_access',quoted(profile.network_access)]]:[])
];}
function providerFields(profile){return [
  ['name',quoted(profile.provider_name)],
  ['base_url',quoted(profile.base_url)],
  ['wire_api',quoted(profile.wire_api)],
  ['requires_openai_auth',String(profile.requires_openai_auth)],
  ...(profile.provider_env_key?[['env_key',quoted(profile.provider_env_key)]]:[])
];}
function desiredMap(entries){return new Map(entries);}
function replaceField(line,key,value,present,normalized){
  const match=line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
  if(!match||match[1]!==key)return null;
  present.add(key);
  if(line.trim()!==`${key} = ${value}`)normalized.count+=1;
  return `${key} = ${value}`;
}
function repairText(source,options={}){
  const profile=options.profile||activeProfile(options);
  if(profile.credential_mode==='native_account')throw new Error('employee_model_native_account_global_config_write_forbidden');
  const roots=desiredMap(rootFields(profile)),providers=desiredMap(providerFields(profile));
  const lines=String(source).split(/\r?\n/);let section='root',providerSeen=false,removed=0;
  const rootPresent=new Set(),providerPresent=new Set(),normalized={count:0},output=[];
  const appendMissing=(target,present)=>{for(const [key,value] of target)if(!present.has(key)){output.push(`${key} = ${value}`);normalized.count+=1;}};
  for(const line of lines){
    const sectionMatch=line.trim().match(/^\[([^\]]+)\]$/);
    if(sectionMatch){
      if(section==='root')appendMissing(roots,rootPresent);
      if(section===`model_providers.${profile.config_provider_id}`)appendMissing(providers,providerPresent);
      section=sectionMatch[1];
      if(section===`model_providers.${profile.config_provider_id}`)providerSeen=true;
      output.push(line);continue;
    }
    if(section==='root'){
      const key=line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
      if(key&&roots.has(key)){output.push(replaceField(line,key,roots.get(key),rootPresent,normalized));continue;}
    }
    if(section===`model_providers.${profile.config_provider_id}`){
      const key=line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
      if(key&&FORBIDDEN.has(key)){removed+=1;continue;}
      if(key&&providers.has(key)){output.push(replaceField(line,key,providers.get(key),providerPresent,normalized));continue;}
      if(key==='env_key'&&!profile.provider_env_key){removed+=1;continue;}
    }
    output.push(line);
  }
  if(section==='root')appendMissing(roots,rootPresent);
  if(section===`model_providers.${profile.config_provider_id}`)appendMissing(providers,providerPresent);
  if(!providerSeen){output.push('',`[model_providers.${profile.config_provider_id}]`);appendMissing(providers,providerPresent);}
  return {text:output.join('\n'),removed,normalized:normalized.count,profile};
}
function parseToml(source){
  const values={root:{}};let section='root';
  for(const raw of String(source).split(/\r?\n/)){const line=raw.replace(/\s+#.*$/,'').trim();if(!line)continue;const heading=line.match(/^\[([^\]]+)\]$/);if(heading){section=heading[1];values[section]||={};continue;}const item=line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);if(!item)continue;const value=item[2].trim();values[section][item[1]]=/^(true|false)$/i.test(value)?value.toLowerCase()==='true':value.replace(/^(['"])(.*)\1$/,'$2');}return values;
}
function auditText(source,options={}){
  const profile=options.profile||activeProfile(options),values=parseToml(source),provider=values[`model_providers.${profile.config_provider_id}`]||{};
  const forbidden=Object.keys(provider).some(key=>FORBIDDEN.has(key));
  const root=values.root||{};
  const nativeAccount=profile.credential_mode==='native_account';
  const matches=nativeAccount?{launch_override_model_provider:true,native_account_requires_openai_auth:profile.requires_openai_auth===true,process_env_keys_empty:profile.process_env_keys.length===0}:Object.fromEntries([...rootFields(profile),...providerFields(profile)].map(([key,value])=>[key,String(rootFields(profile).some(([rootKey])=>rootKey===key)?root[key]:provider[key])===String(value).replace(/^"|"$/g,'')]));
  const valid=nativeAccount?Object.values(matches).every(Boolean):root.model_provider===profile.config_provider_id&&(profile.credential_mode==='cockpit_managed_auth'||!forbidden)&&Object.values(matches).every(Boolean)&&(!profile.provider_env_key||provider.env_key===profile.provider_env_key);
  const observedProviderId=String(root.model_provider||''),observedProvider=values[`model_providers.${observedProviderId}`]||{};
  const credentialSource=observedProvider.env_key?'declared_env_key':observedProvider.requires_openai_auth===true?'cockpit_managed_auth':'undeclared';
  return {valid,contract:{provider_id:profile.provider_id,provider_config_id:profile.config_provider_id,provider_name:profile.provider_name,base_url:profile.base_url,wire_api:profile.wire_api,requires_openai_auth:profile.requires_openai_auth,launch_mode:nativeAccount?'native_account':'configured_provider',launch_override_applied:nativeAccount,launch_override_keys:nativeAccount?['model_provider']:[],credential_source:nativeAccount?'codex_home_account_session':credentialSource,model:profile.model,review_model:profile.review_model,model_reasoning_effort:profile.model_reasoning_effort,disable_response_storage:profile.disable_response_storage,network_access:profile.network_access,process_env_keys:[...profile.process_env_keys],observed_model_provider:observedProviderId||null,observed_provider_name:typeof observedProvider.name==='string'?observedProvider.name:null,observed_base_url:typeof observedProvider.base_url==='string'?observedProvider.base_url:null,observed_wire_api:typeof observedProvider.wire_api==='string'?observedProvider.wire_api:null,observed_requires_openai_auth:typeof observedProvider.requires_openai_auth==='boolean'?observedProvider.requires_openai_auth:null,observed_credential_source:credentialSource,observed_env_key_name:typeof observedProvider.env_key==='string'?observedProvider.env_key:null,forbidden_static_fields_present:forbidden,forbidden_static_fields_in_selected_launch_route:nativeAccount?false:forbidden,field_matches:matches,raw_auth_read:false,raw_secret_recorded:false}};
}
async function audit(options={}){
  const configPath=path.resolve(options.configPath||path.join(os.homedir(),'.codex','config.toml'));const profile=options.profile||activeProfile(options);const result=auditText(await fsp.readFile(configPath,'utf8'),{...options,profile});
  let runtime={checked:false,account_present:null,requires_openai_auth:null,default_model:null,default_model_id:null,model_catalog_count:0,status:'not_checked'};
  if(options.runtimeReadback===true&&profile.credential_mode==='native_account'){
    const {AppServerClient,CODEX_PATH,inspectNativeAccountRuntime}=require('./mac_codex_app_employee_bootstrap');const client=options.client||new AppServerClient(options.codexPath||CODEX_PATH,profile.app_server_transport,profile),owns=!options.client;
    try{if(owns)await client.start();const readback=await inspectNativeAccountRuntime(client,profile);runtime={checked:true,account_present:readback.account_present,requires_openai_auth:readback.requires_openai_auth,default_model:readback.default_model,default_model_id:readback.default_model_id,model_catalog_count:readback.model_catalog_count,status:'ready'};}
    catch{runtime={checked:true,account_present:false,requires_openai_auth:null,default_model:null,default_model_id:null,model_catalog_count:0,status:'native_account_not_ready'};}
    finally{if(owns)client.close();}
  }
  const valid=result.valid&&(options.runtimeReadback!==true||runtime.status==='ready');return {schema_version:'niannian_employee_model_config_audit_v3',status:valid?'valid':'invalid',...result.contract,runtime_auth:runtime,config_present:true,provider_called:false,project_media_processed:false,repaired:false,audited_at:new Date().toISOString()};
}
async function repair(options={}){const configPath=path.resolve(options.configPath||path.join(os.homedir(),'.codex','config.toml')),receiptPath=path.resolve(options.receiptPath||path.join(os.homedir(),'.local','share','niannian-ai','employee-model-config-repair-receipt.json'));const source=await fsp.readFile(configPath);const repaired=repairText(source.toString('utf8'),options),backupPath=configPath+'.backup-provider-profile-'+new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14),temporary=configPath+'.staging-'+process.pid;await fsp.writeFile(backupPath,source,{flag:'wx',mode:0o600});await fsp.writeFile(temporary,repaired.text,{flag:'wx',mode:0o600});await fsp.rename(temporary,configPath);const installed=await fsp.readFile(configPath);const receipt={schema_version:'niannian_employee_model_config_repair_v2',status:'repaired',provider_id:repaired.profile.provider_id,provider_config_id:repaired.profile.config_provider_id,requires_openai_auth:repaired.profile.requires_openai_auth,forbidden_fields_removed:repaired.removed,non_secret_contract_fields_normalized:repaired.normalized,config_sha256_before:sha256(source),config_sha256_after:sha256(installed),config_bytes_after:installed.length,backup_path:backupPath,raw_secret_recorded:false,provider_called:false,repaired_at:new Date().toISOString()};await fsp.mkdir(path.dirname(receiptPath),{recursive:true});const temp=receiptPath+'.tmp-'+process.pid;await fsp.writeFile(temp,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});await fsp.rename(temp,receiptPath);return receipt;}
async function rollbackLatest(options={}){const configPath=path.resolve(options.configPath||path.join(os.homedir(),'.codex','config.toml')),repairReceiptPath=path.resolve(options.repairReceiptPath||path.join(os.homedir(),'.local','share','niannian-ai','employee-model-config-repair-receipt.json')),receiptPath=path.resolve(options.receiptPath||path.join(os.homedir(),'.local','share','niannian-ai','employee-model-config-rollback-receipt.json'));const repairReceipt=JSON.parse(await fsp.readFile(repairReceiptPath,'utf8'));if(repairReceipt.schema_version!=='niannian_employee_model_config_repair_v2'||repairReceipt.status!=='repaired'||typeof repairReceipt.backup_path!=='string'||!/^[a-f0-9]{64}$/.test(repairReceipt.config_sha256_before)||!/^[a-f0-9]{64}$/.test(repairReceipt.config_sha256_after))throw new Error('employee_model_config_rollback_repair_receipt_invalid');const backupPath=path.resolve(repairReceipt.backup_path);if(path.dirname(backupPath)!==path.dirname(configPath)||!path.basename(backupPath).startsWith(path.basename(configPath)+'.backup-provider-profile-'))throw new Error('employee_model_config_rollback_backup_path_rejected');const [current,backup]=await Promise.all([fsp.readFile(configPath),fsp.readFile(backupPath)]);if(sha256(current)!==repairReceipt.config_sha256_after)throw new Error('employee_model_config_rollback_current_drift');if(sha256(backup)!==repairReceipt.config_sha256_before)throw new Error('employee_model_config_rollback_backup_drift');const temporary=configPath+'.rollback-'+process.pid;await fsp.writeFile(temporary,backup,{flag:'wx',mode:0o600});await fsp.rename(temporary,configPath);const restored=await fsp.readFile(configPath);if(sha256(restored)!==repairReceipt.config_sha256_before)throw new Error('employee_model_config_rollback_verify_failed');const receipt={schema_version:'niannian_employee_model_config_rollback_v1',status:'restored_verified',config_sha256_before:repairReceipt.config_sha256_after,config_sha256_after:sha256(restored),restored_backup_sha256:sha256(backup),repair_receipt_path:repairReceiptPath,raw_secret_recorded:false,provider_called:false,rolled_back_at:new Date().toISOString()};await fsp.mkdir(path.dirname(receiptPath),{recursive:true});const temp=receiptPath+'.tmp-'+process.pid;await fsp.writeFile(temp,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});await fsp.rename(temp,receiptPath);return receipt;}
if(require.main===module){const args=process.argv.slice(2),auditOnly=args.length===1&&args[0]==='--audit';(auditOnly?audit({runtimeReadback:true}):Promise.reject(new Error('native_account_global_config_write_forbidden'))).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});}
module.exports={FORBIDDEN,audit,auditText,parseToml,repair,repairText,rollbackLatest,rootFields,providerFields};
