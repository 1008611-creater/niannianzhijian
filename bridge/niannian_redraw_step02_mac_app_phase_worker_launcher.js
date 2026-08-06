'use strict';

// Step02 needs only the fixed employee model channel. No analysis/media
// provider credential is read or forwarded by this launcher.
const childProcess = require('child_process');
const {PROJECT_ROOT} = require('./mac_codex_app_employee_bootstrap');

const LAUNCHCTL = '/bin/launchctl';
const NODE = '/Users/lsb/.local/bin/node';
const PROJECT = '/Users/lsb/AI-Brain/niannian-ai-canonical-local';
const WORKER = PROJECT + '/bridge/niannian_redraw_step02_mac_app_phase_worker_cli.js';

function readKrill(run = childProcess.spawnSync) {
  const result = run(LAUNCHCTL, ['getenv','KRILL_CODEX_API_KEY'], {encoding:'utf8',stdio:['ignore','pipe','ignore']});
  const value = String(result.stdout || '').replace(/[\r\n]+$/,'');
  if (result.error || result.status !== 0 || value.length < 8 || /[\r\n\0]/.test(value)) throw new Error('step02_worker_employee_model_key_missing');
  return value;
}
function workerArgs(args) {
  const packageIndex = args.indexOf('--package'), manifestIndex = args.indexOf('--manifest-sha');
  if (packageIndex < 0 || manifestIndex < 0 || !args[packageIndex+1] || !args[manifestIndex+1]) throw new Error('step02_worker_launcher_arguments_invalid');
  if (args.some(value => /(?:KEY|TOKEN|AUTHORIZATION)=/i.test(String(value)) || /\b(?:sk|tp)-[A-Za-z0-9_-]{12,}\b/.test(String(value)))) throw new Error('step02_worker_secret_in_argv_rejected');
  return [WORKER,...args];
}
async function launch(options = {}) {
  const args = workerArgs(options.args || process.argv.slice(2));
  const key = readKrill(options.spawnSync || childProcess.spawnSync);
  const inherited={};for(const name of ['HOME','PATH','SHELL','TMPDIR','LANG','LC_ALL','USER'])if(process.env[name]!==undefined)inherited[name]=process.env[name];
  const child = (options.spawn || childProcess.spawn)(NODE,args,{cwd:PROJECT,env:{...inherited,KRILL_CODEX_API_KEY:key},stdio:options.stdio || 'inherit',detached:options.detached !== false});
  return new Promise((resolve,reject) => {
    let stopping = false;
    const stop = signal => { if (stopping) return; stopping = true; try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal); } catch {} try { child.kill(signal); } catch {} };
    const handlers = {SIGHUP:()=>stop('SIGHUP'),SIGINT:()=>stop('SIGINT'),SIGTERM:()=>stop('SIGTERM')};
    for (const [name,handler] of Object.entries(handlers)) process.once(name,handler);
    const cleanup = () => { for (const [name,handler] of Object.entries(handlers)) process.removeListener(name,handler); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('exit', (code,signal) => { cleanup(); code === 0 ? resolve({status:'completed'}) : reject(new Error('step02_worker_child_failed:' + (signal || code))); });
  });
}

if (require.main === module) launch().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });
module.exports = {LAUNCHCTL,NODE,PROJECT,PROJECT_ROOT,WORKER,launch,readKrill,workerArgs};
