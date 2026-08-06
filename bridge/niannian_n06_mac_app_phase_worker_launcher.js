'use strict';

// Mac-only launcher for the App employee worker. The approved Krill credential
// remains in launchd and is injected only into this child process tree. It is
// never placed in argv, stdout/stderr, a receipt, or a file.

const childProcess = require('child_process');
const path = require('path');

const KEY_NAME='KRILL_CODEX_API_KEY';
const LAUNCHCTL='/bin/launchctl';
const NODE='/Users/lsb/.local/bin/node';
const PROJECT='/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const WORKER=PROJECT+'/bridge/niannian_n06_mac_app_phase_worker.js';

function keyFromLaunchd(run=childProcess.spawnSync){
  const result=run(LAUNCHCTL,['getenv',KEY_NAME],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(result.error||result.status!==0)throw new Error('mac_phase_worker_launchctl_key_check_failed');
  const value=String(result.stdout||'').replace(/[\r\n]+$/,'');
  if(!value)throw new Error('mac_phase_worker_employee_model_key_missing');
  return value;
}

function workerArgs(args){
  const packageIndex=args.indexOf('--package');
  const manifestIndex=args.indexOf('--manifest-sha');
  if(packageIndex<0||manifestIndex<0||!args[packageIndex+1]||!args[manifestIndex+1])throw new Error('mac_phase_worker_launcher_arguments_invalid');
  if(args.some(value=>String(value).includes(KEY_NAME+'=')))throw new Error('mac_phase_worker_secret_in_argv_rejected');
  return [WORKER,...args];
}

async function launch(options={}){
  const args=workerArgs(options.args||process.argv.slice(2));
  const employeeModelKey=keyFromLaunchd(options.spawnSync||childProcess.spawnSync);
  const spawn=options.spawn||childProcess.spawn;
  const child=spawn(NODE,args,{cwd:PROJECT,env:{...process.env,[KEY_NAME]:employeeModelKey},stdio:options.stdio||'inherit',detached:options.detached!==false});
  employeeModelKey.length; // keep the value scoped to this launcher/child env only.
  return await new Promise((resolve,reject)=>{
    let terminating=false;
    const terminate=signal=>{
      if(terminating)return;
      terminating=true;
      try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,signal);}catch{}
      try{child.kill(signal);}catch{}
    };
    const onSignal=signal=>{terminate(signal);};
    const handlers={SIGHUP:()=>onSignal('SIGHUP'),SIGINT:()=>onSignal('SIGINT'),SIGTERM:()=>onSignal('SIGTERM')};
    for(const [name,handler] of Object.entries(handlers))process.once(name,handler);
    const cleanup=()=>{for(const [name,handler] of Object.entries(handlers))process.removeListener(name,handler);};
    child.once('error',error=>{cleanup();reject(error);});
    child.once('exit',(code,signal)=>{cleanup();if(code===0)return resolve({status:'completed'});reject(new Error('mac_phase_worker_child_failed:'+(signal||code)));});
  });
}

if(require.main===module){
  if(process.argv.slice(2).includes('--check-key-presence')){
    try{keyFromLaunchd();process.stdout.write('KRILL_CODEX_API_KEY_PRESENT_ONLY\n');}
    catch(error){process.stderr.write(String(error.message||error)+'\n');process.exitCode=2;}
  }else launch().catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});
}
module.exports={KEY_NAME,LAUNCHCTL,NODE,PROJECT,WORKER,keyFromLaunchd,launch,workerArgs};
