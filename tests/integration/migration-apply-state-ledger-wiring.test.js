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
    // SD-LEO-INFRA-CHRONIC-RED-GUARD-001 (FR-1b): was a HARDCODED basename
    // ('20260713_quick_fixes_factory_lane.sql'). That file's live status moved to APPLIED and
    // left the gap set some time after this test was authored -- a forged ledger entry pointing
    // at a basename that is not a gap can never be "contradictory" (contradictoryBasenames()
    // only iterates the live gap set), so the assertion below silently stopped being reachable.
    // Confirmed by direct reproduction before this fix: the test failed because the tool's
    // OWN correct behavior (no contradiction to report for a non-gap file) looked identical to
    // a broken detector -- proving the detector itself needed no change, only this fixture's
    // basename needed to be resolved from the LIVE recent-gap set at test-run time, not a
    // filename frozen at authoring time.
    //
    // Ensure the ledger is genuinely empty first, so this run's own gap discovery is not
    // suppressed by whatever the ledger held from a prior test in this same file.
    if (fs.existsSync(LEDGER)) fs.rmSync(LEDGER);
    const discovery = runVerifier(['--json', '--recent-only']);
    let report;
    try {
      // Brace-match rather than slice-to-end-of-output: the verifier's --json mode prints the
      // JSON object followed by a trailing outcome marker (e.g. [MIGRATION_APPLY_STATE_GAPS_FOUND])
      // on stdout, and runVerifier() combines stdout+stderr -- either can leave content AFTER the
      // JSON's closing brace, which a naive "everything from the first '{' onward" parse cannot
      // tolerate. And a bare `discovery.out.indexOf('{')` is not safe for the START either --
      // reproduced directly: a dotenvx CLI tip banner line ("tip: ⌘ override existing
      // { override: true }") that precedes the real JSON contains its own tiny, unrelated
      // `{...}` fragment, which indexOf('{') finds FIRST. Anchor the start to a line that is
      // EXACTLY '{' (the same technique scripts/seed-migration-dispositions.mjs already uses for
      // this identical dotenvx-banner-before-JSON shape), then brace-match forward from there.
      const startMatch = /^\{[ \t]*$/m.exec(discovery.out);
      if (!startMatch) throw new Error("no line matching exactly '{' found in output");
      const startIdx = startMatch.index;
      let depth = 0, inStr = false, esc = false, endIdx = -1;
      for (let i = startIdx; i < discovery.out.length; i++) {
        const c = discovery.out[i];
        if (esc) { esc = false; continue; }
        if (c === '\\' && inStr) { esc = true; continue; }
        if (c === '"') { inStr = !inStr; continue; }
        if (inStr) continue;
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { endIdx = i; break; } }
      }
      if (endIdx === -1) throw new Error('no matching closing brace found');
      report = JSON.parse(discovery.out.slice(startIdx, endIdx + 1));
    } catch (e) {
      throw new Error(`could not parse verifier --json output to find a live recent gap: ${e.message}\n${discovery.out.slice(0, 2000)}`);
    }
    const liveRecentGap = (report.recentGaps || [])[0];
    expect(liveRecentGap, 'no live recent gap found to forge an APPLIED entry against -- the fixture needs at least one').toBeTruthy();
    const targetBasename = String(liveRecentGap.file).replace(/^.*[\\/]/, '');

    // The FR-2b guard proven through the actual CLI rather than through the pure function:
    // claim a genuinely live recent gap file is APPLIED and confirm the gate stays red, the
    // suppression count stays 0, and the contradiction is surfaced.
    const forged = {
      [targetBasename]: {
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
    expect(out).toContain(targetBasename);
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
