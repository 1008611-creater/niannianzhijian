'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const requiredStaticFiles = [
  'product-system.css',
  'hero-oil-paint.css',
  'sw.js',
  'manifest.webmanifest',
  'vendor/gsap-3.13.0.min.js',
  'vendor/gsap-flip-3.13.0.min.js',
  'assets/home/niannian-hero-oil-paint-quiet-v1.png',
  'assets/showcase/short-drama-keyart-v1.png',
  'assets/showcase/animation-drama-keyart-v1.png',
  'assets/showcase/redraw-keyart-partial-xuedi-v1.png'
];

function fail(message) {
  throw new Error(message);
}

function walkFiles(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes:true }).flatMap(entry => {
    const relativePath = prefix ? prefix + '/' + entry.name : entry.name;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkFiles(absolutePath, relativePath);
    if (entry.isFile()) return [relativePath];
    fail('remote_release_entry_invalid:' + relativePath);
  });
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function activeBrandAssetFromPackage(packageRoot) {
  const indexHtml = fs.readFileSync(path.join(packageRoot, 'index.html'), 'utf8');
  const imageTag = [...indexHtml.matchAll(/<img\b[^>]*>/gi)]
    .map(match => match[0])
    .find(tag => /\bclass=(['"])[^'"]*\bbrand-monogram\b[^'"]*\1/i.test(tag));
  const src = imageTag?.match(/\bsrc=(['"])([^'"]+)\1/i)?.[2] || '';
  const normalized = src.replace(/^\.?(?:\/|\\)/, '').replace(/\\/g, '/');
  if (!normalized.startsWith('assets/brand/') || normalized.includes('..')) fail('remote_release_active_brand_asset_invalid');
  return normalized;
}

function verifyStage(stageRoot) {
  const resolvedStage = path.resolve(stageRoot);
  const packageRoot = path.join(resolvedStage, 'package');
  const manifestPath = path.join(resolvedStage, 'release-package-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = walkFiles(packageRoot).sort();
  if (!Array.isArray(manifest.files) || files.length !== manifest.files.length || files.some((file, index) => file !== manifest.files[index])) {
    fail('remote_release_manifest_file_inventory_mismatch');
  }
  let totalBytes = 0;
  for (const relativePath of files) {
    const expectedHash = manifest.file_sha256?.[relativePath];
    if (!/^[a-f0-9]{64}$/.test(String(expectedHash || '')) || sha256(path.join(packageRoot, relativePath)) !== expectedHash) {
      fail('remote_release_manifest_hash_mismatch:' + relativePath);
    }
    totalBytes += fs.statSync(path.join(packageRoot, relativePath)).size;
  }
  if (totalBytes !== manifest.total_bytes) fail('remote_release_manifest_total_bytes_mismatch');
  for (const file of [...requiredStaticFiles, activeBrandAssetFromPackage(packageRoot)]) {
    if (!files.includes(file)) fail('remote_release_required_static_missing:' + file);
  }
  return { ok:true, file_count:files.length, total_bytes:totalBytes, required_static:'verified' };
}

if (require.main === module) {
  try {
    const stageRoot = process.argv[2];
    if (!stageRoot) fail('remote_release_stage_required');
    process.stdout.write(JSON.stringify(verifyStage(stageRoot)) + '\n');
  } catch (error) {
    process.stderr.write(String(error.message || error) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { verifyStage, requiredStaticFiles };
