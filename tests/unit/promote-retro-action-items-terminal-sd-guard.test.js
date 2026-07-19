/**
 * QF-20260719-740 — the promoter never re-checked whether the target SD was already
 * terminal (status=completed/cancelled) at promotion time. An 11-instance class of
 * moot QFs ("[Retro action items] <sd_id>") all targeted SDs that had already reached
 * LEAD-FINAL/cancelled by the time the promoter ran. Fix: skip promotion when the
 * retro's sd_id resolves to a terminal SD status.
 *
 * Same network-free source-pin approach as the sibling promote-retro-action-items-*
 * tests (the script top-level-queries Supabase on import, so it has no importable
 * exports) — re-implement the exact guard predicate inline to assert behavior.
 */
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(resolve(__dirname, '../../scripts/promote-retro-action-items.mjs'), 'utf8');

const TERMINAL_SD_STATUSES = new Set(['completed', 'cancelled']);
function isTerminalSd(retro, sdStatusById) {
  return Boolean(retro.sd_id && TERMINAL_SD_STATUSES.has(sdStatusById.get(retro.sd_id)));
}

describe('QF-20260719-740: promoter skips retros whose target SD is already terminal', () => {
  it('source defines completed + cancelled as terminal SD statuses', () => {
    expect(SRC).toMatch(/TERMINAL_SD_STATUSES\s*=\s*new Set\(\['completed', 'cancelled'\]\)/);
  });

  it('source gates promotion on the terminal-SD check before minting a QF', () => {
    expect(SRC).toMatch(/TERMINAL_SD_STATUSES\.has\(sdStatusById\.get\(retro\.sd_id\)\)/);
  });

  it('a retro whose SD is completed is skipped', () => {
    const byId = new Map([['sd-1', 'completed']]);
    expect(isTerminalSd({ sd_id: 'sd-1' }, byId)).toBe(true);
  });

  it('a retro whose SD is cancelled is skipped', () => {
    const byId = new Map([['sd-1', 'cancelled']]);
    expect(isTerminalSd({ sd_id: 'sd-1' }, byId)).toBe(true);
  });

  it('a retro whose SD is still in_progress is not skipped', () => {
    const byId = new Map([['sd-1', 'in_progress']]);
    expect(isTerminalSd({ sd_id: 'sd-1' }, byId)).toBe(false);
  });

  it('a retro with no sd_id cannot be validated and is not skipped by this guard', () => {
    expect(isTerminalSd({ sd_id: null }, new Map())).toBe(false);
  });
});
