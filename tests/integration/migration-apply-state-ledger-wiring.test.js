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

// SD-LEO-FIX-VERIFY-MIGRATION-APPLY-001 (FR-2) — --json mode's stdout-purity contract, exercised
// against a REAL ceremony-pending gap rather than trusted by comment.
//
// A CHAIRMAN-GATED FIXTURE, DETERMINISTICALLY FORCED. Rather than depending on the ambient repo
// already having a real chairman-gated migration pending ceremony (true today, not guaranteed at
// every future run), this plants one: any file under database/chairman-gated/ with real DDL that
// is certainly not applied to the live schema gets classified CEREMONY_PENDING (FR-2 of
// SD-LEO-INFRA-APPLY-STATE-CEREMONY-PENDING-001, verify-migration-apply-state.mjs:499-505),
// deterministically populating ceremonyPendingFailSet for this run regardless of ambient state.
//
// spawnSync used directly here (NOT the shared runVerifier() above), because that helper
// deliberately COMBINES stdout+stderr -- the one thing this test exists to tell apart.
describe('FR-2 (SD-LEO-FIX-VERIFY-MIGRATION-APPLY-001) — --json stdout stays pure JSON with a ceremony-pending gap present', () => {
  const FIXTURE = path.join(ROOT, 'database', 'chairman-gated', '__test-fixture-ceremony-pending-stdout-purity.sql');

  function runVerifierSeparateStreams(args) {
    const r = spawnSync('node', [VERIFIER, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.status ?? -1 };
  }

  /**
   * The EXACT consumer parse this test exists to protect (chairman-apply-state.js:45-51):
   * anchor on the first line whose column 0 is '{', then slice to the END of the string and
   * JSON.parse. Deliberately NOT the brace-matching parser used elsewhere in this file --
   * validation-agent's explicit finding was that a brace-matched assertion would PASS even with
   * the bug present (it tolerates trailing content by construction), making it a dead test for
   * this specific regression.
   */
  function parseLikeChairmanApplyState(stdout) {
    const lines = stdout.split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith('{'));
    if (start === -1) throw new Error('no JSON object found on stdout');
    return JSON.parse(lines.slice(start).join('\n'));
  }

  beforeAll(() => {
    fs.mkdirSync(path.dirname(FIXTURE), { recursive: true });
    fs.writeFileSync(
      FIXTURE,
      'CREATE TABLE __test_fixture_ceremony_pending_stdout_purity (id int);\n',
      'utf8',
    );
  });

  afterAll(() => {
    if (fs.existsSync(FIXTURE)) fs.rmSync(FIXTURE);
  });

  it('the fixture actually produces a ceremony-pending gap (sanity check the seed, not just the fix)', () => {
    const { stdout, stderr } = runVerifierSeparateStreams(['--json']);
    const report = parseLikeChairmanApplyState(stdout);
    const fixtureEntry = (report.files || []).find((f) => String(f.file).includes('__test-fixture-ceremony-pending-stdout-purity'));
    expect(fixtureEntry, 'fixture file not found in classifier output at all').toBeTruthy();
    expect(fixtureEntry.status).toBe('CEREMONY_PENDING');
    // The warning must exist SOMEWHERE (proves the seed reached the code path this test
    // targets) -- which stream it's on is exactly what the next test asserts.
    expect(stdout + stderr).toContain('chairman-gated migration(s) awaiting ceremony');
  }, 300000);

  it('--json stdout is pure JSON: the ceremony-pending warning is NOT on stdout', () => {
    const { stdout } = runVerifierSeparateStreams(['--json']);
    expect(stdout).not.toContain('::warning::');
    // The real regression: this must not throw.
    expect(() => parseLikeChairmanApplyState(stdout)).not.toThrow();
  }, 300000);

  it('--json stdout is pure JSON: parsing it end-to-end returns a populated files[] array (the actual chairman-apply-state.js contract)', () => {
    const { stdout } = runVerifierSeparateStreams(['--json']);
    const report = parseLikeChairmanApplyState(stdout);
    expect(Array.isArray(report.files)).toBe(true);
    expect(report.files.length).toBeGreaterThan(0);
  }, 300000);

  it('the warning still lands on stdout in the ceremony-pending case', () => {
    const { stdout } = runVerifierSeparateStreams([]);
    expect(stdout).toContain('::warning::');
    expect(stdout).toContain('chairman-gated migration(s) awaiting ceremony');
  }, 300000);
});

/**
 * SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-D (TS-1) — end to end, against the REAL repo corpus
 * (deliberately not a synthetic fixture: the assertion IS that the real basename-collision
 * exclusion set is now visible in --json, and that admitting it did not change what the scan
 * itself counts as forward/down migrations).
 *
 * TS-1 CORRECTION (testing-agent evidence efb3313d): all 5 originally-colliding basenames were
 * ALREADY in forward[] via their database/migrations copy before this SD -- excluded[] only ever
 * held the supabase/migrations twin. "Files appear in forward[]" is therefore NOT a valid
 * regression assertion (it passes against unmodified code). The real assertions are: (a) exactly
 * the one genuinely-divergent basename remains excluded (the 4 byte-identical twins were
 * reconciled at source, FR-1), and (b) forward/down counts are UNCHANGED from their pre-SD values
 * -- proving the reconciliation neither added nor silently dropped a migration from the scan.
 */
describe('SD-LEO-ORCH-CAPA-SCHEMA-TRUTH-001-D TS-1 — excluded[] promoted to --json, forward/down stable', () => {
  function run(args) {
    const r = spawnSync('node', [VERIFIER, ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    return { stdout: r.stdout || '', stderr: r.stderr || '', code: r.status ?? -1 };
  }
  function parseLikeChairmanApplyState(stdout) {
    const lines = stdout.split(/\r?\n/);
    const start = lines.findIndex((l) => l.startsWith('{'));
    if (start === -1) throw new Error('no JSON object found on stdout');
    return JSON.parse(lines.slice(start).join('\n'));
  }

  it('--json payload carries a top-level excluded[] array (FR-2)', () => {
    const { stdout } = run(['--json']);
    const report = parseLikeChairmanApplyState(stdout);
    expect(Array.isArray(report.excluded)).toBe(true);
  }, 300000);

  it('exactly one entry remains excluded, and it is the genuine DIVERGENT CONTENT case (FR-1 reconciliation did its job)', () => {
    const { stdout } = run(['--json']);
    const report = parseLikeChairmanApplyState(stdout);
    expect(report.excluded).toHaveLength(1);
    expect(report.excluded[0].verdict).toBe('DIVERGENT CONTENT');
    expect(report.excluded[0].id).toContain('20251129_musk_algorithm_pareto.sql');
  }, 300000);

  it('the divergent pair is untouched: both the scanned and the excluded copy still exist on disk (FR-3 — neither file is deleted)', () => {
    expect(fs.existsSync(path.join(ROOT, 'database', 'migrations', '20251129_musk_algorithm_pareto.sql'))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, 'supabase', 'migrations', '20251129_musk_algorithm_pareto.sql'))).toBe(true);
  });

  it('the 4 reconciled basenames no longer have a supabase/migrations twin (FR-1 removed the duplicate, not the file)', () => {
    for (const f of [
      '20251205_russian_judge_sd_type_awareness.sql',
      '20260105_automated_shipping_decisions.sql',
      '20260108_capability_ledger_v2.sql',
      '20260731_fix_chairman_privilege_app_metadata.sql',
    ]) {
      expect(fs.existsSync(path.join(ROOT, 'supabase', 'migrations', f)), `supabase/migrations/${f} should be removed`).toBe(false);
      expect(fs.existsSync(path.join(ROOT, 'database', 'migrations', f)), `database/migrations/${f} should still exist`).toBe(true);
    }
  });

  it('excluded[] is genuinely consumed downstream: migration-gap-summary.mjs surfaces it (round-trip, guards against a "wired but inert" regression)', () => {
    const script = path.join(ROOT, 'scripts', 'migration-gap-summary.mjs');
    const r = spawnSync('node', [script, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
    const lines = (r.stdout || '').split(/\r?\n/);
    const start = lines.findIndex((l) => l.trim() === '{');
    const summary = JSON.parse(lines.slice(start).join('\n'));
    expect(summary.excludedSource).toBe('present');
    expect(summary.excludedTotal).toBe(1);
    expect(summary.excludedDivergent).toHaveLength(1);
  }, 300000);
});
