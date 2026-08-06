'use strict';

const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const {acquireLease,finalizeMacReturn,releaseLease} = require('./niannian_n06_mac_app_phase_transport');
const {
  AppServerClient,
  CODEX_PATH,
  PROJECT_ROOT,
  THREADS,
  assertCompletedTurn,
  hasActiveTurn,
  inspectEmployeeModelChannel,
  summarizeThread
} = require('./mac_codex_app_employee_bootstrap');

async function readJson(filePath){return JSON.parse(await fsp.readFile(filePath,'utf8'));}
async function writeJson(filePath,value){const temp=filePath+'.tmp-'+process.pid;await fsp.writeFile(temp,JSON.stringify(value,null,2)+'\n','utf8');await fsp.rename(temp,filePath);}

function dispatchPrompt(dispatch, dispatchPath) {
  const runner=path.join(PROJECT_ROOT,'bridge','mac-employee-training','execute_website_dispatch.js');
  return [
    `你正在执行网站派给“${dispatch.employee.title}”的零媒体 Provider 测试任务 ${dispatch.dispatch_id}。`,
    '先只读 AGENTS.md、bridge/mac-employee-training/route_matrix.json、13-Skill manifest 和本 dispatch；核对 exact transaction/spec/prompt/reference SHA。',
    '只允许在 dispatch 指定的独立 workspace 写 test_only 证据。禁止修改共享源码，禁止读取任何 Key/Token/Cookie，禁止网络、Mimo/Image2 上传、生成、扣费、部署、生产数据写入。',
    '执行下面这一条项目内受控命令：',
    `~/.local/bin/node "${runner}" --dispatch "${dispatchPath}"`,
    '命令成功后只汇报 dispatch_id、transaction/spec/prompt SHA、4 个参考职责校验、fake task/poll/download、测试 ffprobe/visual QA、媒体 Provider 未调用、real_delivery=false 与 V002 仍关闭。'
  ].join('\n');
}

async function run(options={}) {
  const dispatchPath=path.resolve(options.dispatchPath);
  const workspace=path.dirname(dispatchPath);
  const dispatch=await readJson(dispatchPath);
  if(dispatch.schema_version!=='niannian_n06_mac_employee_dispatch_v1'||dispatch.execution_mode!=='synthetic_fake_transport_only'||dispatch.test_only!==true)throw new Error('mac_employee_dispatch_contract_invalid');
  const employee=THREADS.find(item=>item.thread_id===dispatch.employee?.thread_id&&item.employee===dispatch.employee?.employee&&item.title===dispatch.employee?.title);
  if(!employee)throw new Error('mac_employee_dispatch_thread_not_allowlisted');
  if(path.resolve(dispatch.employee.workspace)!==workspace)throw new Error('mac_employee_dispatch_workspace_mismatch');
  const outputPath=path.join(workspace,'mac_employee_dispatch_control_receipt.json');
  const existing=await readJson(outputPath).catch(()=>null);
  if(existing&&existing.dispatch_id===dispatch.dispatch_id&&existing.completion_event?.status==='completed')return existing;
  const leasePath=path.join(path.dirname(workspace),'.phase-leases',dispatch.idempotency_key||dispatch.dispatch_id);
  await fsp.mkdir(path.dirname(leasePath),{recursive:true});
  const phaseLease=await acquireLease({leasePath,phase:dispatch,ownerId:'mac-app-employee-'+employee.employee,ttlMs:15*60*1000});
  const modelChannel=await inspectEmployeeModelChannel(options.configPath);
  if(!modelChannel.valid)throw new Error(modelChannel.issue);
  const client=options.client||new AppServerClient(options.codexPath||CODEX_PATH,options.transport||'stdio');
  const ownsClient=!options.client;
  try{
    if(ownsClient)await client.start();
    const before=(await client.request('thread/read',{threadId:employee.thread_id,includeTurns:true})).thread;
    const beforeSummary=summarizeThread(before);
    if(beforeSummary.cwd!==PROJECT_ROOT||beforeSummary.title!==employee.title)throw new Error('mac_employee_dispatch_thread_identity_mismatch');
    if(hasActiveTurn(beforeSummary))throw new Error('mac_employee_dispatch_active_turn');
    if(beforeSummary.status&&beforeSummary.status.type==='notLoaded')await client.request('thread/resume',{threadId:employee.thread_id,cwd:PROJECT_ROOT,approvalPolicy:'never',excludeTurns:true});
    const started=await client.request('turn/start',{threadId:employee.thread_id,cwd:PROJECT_ROOT,approvalPolicy:'never',sandboxPolicy:{type:'workspaceWrite',writableRoots:[workspace],networkAccess:false},input:[{type:'text',text:dispatchPrompt(dispatch,dispatchPath),text_elements:[]}]});
    dispatch.phase='employee_turn_started';
    dispatch.status='claimed';
    dispatch.lease={status:'claimed',lease_id:started.turn.id,owner_thread_id:employee.thread_id,claimed_at:new Date().toISOString(),completed_at:null};
    await writeJson(dispatchPath,dispatch);
    const completion=assertCompletedTurn(await client.waitForTurn(employee.thread_id,started.turn.id));
    const after=(await client.request('thread/read',{threadId:employee.thread_id,includeTurns:true})).thread;
    const afterSummary=summarizeThread(after);
    if(afterSummary.latest_completed_assistant_turn_id!==completion.turn_id)throw new Error('mac_employee_dispatch_thread_readback_mismatch');
    const receiptPath=path.join(workspace,'employee_worker_receipt.json');
    const receipt=await readJson(receiptPath).catch(()=>null);
    if(!receipt||receipt.dispatch_id!==dispatch.dispatch_id||receipt.status!=='test_only_qa_passed_pending_turn_completion')throw new Error('mac_employee_dispatch_output_receipt_missing');
    receipt.status='test_only_qa_passed';
    receipt.completion_event={...completion,source:'matching_app_server_notification_and_thread_readback'};
    receipt.completed_at=new Date().toISOString();
    await writeJson(receiptPath,receipt);
    dispatch.phase='employee_turn_completed';
    dispatch.status='completed_test_only';
    dispatch.lease={...dispatch.lease,status:'completed',completed_at:receipt.completed_at};
    await writeJson(dispatchPath,dispatch);
    const projectionPath=path.join(workspace,'website_projection.json');
    const projection=await readJson(projectionPath);
    projection.status='employee_synthetic_integrated_not_delivered';
    projection.completed_turn_id=completion.turn_id;
    projection.updated_at=new Date().toISOString();
    await writeJson(projectionPath,projection);
    const control={schema_version:'niannian_mac_codex_employee_job_dispatch_receipt_v1',dispatch_id:dispatch.dispatch_id,idempotency_key:dispatch.idempotency_key,project_id:dispatch.project_id,job_id:dispatch.job_id,group_id:dispatch.group_id,employee:{...employee,project_root:PROJECT_ROOT,workspace},lease:dispatch.lease,employee_model_channel:{...modelChannel.contract,requested:true,used:true,media_provider_authority_granted:false},completion_event:receipt.completion_event,thread_readback:{latest_completed_assistant_turn_id:afterSummary.latest_completed_assistant_turn_id,latest_turn_status:afterSummary.latest_turn_status,latest_turn_error:afterSummary.latest_turn_error},employee_worker_receipt_path:receiptPath,test_only:true,real_delivery:false,media_provider_network_requested:false,media_provider_submit_requested:false,media_provider_upload_requested:false,spend_requested:false,deployment_requested:false,created_at:new Date().toISOString()};
    await writeJson(outputPath,control);
    await finalizeMacReturn({workspacePath:workspace});
    return control;
  }finally{
    if(ownsClient)client.close();
    if(phaseLease)await releaseLease({leasePath,phase:dispatch,ownerId:'mac-app-employee-'+employee.employee}).catch(()=>{});
  }
}

function option(args,name){const index=args.indexOf(name);return index>=0?args[index+1]:null;}
if(require.main===module){const args=process.argv.slice(2);const dispatchPath=option(args,'--dispatch');if(!dispatchPath){process.stderr.write('usage: --dispatch <employee_dispatch.json>\n');process.exitCode=1;}else run({dispatchPath}).then(result=>process.stdout.write(JSON.stringify({ok:true,dispatch_id:result.dispatch_id,employee:result.employee.employee,turn_id:result.completion_event.turn_id,status:result.completion_event.status,real_delivery:false,media_provider_submit_requested:false})+'\n')).catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});}
module.exports={dispatchPrompt,run};
