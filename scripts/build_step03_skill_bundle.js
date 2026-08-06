const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname,'..');
const bundleRoot = path.join(root,'runtime','skill-bundles','shortdrama-visual-assets-runtime-1');
const sourceRoot = path.resolve(process.env.CODEX_SKILLS_ROOT || path.join(process.env.USERPROFILE || '', '.codex', 'skills'));
const sourceSkills = ['mx-shortdrama-04-asset-prompts','mx-shortdrama-05-asset-images','runninghub-image2-text','runninghub-image2-image'];
const runtimeFiles = ['instructions.md','runtime-policy.json'];
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function fileRecord(filePath,relativePath){const bytes=fs.readFileSync(filePath);return{path:relativePath.replace(/\\/g,'/'),sha256:sha256(bytes),bytes:bytes.length};}
function build(){const files=runtimeFiles.map(name=>fileRecord(path.join(bundleRoot,name),name)),sources=sourceSkills.map(skill=>{const relative=path.join(skill,'SKILL.md');return{skill_id:skill,...fileRecord(path.join(sourceRoot,relative),relative)};});const manifest={schema_version:'niannian.server_skill_bundle.v1',bundle_version:'shortdrama-visual-assets-runtime-1',runtime_kind:'shortdrama_visual_assets',source_of_truth:'C:/Users/lsb/.codex/skills',source_skills:sources,locales:['es-MX','pt-BR','en-US'],grouping_policy_version:'source-shots-8-15-v1',allowed_tools:['step01_snapshot_read','step02_confirmed_variant_read','krill_gpt56_json','krill_gpt56_vision_qa','runninghub_text_to_image','runninghub_image_to_image','protected_artifact_write'],prohibited_tools:['local_pixel_edit','arbitrary_shell','desktop_gui','codex_thread','video_provider'],files};const target=path.join(bundleRoot,'manifest.json');fs.writeFileSync(target,JSON.stringify(manifest,null,2)+'\n');process.stdout.write(JSON.stringify({bundle_version:manifest.bundle_version,manifest_sha256:sha256(fs.readFileSync(target)),files:files.length,sources:sources.length})+'\n');}
if(require.main===module)build();module.exports={build};
