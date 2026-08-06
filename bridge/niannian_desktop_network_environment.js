'use strict';

const childProcess=require('child_process');
const NETWORK_NAMES=Object.freeze(['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','SSL_CERT_FILE']);
const PGREP='/usr/bin/pgrep';
const PS='/bin/ps';
const APP_PREFIX='/Applications/ChatGPT.app/Contents/Resources/codex ';

function validValue(name,value){
  const text=String(value||'');
  if(!text||/[\r\n\0]/.test(text))return false;
  if(name==='NO_PROXY')return /^[A-Za-z0-9._,*:-]{1,2048}$/.test(text);
  if(name==='SSL_CERT_FILE')return /^\/[A-Za-z0-9._/-]{1,2048}$/.test(text)&&!text.includes('/../');
  try{const url=new URL(text);return ['http:','https:','socks5:','socks5h:'].includes(url.protocol)&&!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/'&&url.hostname.length>0;}catch{return false;}
}
function readDesktopNetworkEnvironment(run=childProcess.spawnSync){
  const found=run(PGREP,['-f','^/Applications/ChatGPT\\.app/Contents/Resources/codex .*app-server'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
  if(found.error||found.status!==0)return {};
  const pids=String(found.stdout||'').trim().split(/\s+/).filter(value=>/^\d+$/.test(value));
  if(!pids.length||pids.length>8)return {};
  const values={};
  for(const pid of pids){
    const row=run(PS,['eww','-p',pid,'-o','command='],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    if(row.error||row.status!==0)continue;
    const output=String(row.stdout||'');if(!output.startsWith(APP_PREFIX))continue;
    for(const name of NETWORK_NAMES){
      const match=output.match(new RegExp('(?:^|\\s)'+name+'=([^\\s]+)'));
      if(!match)continue;
      if(!validValue(name,match[1]))throw new Error('desktop_network_environment_value_rejected:'+name);
      if(values[name]&&values[name]!==match[1])throw new Error('desktop_network_environment_not_unique:'+name);
      values[name]=match[1];
    }
  }
  return values;
}
function applyDesktopNetworkEnvironment(target,run){const values=readDesktopNetworkEnvironment(run);Object.assign(target,values);return Object.keys(values).sort();}
module.exports={APP_PREFIX,NETWORK_NAMES,applyDesktopNetworkEnvironment,readDesktopNetworkEnvironment,validValue};
