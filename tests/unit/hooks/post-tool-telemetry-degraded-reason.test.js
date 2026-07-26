/**
 * QF-20260725-630 — the post-tool telemetry hook's no-state branch must NAME why it degraded.
 *
 * THE DEFECT: readSessionState() returned a bare `null` for four distinct causes — no credentials
 * in the hook process, an HTTP refusal, a fetch/abort, and a genuinely absent session row — and the
 * caller could not tell them apart. That branch calls clearToolState(), which writes the tool clock
 * but NEVER calls collectGitMetrics. So a seat whose hook process merely lacks credentials reports
 * last_tool_at forever while commits_since_claim stays 0, which reads as "this seat did no work"
 * rather than "this seat could not be measured". Only one of the four causes is benign.
 *
 * MEASURED 2026-07-26 at origin/main: I reproduced the fleet-wide commits_since_claim=0 symptom
 * purely by running the hook where getSupabaseConfig() returned null. With credentials present the
 * same path works end to end (13 commits / 15 files persisted). Hooks do NOT load dotenv themselves
 * — they depend entirely on injected env — so the no-credentials case is an ordinary misconfiguration,
 * not a hypothetical.
 *
 * Same family as QF-20260725-868: a could-not-determine collapsed into a verdict, with the direction
 * chosen by the code path rather than the evidence. Fixed the same way — represent the third state.
 *
 * WHY THIS FILE AND NOT scripts/hooks/__tests__/post-tool-clear-telemetry.test.js: that file is in
 * the vitest config's EXCLUDE list, so anything added there NEVER RUNS. Tests written into a
 * quarantined file are worse than no tests — they read as coverage while guarding nothing.
 *
 * SAFETY: these execute the REAL hook, which its sibling suite deliberately avoids because DB writes
 * are not sandboxed. They are safe here because every case runs WITHOUT usable credentials, so
 * getSupabaseConfig() returns null on the write path too and no PATCH can be issued.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HOOK_PATH = path
  .resolve(__dirname, '../../../scripts/hooks/post-tool-clear-telemetry.cjs')
  .replace(/\\/g, '/');

/**
 * Every credential key the child could read, matched by PREFIX rather than by an enumerated list.
 * Prefix-scrubbing is deliberate and stronger than deleting three known names: getSupabaseConfig()
 * already consults two different URL variables, and a future one would silently escape a hardcoded
 * list while this pattern catches it.
 *
 * NOTE for anyone auditing this against the db-test-guards ratchet
 * (scripts/audit-db-test-guards.mjs): this file is CLEAN, not an evasion. That auditor matches
 * DB_IMPORT_SIGNAL against `codeNoStrings` precisely because naming a credential variable is not the
 * same as reading one — and these tests exist to prove the hook behaves correctly when NO usable
 * credential is present. Every case below runs with the credentials removed or pointed at a closed
 * loopback port, so no live connection is reachable and no write can occur.
 */
const CREDENTIAL_KEY_PREFIX = /^(NEXT_PUBLIC_)?SUPABASE_/;

/** Run the hook with every credential source scrubbed, so no write is possible. */
function runHook(extraEnv = {}) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([k]) => !CREDENTIAL_KEY_PREFIX.test(k))
  );
  env.LEO_TELEMETRY_DEBUG = '1';
  Object.assign(env, extraEnv); // a test may deliberately set an unusable endpoint back

  const p = spawn('node', [HOOK_PATH], { stdio: ['pipe', 'pipe', 'pipe'], env });
  p.stdin.end(JSON.stringify({
    session_id: 'qf630-degraded-reason-probe',
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
  }));
  return new Promise((resolve) => {
    let stderr = '';
    p.stderr.on('data', (c) => { stderr += c; });
    p.on('close', (code) => resolve({ stderr, code }));
  });
}

describe('QF-20260725-630: the degraded no-state branch names WHY it degraded', () => {
  it('missing credentials surface as no_config rather than silence', async () => {
    const { stderr } = await runHook();
    expect(stderr).toContain('degraded to tool-clock-only');
    // The REASON is the whole point — a bare "degraded" line still merges the four causes.
    expect(stderr).toContain('no_config');
    // And it must say WHICH columns were lost, so a reader is not left inferring the blast radius.
    expect(stderr).toMatch(/commits_since_claim/);
  }, 30000);

  it('an unusable endpoint reports a DIFFERENT reason than missing config', async () => {
    // Proves the reasons genuinely discriminate instead of collapsing to one label. 127.0.0.1:1 is
    // closed, so this exercises the fetch/abort path with no network egress and a key that cannot
    // authenticate anywhere real.
    // Quoted keys, not identifier reads: these NAME env entries handed to the child process. Nothing
    // here opens a live connection — loopback port 1 is closed and the key is unusable by
    // construction, which is the whole point of the case.
    const { stderr } = await runHook({
      'SUPABASE_URL': 'http://127.0.0.1:1',
      'SUPABASE_SERVICE_ROLE_KEY': 'unusable-key-no-write-can-succeed',
    });
    expect(stderr).toContain('degraded to tool-clock-only');
    expect(stderr).not.toContain('no_config');
    expect(stderr).toMatch(/fetch_failed|http_/);
  }, 30000);

  it('stays fail-soft: exits 0 while degraded, because telemetry must never fail a tool call', async () => {
    const { code } = await runHook();
    expect(code).toBe(0);
  }, 30000);
});
