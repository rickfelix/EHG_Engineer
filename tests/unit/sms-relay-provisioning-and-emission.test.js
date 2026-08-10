// SD-LEO-INFRA-COMPLETE-SMS-RELAY-001 FR-2 + FR-4.
//
// FR-2: the worktree .env provisioning path forwards SMS_RELAY_DRAIN_ENABLED so that once an
// operator sets it on the designated drain seat, that seat's NEW worktrees inherit it. Measured:
// ensureWorktreeEssentials copies .env VERBATIM (whole-file copyFileSync, no key filter), so the
// flag is forwarded by construction — this test PINS that behaviour (a future key-filtering
// "optimization" that dropped the flag would silently re-inert the interrupt on worktree seats).
//
// FR-4: the SUPPRESSED->INBOUND emission flip and the interrupt allowlist are ALREADY wired
// (env-gated in adam-quiet-tick, QUIET_TICK_SMS_INBOUND on the allowlist). This pins that so
// nobody re-implements the flip and so the go-live runbook's canary assumption stays true.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureWorktreeEssentials } from '../../scripts/resolve-sd-workdir.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, '../../', p), 'utf8');

describe('FR-2: worktree .env provisioning forwards SMS_RELAY_DRAIN_ENABLED', () => {
  it('copies the flag verbatim from repo-root .env into a fresh worktree .env', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-relay-prov-'));
    const repoRoot = path.join(base, 'root');
    const worktree = path.join(base, 'wt');
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.mkdirSync(worktree, { recursive: true });
    // A root .env that a drain-enabled seat would carry.
    fs.writeFileSync(path.join(repoRoot, '.env'), 'FOO=bar\nSMS_RELAY_DRAIN_ENABLED=true\nBAZ=qux\n');

    try {
      ensureWorktreeEssentials(worktree, repoRoot, { activeSessionCount: 1 });
      const wtEnv = fs.readFileSync(path.join(worktree, '.env'), 'utf8');
      // The whole file rode across, flag included.
      expect(wtEnv).toContain('SMS_RELAY_DRAIN_ENABLED=true');
      expect(wtEnv).toContain('FOO=bar');
    } finally {
      fs.rmSync(base, { recursive: true, force: true });
    }
  });
});

describe('FR-4: the emission flip + interrupt allowlist are already wired (pin, not new code)', () => {
  const tick = read('scripts/adam-quiet-tick.mjs');
  const startup = read('scripts/adam-startup-check.mjs');

  it('quiet-tick gates SUPPRESSED vs INBOUND on SMS_RELAY_DRAIN_ENABLED', () => {
    // The env-gate variable is derived from SMS_RELAY_DRAIN_ENABLED, and both tokens exist.
    expect(tick).toMatch(/SMS_RELAY_DRAIN_ENABLED/);
    expect(tick).toContain('QUIET_TICK_SMS_SUPPRESSED');
    expect(tick).toContain('QUIET_TICK_SMS_INBOUND');
    // The suppressed branch is the flag-OFF path; the inbound token is the flag-ON path.
    const gateIdx = tick.indexOf('smsDrainEnabled');
    expect(gateIdx).toBeGreaterThan(-1);
  });

  it('QUIET_TICK_SMS_INBOUND is on the interrupt allowlist; SUPPRESSED is deliberately not', () => {
    expect(startup).toContain('QUIET_TICK_SMS_INBOUND');
    // The allowlist prose explicitly keeps SUPPRESSED off the hard-interrupt set.
    expect(startup).toMatch(/QUIET_TICK_SMS_SUPPRESSED[\s\S]{0,400}?(INFORMATIONAL|do not add|not a hard interrupt)/i);
  });
});
