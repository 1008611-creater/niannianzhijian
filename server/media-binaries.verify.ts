import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ffmpegBin, ffprobeBin } from './media-binaries.ts';

assert.ok(ffmpegBin().trim(), 'ffmpeg path always resolves to a command');
assert.ok(ffprobeBin().trim(), 'ffprobe path always resolves to a command');
for (const command of [ffmpegBin(), ffprobeBin()]) {
  assert.ok(!/[\\/]/.test(command) || existsSync(command), `configured binary path must exist: ${command}`);
}
console.log('media-binaries.verify: ok');
