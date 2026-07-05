/**
 * QF-20260704-825 — sd-start.js SILENTLY claimed an unrelated SD when the explicitly-named
 * target was already 'completed'. claimGuard() correctly returns
 * { success:false, error:'sd_terminal_status', status } for a completed/deferred SD, but the
 * auto-fallback branch (`if (!claimResult.success && fallbackEnabled)`) treated EVERY failure
 * reason identically -- including sd_terminal_status -- so under AUTO-PROCEED (fallbackEnabled
 * defaults true) it searched the belt and silently claimed a DIFFERENT, unrelated SD. Worker
 * believed they held the named SD: wrong worktree, wrong branch, wasted effort.
 *
 * Fix: a hard, unconditional exit (TARGET_ALREADY_TERMINAL) on sd_terminal_status BEFORE the
 * auto-fallback branch is ever reached -- an explicit-target invocation on a terminal SD is
 * never a "claim conflict" that fallback search should resolve.
 *
 * Static-pin pattern (mocking-independent), per tests/unit/sd-start-human-action-gate.test.js.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '..', '..', 'scripts/sd-start.js'), 'utf8');

describe('QF-20260704-825: TARGET_ALREADY_TERMINAL guard precedes auto-fallback', () => {
  it('checks claimResult.error === "sd_terminal_status" and process.exit(1)s unconditionally', () => {
    const idx = src.indexOf('TARGET_ALREADY_TERMINAL');
    expect(idx).toBeGreaterThan(0);
    const body = src.slice(idx - 400, idx + 700);
    expect(body).toMatch(/claimResult\.error === 'sd_terminal_status'/);
    expect(body).toMatch(/process\.exit\(1\)/);
  });

  it('the terminal-status exit does NOT gate on fallbackEnabled (must fire regardless of AUTO-PROCEED)', () => {
    const idx = src.indexOf('TARGET_ALREADY_TERMINAL');
    // The `if` condition governing this block, read backwards from the marker, must not
    // reference fallbackEnabled -- it should be unconditional once sd_terminal_status is seen.
    const guardStart = src.lastIndexOf('if (!claimResult.success', idx);
    const guardLine = src.slice(guardStart, src.indexOf('{', guardStart) + 1);
    expect(guardLine).not.toMatch(/fallbackEnabled/);
  });

  it('the terminal-status guard appears BEFORE the AUTO-FALLBACK search block in source order', () => {
    const terminalIdx = src.indexOf('TARGET_ALREADY_TERMINAL');
    const fallbackIdx = src.indexOf('AUTO-FALLBACK: ${effectiveId} is claimed');
    expect(terminalIdx).toBeGreaterThan(0);
    expect(fallbackIdx).toBeGreaterThan(0);
    expect(terminalIdx).toBeLessThan(fallbackIdx);
  });

  it('surfaces the SD status and a completion timestamp in the exit message', () => {
    const idx = src.indexOf('TARGET_ALREADY_TERMINAL');
    const body = src.slice(idx, idx + 700);
    expect(body).toMatch(/status=\$\{claimResult\.status\}/);
    expect(body).toMatch(/sd\.completion_date \|\| sd\.updated_at/);
  });

  it('getSDDetails selects completion_date/updated_at/updated_by so the exit message has real data', () => {
    expect(src).toMatch(/select\('id, sd_key,[^']*completion_date, updated_at, updated_by'\)/);
  });

  it('a genuine claim conflict (owned by another active session) still reaches auto-fallback (regression guard)', () => {
    // Sibling error reasons from claimGuard (e.g. 'claimed_by_other') must NOT be intercepted
    // by the terminal-status guard -- only the literal 'sd_terminal_status' string short-circuits.
    const idx = src.indexOf('TARGET_ALREADY_TERMINAL');
    const guardStart = src.lastIndexOf('if (!claimResult.success', idx);
    const guardLine = src.slice(guardStart, src.indexOf('{', guardStart) + 1);
    expect(guardLine).toMatch(/error === 'sd_terminal_status'/);
    expect(guardLine).not.toMatch(/claimed_by_other/);
  });
});
