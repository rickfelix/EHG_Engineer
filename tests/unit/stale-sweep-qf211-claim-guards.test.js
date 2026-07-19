// QF-20260525-211: regression guards for the sweep claim-churn fixes.
//   B1 — CLAIM_FIX never re-asserts a claim on a terminal (completed/cancelled) SD.
//   B2 — workingOnCompleted bilateral-release covers cancelled, not just completed.
//   Early-exit — the QF stale-claim clear (originally QF-20260525-836) runs BEFORE the
//                "No sessions with claims" early-return, so it executes even with zero
//                SD-claiming sessions (the fleet-wound-down common case).
// Static source assertions (matches the project convention for this monolithic script —
// see stale-sweep-cancelled-claims.test.js / cancel-sd-script.test.js); CI-runnable, no DB.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SCRIPT = path.resolve(__dirname, '../../scripts/stale-session-sweep.cjs');
const src = readFileSync(SCRIPT, 'utf8');

describe('QF-20260525-211 (B1): CLAIM_FIX terminal-status guard', () => {
  it('CLAIM_FIX SELECT includes status so terminal SDs can be detected', () => {
    // the broken-claim loop must read status, not just sd_key/claiming_session_id/is_working_on
    expect(src).toMatch(/select\(\s*['"]sd_key,\s*status,\s*claiming_session_id,\s*is_working_on['"]\s*\)/);
  });

  it('skips re-assertion on terminal SDs (completed OR cancelled)', () => {
    expect(src).toMatch(/if\s*\(\s*sd\.status === ['"]completed['"] \|\| sd\.status === ['"]cancelled['"]\s*\)/);
  });

  it('clears the live session\'s stale sd_key instead of re-asserting the claim', () => {
    const idx = src.indexOf("released_reason: 'SWEEP_SD_TERMINAL_CLAIM_FIX'");
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx - 400, idx + 400);
    expect(block).toMatch(/sd_key:\s*null/);
    // race guard: only clear if the session still points at this terminal SD
    expect(block).toMatch(/\.eq\(['"]sd_key['"],\s*s\.sd_key\)/);
  });

  it('uses continue to avoid falling through into the re-assert branch', () => {
    const guardIdx = src.indexOf('SWEEP_SD_TERMINAL_CLAIM_FIX');
    const afterGuard = src.slice(guardIdx, guardIdx + 700);
    expect(afterGuard).toMatch(/continue;/);
  });
});

describe('SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: CLAIM_FIX fixture-session guard (bug fd018627)', () => {
  it('imports the SHARED isFixtureSession predicate (SoT, not a local re-impl)', () => {
    expect(src).toMatch(/await import\(['"]\.\.\/lib\/fleet\/session-predicates\.mjs['"]\)/);
    expect(src).toContain('isFixtureSession');
  });

  it('guards the broken-claim loop on isFixtureSession(s.session_id)', () => {
    expect(src).toMatch(/if\s*\(\s*isFixtureSession\(s\.session_id\)\s*\)/);
  });

  it('bilaterally releases the fixture session — clears sd_key with a race guard', () => {
    const idx = src.indexOf("released_reason: 'SWEEP_FIXTURE_SESSION_CLAIM_FIX'");
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx - 400, idx + 600);
    expect(block).toMatch(/sd_key:\s*null/);
    expect(block).toMatch(/\.eq\(['"]sd_key['"],\s*s\.sd_key\)/); // race guard on the session clear
  });

  it('clears the SD claim ONLY if it still points at the fixture (race guard), then continues', () => {
    const idx = src.indexOf('SWEEP_FIXTURE_SESSION_CLAIM_FIX');
    const block = src.slice(idx, idx + 1300);
    expect(block).toMatch(/claiming_session_id:\s*null/);
    // FR-1 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): the SD-only release MUST also null
    // active_session_id (the sync trigger's CAS branch can't cover a value pointing at another
    // session). This SD-release site previously omitted it — the claim-lifecycle guard caught it.
    expect(block).toMatch(/active_session_id:\s*null/);
    expect(block).toMatch(/\.eq\(['"]claiming_session_id['"],\s*s\.session_id\)/); // race guard on the SD clear
    expect(block).toMatch(/continue;/);
  });

  it('the fixture guard PRECEDES the terminal-status guard (covers all downstream branches)', () => {
    expect(src.indexOf('SWEEP_FIXTURE_SESSION_CLAIM_FIX')).toBeLessThan(src.indexOf('SWEEP_SD_TERMINAL_CLAIM_FIX'));
  });

  // Adversarial-review fix (Defect 2): a fixture must not win conflict-keeper selection and evict a
  // real worker before the CLAIM_FIX fixture guard runs ~166 lines later.
  it('excludes fixtures from the conflict bySD build (keeper selection)', () => {
    const idx = src.indexOf('const bySD = {}');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 260);
    expect(block).toMatch(/if\s*\(\s*isFixtureSession\(s\.session_id\)\s*\)\s*return;/);
  });

  it('imports isFixtureSession ABOVE the conflict build (not only in the broken-claim loop)', () => {
    const importIdx = src.indexOf("import('../lib/fleet/session-predicates.mjs')");
    const conflictIdx = src.indexOf('const bySD = {}');
    expect(importIdx).toBeGreaterThan(0);
    expect(importIdx).toBeLessThan(conflictIdx); // hoisted before conflict detection
  });
});

describe('QF-20260525-211 (B2): workingOnCompleted covers cancelled', () => {
  it('workingOnCompleted filter matches completed OR cancelled', () => {
    const idx = src.indexOf('const workingOnCompleted');
    expect(idx).toBeGreaterThan(0);
    const block = src.slice(idx, idx + 250);
    expect(block).toMatch(/sd\.status === ['"]completed['"] \|\| sd\.status === ['"]cancelled['"]/);
  });

  it('release reason reflects cancellation (SWEEP_SD_CANCELLED) distinctly', () => {
    expect(src).toMatch(/SWEEP_SD_CANCELLED/);
    expect(src).toMatch(/releasedReason\s*=\s*sdTerminalStatus === ['"]cancelled['"]/);
  });
});

describe('QF-20260525-211 (early-exit gap): QF claim clear runs before the early-return', () => {
  it('clearStaleQfClaims is extracted as a standalone, callable function', () => {
    expect(src).toMatch(/async function clearStaleQfClaims\(supabase, now, actions, warnings\)/);
  });

  it('clearStaleQfClaims is invoked BEFORE the "No sessions with claims" early-return', () => {
    const callIdx = src.indexOf('await clearStaleQfClaims(supabase, now, actions, warnings)');
    // target the actual early-return console.log, not the docstring mention of the phrase
    const earlyReturnIdx = src.indexOf('No sessions with claims. All clear.');
    expect(callIdx).toBeGreaterThan(0);
    expect(earlyReturnIdx).toBeGreaterThan(0);
    expect(callIdx).toBeLessThan(earlyReturnIdx);
  });

  it('the early-return path flushes accumulated actions (so a cleared QF claim is reported)', () => {
    // when sessions is empty, print accumulated actions if any exist, else "All clear"
    expect(src).toMatch(/if\s*\(\s*!sessions[\s\S]{0,200}actions\.length > 0[\s\S]{0,200}No sessions with claims/);
  });

  it('does NOT double-run: the inline QF clear block was removed from main()', () => {
    // Two select sites now, BOTH inside the clearStaleQfClaims helper (QF-20260711-176 added a
    // TERMINAL-status pass alongside the QF-211 open/in_progress pass); the old inline
    // VERY_STALE_SECONDS gate in main() stays gone.
    const selects = src.match(/from\(['"]quick_fixes['"]\)\s*\n\s*\.select\(['"]id, status, claiming_session_id['"]\)/g) || [];
    expect(selects).toHaveLength(2);
    const helperIdx = src.indexOf('async function clearStaleQfClaims');
    const helperEnd = src.indexOf('\n}', src.indexOf('QF_CLAIM_SWEEP', helperIdx));
    let searchFrom = 0;
    for (const m of selects) {
      const at = src.indexOf(m, searchFrom);
      expect(at).toBeGreaterThan(helperIdx);
      expect(at).toBeLessThan(helperEnd);
      searchFrom = at + m.length;
    }
    expect(src).not.toMatch(/if\s*\(ageSec <= VERY_STALE_SECONDS\)/);
  });

  it('preserves QF-836 safety: race guard + conservative staleness bar', () => {
    const idx = src.indexOf('async function clearStaleQfClaims');
    const fn = src.slice(idx, idx + 3600); // widened: the QF-176 terminal pass precedes the open/in_progress pass
    // only clear if still held by the same (dead) session
    expect(fn).toMatch(/\.eq\(['"]claiming_session_id['"],\s*qf\.claiming_session_id\)/);
    // leave alive/recent holders alone
    expect(fn).toMatch(/if\s*\(ageSec <= veryStaleSeconds\)\s*continue;/);
    // open/in_progress QFs remain liveness-gated candidates
    expect(fn).toMatch(/\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]open['"]\s*,\s*['"]in_progress['"]\s*\]/);
  });

  it('QF-20260711-176: terminal QFs are cleared unconditionally (no legitimate holder)', () => {
    const idx = src.indexOf('async function clearStaleQfClaims');
    const fn = src.slice(idx, idx + 3600);
    expect(fn).toMatch(/\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]completed['"]\s*,\s*['"]cancelled['"]\s*,\s*['"]escalated['"]\s*,\s*['"]closed['"]\s*\]/);
    expect(fn).toMatch(/TERMINAL/);
  });
});
