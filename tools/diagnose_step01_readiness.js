'use strict';

// Read-only Step01 diagnosis. It reports the earliest real blocker without
// reading credentials, media bytes, provider responses, or signed URLs.
const fs = require('fs');
const path = require('path');
const authority = require('../bridge/niannian_full_source_step01_authority');
const broker = require('../bridge/niannian_step01_artifact_broker');

function readProject(projectPath) {
  if (!projectPath) return null;
  const resolved = path.resolve(projectPath);
  const value = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('project_json_must_be_an_object');
  }
  return value;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--project') args.project = argv[++index];
    else if (value === '--json') args.json = true;
    else throw new Error('unknown_argument:' + value);
  }
  return args;
}

function projectDiagnosis(project) {
  if (!project) {
    return {
      status: 'blocked',
      earliest_blocker: 'PROJECT_JSON_REQUIRED',
      message: '提供项目 JSON 后才能判断源片绑定和 Step01 权威门。',
      authority: null
    };
  }
  const projection = authority.publicProjection(project);
  if (!projection) {
    return {
      status: 'blocked',
      earliest_blocker: 'SOURCE_NOT_BOUND_TO_FULL_AUTHORITY',
      message: '项目源片 SHA 不匹配当前完整源片权威链，不能读取旧证据。',
      authority: null
    };
  }
  const blockers = Object.entries(projection.gate_details)
    .filter(([, gate]) => gate.status !== 'PASS')
    .map(([key, gate]) => ({ gate: key, status: gate.status, blocker: gate.blocker }));
  return {
    status: projection.status,
    earliest_blocker: projection.blocker?.resume_after || null,
    message: projection.blocker?.message || 'Step01 完整源片权威链已接受。',
    authority: {
      status: projection.status,
      downstream_consumable: projection.downstream_consumable,
      gates: projection.gates,
      blockers
    }
  };
}

function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const project = readProject(args.project);
  const result = {
    schema_version: 'niannian_step01_readiness_diagnostic_v1',
    read_only: true,
    provider_requested: false,
    spend_requested: false,
    credentials_exposed: false,
    project: projectDiagnosis(project),
    artifact_broker: (() => {
      const readiness = broker.brokerReadiness(env);
      return {
        ready: readiness.ready,
        transport: readiness.transport,
        code: readiness.code,
        reason: readiness.reason,
        provider: readiness.provider,
        mac_grant_protocol_ready: readiness.mac_grant_protocol_ready
      };
    })()
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  return result;
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    process.stderr.write(String(error.message || error) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { main, parseArgs, projectDiagnosis };
