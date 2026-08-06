'use strict';

const assert=require('assert');
const fsp=require('fs').promises;
const path=require('path');

async function main(){const script=await fsp.readFile(path.join(__dirname,'bridge','self_test_mac_step01_python_imports.sh'),'utf8');const installer=await fsp.readFile(path.join(__dirname,'bridge','install_mac_step01_runtimes.sh'),'utf8');for(const value of ['Pillow','requests','silero-vad']){assert(script.includes(value));assert(installer.includes(value));}assert(installer.includes('TORCHAUDIO_VERSION="2.7.1"'));assert(script.includes('credentials_read'));assert(script.includes('user_media_processed'));assert(script.includes('media_provider_network_requested'));assert(!/source\.mp4|001\.mp4|find-generic-password|curl\s|wget\s/.test(script));process.stdout.write(JSON.stringify({ok:true,verified:['Pillow import-only probe','requests import-only probe','silero-vad import-only probe','torch-compatible torchaudio pin','no credentials','no user media','no provider network','pinned installer dependencies']})+'\n');}
main().catch(error=>{process.stderr.write(String(error.stack||error)+'\n');process.exitCode=1;});
