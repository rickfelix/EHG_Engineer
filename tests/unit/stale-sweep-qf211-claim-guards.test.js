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
    // exactly one definition site (the helper), and the old inline VERY_STALE_SECONDS gate is gone
    expect(src.match(/from\(['"]quick_fixes['"]\)\s*\n\s*\.select\(['"]id, status, claiming_session_id['"]\)/g) || []).toHaveLength(1);
    expect(src).not.toMatch(/if\s*\(ageSec <= VERY_STALE_SECONDS\)/);
  });

  it('preserves QF-836 safety: race guard + conservative staleness bar', () => {
    const idx = src.indexOf('async function clearStaleQfClaims');
    const fn = src.slice(idx, idx + 1600);
    // only clear if still held by the same (dead) session
    expect(fn).toMatch(/\.eq\(['"]claiming_session_id['"],\s*qf\.claiming_session_id\)/);
    // leave alive/recent holders alone
    expect(fn).toMatch(/if\s*\(ageSec <= veryStaleSeconds\)\s*continue;/);
    // only open/in_progress QFs are candidates
    expect(fn).toMatch(/\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]open['"]\s*,\s*['"]in_progress['"]\s*\]/);
  });
});
