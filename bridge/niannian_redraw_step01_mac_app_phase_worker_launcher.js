'use strict';

// Mac-only launcher. Employee model authentication remains inside the Codex
// native account session. Only Mimo ASR and Paddle OCR analysis credentials
// are injected into this worker child tree. No credential enters argv,
// stdout/stderr, receipts, or files.

const childProcess=require('child_process');
const SECURITY='/usr/bin/security';
const NODE='/Users/lsb/.local/bin/node';
const PROJECT='/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const WORKER=PROJECT+'/bridge/niannian_redraw_step01_mac_app_phase_worker.js';
const FFMPEG_DIR='/Users/lsb/AI-Brain/tools/ffmpeg-runtime';
const SAFE_PATH=[FFMPEG_DIR,'/Users/lsb/.local/bin','/opt/homebrew/bin','/usr/local/bin','/usr/bin','/bin','/usr/sbin','/sbin'].join(':');
const CREDENTIALS=Object.freeze({
  MIMO_API_KEY:{source:'keychain',account:'mimo-asr-api-key',service:'fun.cauai.niannian.step01.mimo-asr'},
  PADDLEOCR_AISTUDIO_TOKEN:{source:'keychain',account:'paddle-ocr-api-token',service:'fun.cauai.niannian.step01.paddle-ocr'}
});

function runSecretCommand(command,args,label,run=childProcess.spawnSync){const safeLabel=String(label||'unknown').replace(/[^a-z0-9_:-]/gi,'_');const result=run(command,args,{encoding:'utf8',stdio:['ignore','pipe','ignore']});if(result.error||result.status!==0)throw new Error('step01_worker_secret_presence_failed:'+safeLabel);const value=String(result.stdout||'').replace(/[\r\n]+$/,'');if(value.length<8||/[\r\n\0]/.test(value))throw new Error('step01_worker_secret_missing_or_invalid:'+safeLabel);return value;}
function secretEnvironment(run=childProcess.spawnSync){const mimo=runSecretCommand(SECURITY,['find-generic-password','-a',CREDENTIALS.MIMO_API_KEY.account,'-s',CREDENTIALS.MIMO_API_KEY.service,'-w'],'mimo_keychain',run);const paddle=runSecretCommand(SECURITY,['find-generic-password','-a',CREDENTIALS.PADDLEOCR_AISTUDIO_TOKEN.account,'-s',CREDENTIALS.PADDLEOCR_AISTUDIO_TOKEN.service,'-w'],'paddle_keychain',run);return {MIMO_API_KEY:mimo,PADDLEOCR_AISTUDIO_TOKEN:paddle,PADDLEOCR_API_TOKEN:paddle};}
function childEnvironment(base,secrets){const source=base||{};const result={HOME:'/Users/lsb',USER:'lsb',LOGNAME:'lsb',PATH:SAFE_PATH};for(const key of ['TMPDIR','LANG','LC_ALL'])if(typeof source[key]==='string'&&source[key]&&!/[\r\n\0]/.test(source[key]))result[key]=source[key];return {...result,...secrets};}
function workerArgs(args){const packageIndex=args.indexOf('--package');const manifestIndex=args.indexOf('--manifest-sha');if(packageIndex<0||manifestIndex<0||!args[packageIndex+1]||!args[manifestIndex+1])throw new Error('step01_worker_launcher_arguments_invalid');if(args.some(value=>/^(?:KRILL_CODEX_API_KEY|OPENAI_API_KEY|MIMO_API_KEY|PADDLEOCR_(?:AISTUDIO_TOKEN|API_TOKEN))=/.test(String(value))||/\b(?:sk|tp)-[A-Za-z0-9_-]{12,}\b/.test(String(value))))throw new Error('step01_worker_secret_in_argv_rejected');return [WORKER,...args];}
async function launch(options={}){const args=workerArgs(options.args||process.argv.slice(2));const secrets=secretEnvironment(options.spawnSync||childProcess.spawnSync);const child=(options.spawn||childProcess.spawn)(NODE,args,{cwd:PROJECT,env:childEnvironment(options.baseEnv||process.env,secrets),stdio:options.stdio||'inherit',detached:options.detached!==false});return await new Promise((resolve,reject)=>{let terminating=false;const terminate=signal=>{if(terminating)return;terminating=true;try{if(child.pid&&process.platform!=='win32')process.kill(-child.pid,signal);}catch{}try{child.kill(signal);}catch{}};const handlers={SIGHUP:()=>terminate('SIGHUP'),SIGINT:()=>terminate('SIGINT'),SIGTERM:()=>terminate('SIGTERM')};for(const [name,handler] of Object.entries(handlers))process.once(name,handler);const cleanup=()=>{for(const [name,handler] of Object.entries(handlers))process.removeListener(name,handler);};child.once('error',error=>{cleanup();reject(error);});child.once('exit',(code,signal)=>{cleanup();code===0?resolve({status:'completed'}):reject(new Error('step01_worker_child_failed:'+(signal||code)));});});}

if(require.main===module){if(process.argv.slice(2).includes('--check-secret-presence')){try{secretEnvironment();process.stdout.write('STEP01_ANALYSIS_KEYS_PRESENT_ONLY\n');}catch(error){process.stderr.write(String(error.message||error)+'\n');process.exitCode=2;}}else launch().catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});}
module.exports={CREDENTIALS,FFMPEG_DIR,NODE,PROJECT,SAFE_PATH,SECURITY,WORKER,childEnvironment,launch,runSecretCommand,secretEnvironment,workerArgs};
