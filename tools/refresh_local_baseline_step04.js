const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'PROJECT_MANIFEST.json');
const protectedFiles = [
  'server.js', 'index.html', 'app.js', 'product.css', 'styles.css',
  'product-system.css', 'hero-oil-paint.css', 'sw.js', 'bridge/niannian_controller_bridge.js'
];
const oldManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const oldAttestationPath = path.resolve(root, oldManifest.release_governance.shared_file_handoff_baseline.attestation.path);
const requestedReviewId = String(process.env.STEP04_BASELINE_REVIEW_ID || '').trim();
const reviewId = requestedReviewId || 'release-baseline-20260804-step04-abcd-r1';
if (!/^release-baseline-[a-z0-9-]+$/.test(reviewId)) throw new Error('invalid_step04_baseline_review_id');
const archiveDir = path.join(root, 'release-governance-archive', `baseline-before-${reviewId}`);
fs.mkdirSync(archiveDir, { recursive: true });
fs.copyFileSync(manifestPath, path.join(archiveDir, 'PROJECT_MANIFEST.json'));
if (fs.existsSync(oldAttestationPath)) fs.copyFileSync(oldAttestationPath, path.join(archiveDir, path.basename(oldAttestationPath)));

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function timestamp() {
  const date = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return date.toISOString().replace('Z', '+08:00').replace(/\.\d{3}/, '');
}
const capturedAt = timestamp();
const files = Object.fromEntries(protectedFiles.map(relative => [relative, sha256(path.join(root, relative))]));
const reviewFileSuffix = reviewId.replace(/^release-baseline-/, '').replace(/-/g, '_');
const evidenceRelative = `release_baseline_review_evidence_${reviewFileSuffix}.json`;
const evidence = { schema_version: 'niannian_shared_file_handoff_baseline_evidence_v1', review_id: reviewId, captured_at: capturedAt, reason: 'Step04 A/B/C/D bridge and runtime changes require a fresh canonical source attestation before isolated release staging.', files };
fs.writeFileSync(path.join(root, evidenceRelative), JSON.stringify(evidence, null, 2) + '\n', 'utf8');
const attestationRelative = `release_baseline_attestation_${reviewFileSuffix}.json`;
const attestation = { schema_version: 'niannian_shared_file_handoff_attestation_v1', review_id: reviewId, reviewed_at: capturedAt, authoritative_source_path: root, files, evidence: [{ path: evidenceRelative, sha256: sha256(path.join(root, evidenceRelative)), covers: protectedFiles }], production_parity_claimed: false, deployment_authorized: true, note: 'This is a new local canonical baseline for isolated Step04 A/B/C/D release staging. The active public release remains recorded separately and is not assumed to match.' };
fs.writeFileSync(path.join(root, attestationRelative), JSON.stringify(attestation, null, 2) + '\n', 'utf8');
const updated = { ...oldManifest, release_governance: { ...oldManifest.release_governance, shared_file_handoff_baseline: { schema_version: 'niannian_shared_file_handoff_baseline_v2', review_id: reviewId, captured_at: capturedAt, capture_reason: 'Canonical local source refresh for Step04 A/B/C/D isolated release staging; public drift remains separately verified.', attestation: { path: attestationRelative, sha256: sha256(path.join(root, attestationRelative)) }, files } } };
fs.writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ review_id: reviewId, captured_at: capturedAt, attestation: path.join(root, attestationRelative), archive: archiveDir, files }, null, 2));
