'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const [stageRoot, originUrl] = process.argv.slice(2)
if (!stageRoot || !originUrl) throw new Error('runtime_arguments_required')

const studioIndex = path.join(stageRoot, 'package', 'studio', 'index.html')
if (!fs.existsSync(studioIndex)) throw new Error('studio_index_missing')

const index = fs.readFileSync(studioIndex, 'utf8')
const studioAssets = path.join(stageRoot, 'package', 'studio', 'assets')
const assetNames = fs.readdirSync(studioAssets)
if (!index.includes('/assets/') || !assetNames.some((name) => /^NomiStudioApp-.*\.js$/.test(name)) || !assetNames.some((name) => /^react-vendor-.*\.js$/.test(name))) {
  throw new Error('studio_bundle_entry_missing')
}

const health = spawnSync('curl', ['--connect-timeout', '3', '--max-time', '5', '-fsS', `${originUrl}/api/health`], {
  stdio: 'ignore',
})
if (health.status !== 0) throw new Error('runtime_health_readback_failed')

process.stdout.write(JSON.stringify({ ok: true, verified: ['studio bundle entry', 'runtime health'] }) + '\n')
