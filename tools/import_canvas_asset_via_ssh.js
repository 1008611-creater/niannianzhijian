#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const path = require('path');
const {spawn} = require('child_process');

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node tools/import_canvas_asset_via_ssh.js --file <asset> --project-id <id> --project-kind <redraw|script> --kind <reference_image|reference_video|reference_audio> --role <character|scene|prop|audio|shot> [--ssh-host haika-niannian] [--remote-port 18083]');
  process.exitCode = 2;
}

function readArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) usage(`Unknown argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) usage(`Missing value for ${key}`);
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function checked(value, expression, name) {
  if (!expression.test(value || '')) throw new Error(`${name} is invalid`);
  return value;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {stdio:['ignore','pipe','pipe'],windowsHide:true,...options});
    const chunks = [];
    const errors = [];
    child.stdout.on('data', chunk => chunks.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => errors.push(Buffer.from(chunk)));
    child.on('error', reject);
    child.on('close', code => {
      const stdout = Buffer.concat(chunks).toString('utf8').trim();
      const stderr = Buffer.concat(errors).toString('utf8').trim();
      if (code === 0) return resolve(stdout);
      reject(new Error(`${command} failed (${code}): ${(stderr || stdout || 'no diagnostic').slice(0, 800)}`));
    });
  });
}

async function main() {
  const options = readArguments(process.argv.slice(2));
  const file = path.resolve(options.file || '');
  const projectId = checked(options['project-id'], /^[A-Za-z0-9_-]{1,160}$/, 'project id');
  const projectKind = checked(options['project-kind'], /^(redraw|script)$/, 'project kind');
  const kind = checked(options.kind, /^(reference_image|reference_video|reference_audio)$/, 'asset kind');
  const role = checked(options.role, /^(character|scene|prop|audio|shot)$/, 'asset role');
  const host = checked(options['ssh-host'] || 'haika-niannian', /^[A-Za-z0-9_.-]{1,200}$/, 'SSH host');
  const remotePort = Number(options['remote-port'] || '18083');
  if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error('remote port is invalid');
  const info = await fsp.stat(file);
  if (!info.isFile() || info.size < 1 || info.size > 20 * 1024 * 1024) throw new Error('asset must be a readable file no larger than 20 MiB');

  const token = crypto.randomBytes(12).toString('hex');
  const remoteDir = `/tmp/niannian-canvas-import-${token}`;
  const remoteFile = `${remoteDir}/asset`;
  let copied = false;
  try {
    await run('ssh', [host, `mkdir -p ${remoteDir} && chmod 700 ${remoteDir}`]);
    await run('scp', [file, `${host}:${remoteFile}`]);
    copied = true;
    const form = [
      `--form-string projectId=${projectId}`,
      `--form-string projectKind=${projectKind}`,
      `--form-string kind=${kind}`,
      `--form-string role=${role}`,
      `--form asset=@${remoteFile}`
    ].join(' ');
    const response = await run('ssh', [host, `curl --silent --show-error --fail-with-body --max-time 180 ${form} http://127.0.0.1:${remotePort}/api/internal/canvas-assets/import`]);
    const result = JSON.parse(response);
    if (!/^CAS-[a-f0-9]{24}$/.test(String(result?.asset?.id || '')) || result?.asset?.projectId !== projectId || result?.node?.result?.assetId !== result.asset.id) {
      throw new Error('production importer returned an incomplete asset or canvas node receipt');
    }
    process.stdout.write(JSON.stringify({projectId,projectKind,asset:result.asset,node:result.node,revision:result.revision,idempotent:result.idempotent === true}) + '\n');
  } finally {
    if (copied) await run('ssh', [host, `rm -rf ${remoteDir}`]).catch(() => {});
  }
}

main().catch(error => { console.error(error.message || String(error)); process.exitCode = 1; });
