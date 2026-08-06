'use strict';

const crypto=require('crypto');
const fs=require('fs');
const JSZip=require('jszip');
const path=require('path');

(async()=>{
  const [archivePath,receiptPath,outputRoot]=process.argv.slice(2);
  if(!archivePath||!receiptPath||!outputRoot)throw new Error('pull_verify_args');
  const expected={release_version:process.env.NIANNIAN_EXPECTED_RELEASE_VERSION,manifest_sha256:process.env.NIANNIAN_EXPECTED_MANIFEST_SHA256,archive_sha256:process.env.NIANNIAN_EXPECTED_ARCHIVE_SHA256};
  if(!/^20\d{2}\.\d{2}\.\d{2}\.\d+$/.test(String(expected.release_version||''))||!['manifest_sha256','archive_sha256'].every(key=>/^[a-f0-9]{64}$/.test(String(expected[key]||''))))throw new Error('pull_expected_identity_invalid');
  const receipt=JSON.parse(fs.readFileSync(receiptPath,'utf8'));
  if(receipt.release_version!==expected.release_version||receipt.manifest_sha256!==expected.manifest_sha256||receipt.archive_sha256!==expected.archive_sha256)throw new Error('pull_release_identity_mismatch');
  const archive=fs.readFileSync(archivePath);
  if(crypto.createHash('sha256').update(archive).digest('hex')!==expected.archive_sha256)throw new Error('pull_archive_sha_mismatch');
  const zip=await JSZip.loadAsync(archive);
  for(const name of Object.keys(zip.files))if(name.includes('..')||name.startsWith('/'))throw new Error('pull_path');
  for(const name of Object.keys(zip.files)){
    if(zip.files[name].dir)continue;
    const target=path.join(outputRoot,'release',name);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,await zip.files[name].async('nodebuffer'));
  }
  const manifestPath=path.join(outputRoot,'release','manifest.json');
  const manifestBytes=fs.readFileSync(manifestPath);
  if(crypto.createHash('sha256').update(manifestBytes).digest('hex')!==expected.manifest_sha256)throw new Error('pull_manifest_sha_mismatch');
  const manifest=JSON.parse(manifestBytes);
  if(manifest.release_version!==expected.release_version)throw new Error('pull_manifest_version_mismatch');
})().catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;});
