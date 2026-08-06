'use strict';

const {executeImportedPhase} = require('./niannian_redraw_step02_mac_app_phase_worker');
function option(args, name) { const index = args.indexOf(name); return index >= 0 ? args[index+1] : null; }
async function main() {
  const args = process.argv.slice(2), packageRoot = option(args, '--package'), manifestSha = option(args, '--manifest-sha');
  if (!packageRoot || !manifestSha) throw new Error('usage: --package <path> --manifest-sha <sha256>');
  process.stdout.write(JSON.stringify(await executeImportedPhase({packageRoot,expectedManifestSha256:manifestSha})) + '\n');
}
if (require.main === module) main().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });
module.exports = {main,option};
