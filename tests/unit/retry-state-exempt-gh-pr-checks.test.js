/**
 * QF-20260704-784 — three distinct workers (Alpha, Foxtrot, Echo-3) tripped LEARN-129 on the
 * exact same command class within ~90min: `gh pr checks <PR#> --repo ...`, the fleet's
 * documented, standard CI-wait poll. It returns non-zero WHILE checks are pending -- the
 * expected in-progress state, not a failure -- so the read-only-classifier's exit-0-only
 * exemption never applies. Backstop: add to EXEMPT_PATTERNS (same precedent as the other
 * idempotent scheduled/monitoring commands already there).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { isExempt, recordAndCount } = require('../../scripts/hooks/retry-state-manager.cjs');

describe('isExempt — gh pr checks', () => {
  it('exempts the standard CI-wait poll regardless of PR number/repo', () => {
    expect(isExempt('gh pr checks 5593 --repo rickfelix/EHG_Engineer')).toBe(true);
    expect(isExempt('gh pr checks 1234 --repo rickfelix/ehg')).toBe(true);
  });

  it('does not exempt an unrelated gh subcommand (scoped match)', () => {
    expect(isExempt('gh pr list --repo rickfelix/EHG_Engineer')).toBe(false);
    expect(isExempt('gh pr merge 5593 --squash --admin')).toBe(false);
    expect(isExempt('gh run view 12345')).toBe(false);
  });
});

describe('recordAndCount honors the gh pr checks exemption while CI is pending (non-zero exit)', () => {
  let tmpDir;
  const SESSION = 'sess-exempt-gh-pr-checks';
  const noReset = async () => null;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'retry-exempt-gh-pr-checks-'));
    process.env.LEO_RETRY_STATE_DIR = tmpDir;
  });
  afterEach(() => {
    delete process.env.LEO_RETRY_STATE_DIR;
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('polling the SAME PR 4x while checks stay pending (non-zero exit each time) never accumulates -- the Alpha/Foxtrot/Echo-3 repro', async () => {
    const cmd = 'gh pr checks 5593 --repo rickfelix/EHG_Engineer';
    for (let i = 0; i < 4; i++) {
      const lastOutcome = i === 0 ? null : { exit_code: 8, stderr_sha: null };
      const r = await recordAndCount(SESSION, null, 'Bash', { command: cmd }, { rcaCheck: noReset, now: 1000 + i * 1000, lastOutcome });
      expect(r.attempts).toBe(0);
    }
  });
});
