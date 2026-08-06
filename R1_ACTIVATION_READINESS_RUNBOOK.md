# r1 Activation Runbook With Bounded Readiness

This runbook is a future, separately authorized production procedure. It does not authorize a deployment by itself.

## Preconditions

1. Confirm the exact r1 package manifest still passes `verify:release-package` locally and the remote r1 release hashes match it.
2. Confirm the active app/static symlinks point to the old release, service is active, origin health is good, and a known rollback is readable.
3. Create a new rollback directory that copies the old app root, old static root, and unchanged service unit before changing either symlink.
4. Use only the existing service unit and production data root. Do not migrate, clear, replace, or change permissions on production data.

## Activation Contract

1. Atomically switch only `/opt/niannian-ai` and `/var/www/niannian-ai` to the fixed r1 directory.
2. Restart the unchanged `niannian-ai.service`.
3. Run `waitForOriginReadiness` from `release_readiness_gate.js` against `http://127.0.0.1:18082/api/health` using the manifest contract: 45 seconds total, 1 second interval, 3 second connect timeout, 5 second request timeout.
4. Only after it returns HTTP 200 with `{ "ok": true }`, verify origin static SHA values with bounded requests. Preserve raw response bytes: run the bounded `curl` directly into `sha256sum` under `set -o pipefail`; never store the static body in shell command substitution before hashing because trailing newlines are significant bytes.
5. From Windows, verify `http://127.0.0.1:28083/api/health`, then `https://ai.cauai.fun/api/health` and cache-busted public static SHA values. Each request must have explicit connect and total timeouts. JavaScript and CSS retain exact raw-byte SHA checks. `index.html` retains exact raw-byte verification unless `verifyPublicHtmlSha256` proves the sole difference is one standard Cloudflare telemetry beacon immediately before `</body>`; any other HTML mutation remains a rollback condition.
6. The remote Linux server's self-call to `ai.cauai.fun` is diagnostic only and cannot block a successful activation.

## Rollback Contract

Immediately restore the old app/static symlinks, restart the unchanged service, then run bounded origin, Windows-forward, and Windows-public recovery checks if any of these occur:

- readiness window expires;
- service is inactive;
- health is non-ready after the readiness window;
- origin static hash differs;
- Windows forward check fails;
- Windows public API or static readback fails.

Do not retry a failed activation without a new explicit authorization.

## Raw-Byte Static SHA Contract

For an expected SHA in `$expected_index_sha`, the activation shell must use this shape after readiness:

```bash
set -o pipefail
origin_index_sha="$(curl --connect-timeout 3 --max-time 5 -fsS http://127.0.0.1:18082/ | sha256sum | awk '{print $1}')"
test "$origin_index_sha" = "$expected_index_sha"
```

The command substitution contains only the textual SHA output, not the HTTP body. This preserves every byte in origin `index.html`, including a final newline. The governed regression is `npm run test:release-static-sha`. The public CDN exception is intentionally narrower: it records the raw SHA, normalized SHA, and `cloudflare_standard_beacon_before_body` reason; it does not accept arbitrary injected HTML.
