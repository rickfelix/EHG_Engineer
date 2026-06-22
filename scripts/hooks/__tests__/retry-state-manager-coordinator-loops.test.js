// QF-20260610-626 — exempt the remaining canonical coordinator cron loops from the
// RCA tiered-enforcement counter. The loops exit 0 by design on fixed intervals; the
// consecutive-attempt counter misread the cron cadence as a stuck retry loop because
// the exit-0 exemption's single per-session lastOutcome file is clobbered under
// interleaved loops (residual after SD-FDBK-FIX-RCA-TIERED-ENFORCEMENT-001).
// Closes feedback ids d89abebc + c86d5027.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const MODULE_PATH = path.resolve(__dirname, '../retry-state-manager.cjs');

function loadFresh() {
  delete require.cache[require.resolve(MODULE_PATH)];
  return require(MODULE_PATH);
}

// FR-1/2/3 — the full canonical coordinator-loop command set.
const LOOP_COMMANDS = [
  'node scripts/coordinator-self-review.mjs',                                  // loop 8, */5
  'node scripts/coordinator-audit.mjs',                                        // loop 5, */15
  'node scripts/coordinator-email-summary.mjs',                                // loop 6, */30
  'node scripts/coordinator-startup-check.mjs',                                // startup probe
  // Step-0 keepalive: node -e inline (no script path) — matched on stable tokens.
  'node -e "const { setActiveCoordinator } = require(\'./lib/coordinator/resolve.cjs\'); setActiveCoordinator(process.env.CLAUDE_SESSION_ID).then(...)"',
  'node -e "require(\'./lib/coordinator/resolve.cjs\').setActiveCoordinator(id)"',
  // SD-REFILL-00D2CC0B — two more recurring coordinator crons (false-blocked during fleet
  // re-engagement churn; coordinator Kamo 2026-06-15).
  'node scripts/coordinator-backlog-rank.mjs',                                  // per-sourced-SD + interval
  'node scripts/coordinator-capacity-forecast.mjs',                            // periodic capacity probe
];

describe('QF-626 isExempt: canonical coordinator cron loops', () => {
  const { isExempt } = loadFresh();

  for (const cmd of LOOP_COMMANDS) {
    it(`exempts: ${cmd.slice(0, 60)}`, () => {
      expect(isExempt(cmd)).toBe(true);
    });
  }

  it('still exempts with ./ prefix and windows separators', () => {
    expect(isExempt('node ./scripts/coordinator-self-review.mjs')).toBe(true);
    expect(isExempt('node scripts\\coordinator-audit.mjs')).toBe(true);
  });

  // SD-REFILL-00D2CC0B — the two newly-whitelisted recurring crons, both separators.
  it('exempts coordinator-backlog-rank.mjs and coordinator-capacity-forecast.mjs', () => {
    expect(isExempt('node scripts/coordinator-backlog-rank.mjs')).toBe(true);
    expect(isExempt('node ./scripts/coordinator-backlog-rank.mjs --apply')).toBe(true);
    expect(isExempt('node scripts\\coordinator-capacity-forecast.mjs')).toBe(true);
  });

  // FR-5 — anchoring: unrelated coordinator-* scripts stay RCA-gated.
  it('does NOT exempt arbitrary or unrelated coordinator-* commands', () => {
    expect(isExempt('node scripts/leo-create-sd.js')).toBe(false);
    expect(isExempt('node scripts/coordinator-revive.cjs')).toBe(false);
    expect(isExempt('node scripts/coordinator-self-review-helper.mjs')).toBe(false);
  });

  // FR-5 — fail-open input handling preserved.
  it('returns false for non-string/empty input', () => {
    expect(isExempt(null)).toBe(false);
    expect(isExempt(undefined)).toBe(false);
    expect(isExempt('')).toBe(false);
  });
});

describe('QF-626 recordAndCount: loop commands never accumulate attempts', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qf626-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.LEO_RETRY_STATE_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const cmd of LOOP_COMMANDS.slice(0, 4)) {
    it(`attempts stays 0 across 4 consecutive runs: ${cmd.slice(5, 50)}`, async () => {
      const { recordAndCount } = loadFresh();
      const opts = { rcaCheck: async () => null };
      for (let i = 0; i < 4; i++) {
        const r = await recordAndCount('qf626-sess', null, 'Bash', { command: cmd }, opts);
        expect(r.attempts).toBe(0);
      }
    });
  }

  it('the Step-0 keepalive inline command also stays at 0', async () => {
    const { recordAndCount } = loadFresh();
    const opts = { rcaCheck: async () => null };
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount('qf626-sess', null, 'Bash', { command: LOOP_COMMANDS[4] }, opts);
      expect(r.attempts).toBe(0);
    }
  });

  it('non-loop command still accumulates 1..4 (3-strikes machinery untouched)', async () => {
    const { recordAndCount } = loadFresh();
    const opts = { rcaCheck: async () => null };
    const counts = [];
    for (let i = 0; i < 4; i++) {
      const r = await recordAndCount('qf626-throttle', null, 'Bash', { command: 'node scripts/some-retry-loop.js' }, opts);
      counts.push(r.attempts);
    }
    expect(counts).toEqual([1, 2, 3, 4]);
  });
});
