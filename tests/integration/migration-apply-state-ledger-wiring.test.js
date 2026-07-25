/**
 * SD-LEO-INFRA-MIGRATION-APPLY-STATE-TRIAGE-001 — FR-6 wiring, end to end.
 *
 * WHY A SUBPROCESS TEST. Everything else in this SD is covered by pure unit tests, but the
 * single most safety-critical claim is STRUCTURAL: the ledger is loaded OUTSIDE the DB try
 * block, so a corrupt ledger can never print MIGRATION_APPLY_STATE_INFRA_ERROR — which
 * .github/workflows/migration-deploy-drift-guard.yml converts to `exit 0`. If that placement
 * ever regressed, a corrupt ledger would turn the drift gate permanently and SILENTLY GREEN.
 *
 * A unit test cannot see that: main() is not exported, and partitionRecentGaps only covers the
 * easy half of the seam (a hand-built Set). The claim lived in a code comment, and
 * correct-by-comment is not verified. This runs the real CLI against a deliberately corrupted
 * ledger and asserts on its actual output.
 *
 * The real ledger is backed up and restored in a finally, so a failure here cannot leave the
 * repo's committed artifact corrupted.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const VERIFIER = path.join(ROOT, 'scripts', 'verify-migration-apply-state.mjs');
const LEDGER = path.join(ROOT, 'docs', 'audits', 'migration-dispositions.json');
const INFRA = '[MIGRATION_APPLY_STATE_INFRA_ERROR]';
const PASS = '[MIGRATION_APPLY_STATE_PASS]';

/**
 * Run the verifier, returning BOTH streams plus the exit code.
 *
 * spawnSync rather than execFileSync: the latter returns only stdout on success, which would
 * silently drop the stderr diagnostics this test exists to assert on. The workflow itself
 * captures `2>&1`, so combining them here matches what CI actually greps.
 */
function runVerifier(args = []) {
  const r = spawnSync('node', [VERIFIER, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  return { out: `${r.stdout || ''}${r.stderr || ''}`, code: r.status ?? -1 };
}

let original = null;
beforeAll(() => { if (fs.existsSync(LEDGER)) original = fs.readFileSync(LEDGER, 'utf8'); });
afterAll(() => {
  if (original !== null) fs.writeFileSync(LEDGER, original, 'utf8');
  else if (fs.existsSync(LEDGER)) fs.rmSync(LEDGER);
});

describe('FR-6 wiring — a corrupt ledger must never fail the gate OPEN', () => {
  it('a malformed ledger yields NO INFRA_ERROR and NO false PASS', () => {
    fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
    fs.writeFileSync(LEDGER, '{ this is not valid json', 'utf8');

    const { out } = runVerifier();

    // The whole point: a ledger problem must not be reported as a DB infrastructure problem,
    // because the workflow treats INFRA_ERROR as "skip, exit 0".
    expect(out).not.toContain(INFRA);
    // ...and it must not silently pass either. Real gaps are still present, so the verdict
    // must remain GAPS_FOUND.
    expect(out).not.toContain(PASS);
    expect(out).toContain('[MIGRATION_APPLY_STATE_GAPS_FOUND]');
    // The operator is told the ledger is broken rather than seeing a plausible "0 entries".
    expect(out).toMatch(/ledger is malformed/i);
  }, 300000);

  it('a malformed ledger suppresses NOTHING — every gap is still reported', () => {
    fs.writeFileSync(LEDGER, '{ broken', 'utf8');
    const { out } = runVerifier();
    expect(out).toMatch(/DISPOSITIONS: \d+ of \d+ gap file\(s\) undispositioned; 0 suppressed/);
    expect(out).toContain('status=malformed');
  }, 300000);

  it('an ARRAY ledger (valid JSON, wrong shape) is refused, not iterated', () => {
    fs.writeFileSync(LEDGER, '[{"disposition":"RETIRED","reason":"x"}]', 'utf8');
    const { out } = runVerifier();
    expect(out).not.toContain(INFRA);
    expect(out).toContain('status=wrong-shape');
    expect(out).toMatch(/0 suppressed/);
  }, 300000);

  it('an APPLIED ledger entry cannot suppress a real gap or fake completion, end to end', () => {
    // The FR-2b guard proven through the actual CLI rather than through the pure function:
    // claim every one of the recent gap files is APPLIED and confirm the gate stays red, the
    // suppression count stays 0, and the contradiction is surfaced.
    const forged = {
      '20260713_quick_fixes_factory_lane.sql': {
        disposition: 'APPLIED', reason: 'forged by a test to prove this cannot suppress',
        owner: 'test', sd_key: 'SD-TEST', recorded_at: '2026-07-25T00:00:00.000Z',
      },
    };
    fs.writeFileSync(LEDGER, JSON.stringify(forged, null, 2), 'utf8');

    const { out, code } = runVerifier(['--strict', '--recent-only']);
    expect(out).toContain('[MIGRATION_APPLY_STATE_GAPS_FOUND]');
    expect(code).toBe(1); // still blocking
    expect(out).toMatch(/0 suppressed/);
    expect(out).toContain('LEDGER CONTRADICTS SCHEMA');
    expect(out).toContain('20260713_quick_fixes_factory_lane.sql');
  }, 300000);

  it('the committed ledger is well-formed and its suppressions are all reason-carrying', () => {
    // Guards the real artifact, not a fixture: a committed ledger that failed to parse would
    // silently stop suppressing, and this SD would look finished while doing nothing.
    expect(original, 'docs/audits/migration-dispositions.json should be committed').not.toBeNull();
    const parsed = JSON.parse(original);
    expect(Array.isArray(parsed)).toBe(false);
    for (const [file, entry] of Object.entries(parsed)) {
      expect(['APPLIED', 'RETIRED', 'DEFERRED'], `${file} disposition`).toContain(entry.disposition);
      expect(entry.reason.replace(/[\s​-‍­﻿]/g, '').length, `${file} reason`).toBeGreaterThan(20);
      expect(entry.sd_key, `${file} sd_key`).toBeTruthy();
    }
  });
});
