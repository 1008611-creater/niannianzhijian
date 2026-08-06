const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bundleRoot = path.join(root, 'runtime', 'skill-bundles', 'shortdrama-localization-runtime-1');
const sourceRoot = path.resolve(process.env.CODEX_SKILLS_ROOT || path.join(process.env.USERPROFILE || '', '.codex', 'skills'));
const sourceSkills = ['mx-shortdrama-02-source-timeline', 'mx-shortdrama-03-mexico-localize'];
const runtimeFiles = ['instructions.md', 'locale-rules.json'];

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function fileRecord(filePath, relativePath) {
  const bytes = fs.readFileSync(filePath);
  return {path:relativePath.replace(/\\/g, '/'),sha256:sha256(bytes),bytes:bytes.length};
}

function build() {
  const files = runtimeFiles.map(name => fileRecord(path.join(bundleRoot, name), name));
  const sources = sourceSkills.map(skill => {
    const relative = path.join(skill, 'SKILL.md');
    return {skill_id:skill,...fileRecord(path.join(sourceRoot, relative), relative)};
  });
  const manifest = {
    schema_version:'niannian.server_skill_bundle.v1',
    bundle_version:'shortdrama-localization-runtime-1',
    runtime_kind:'shortdrama_localization',
    source_of_truth:'C:/Users/lsb/.codex/skills',
    source_skills:sources,
    locales:['es-MX','pt-BR','en-US'],
    allowed_tools:['gpt_plan','gpt_vision_context','gpt_qa','snapshot_read','variant_write'],
    prohibited_tools:['local_pixel_edit','image_provider','video_provider','desktop_gui','codex_thread','arbitrary_shell'],
    plan_schema:'niannian.step02_variant.v1',
    qa_schema:'niannian.step02_qa.v1',
    files
  };
  const target = path.join(bundleRoot, 'manifest.json');
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  process.stdout.write(JSON.stringify({bundle_version:manifest.bundle_version,manifest_sha256:sha256(fs.readFileSync(target)),files:files.length,sources:sources.length}) + '\n');
}

if (require.main === module) build();
module.exports = {build};
