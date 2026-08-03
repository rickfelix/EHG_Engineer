// SD-LEO-INFRA-GUARD-FIRING-RECORDS-001 (FR-1) — the swallowed audit failure now leaves evidence.
//
// MEASURED STATE THAT MOTIVATED THIS: system_events holds 128,267 rows, and
// event_type='claim_write_refused_claimant_not_live' has ZERO, lifetime. The control proves the
// predicate is real — ilike '%S19_HA%' on the same column returns 125,275 — so the zero is genuine.
//
// The zero could not be READ, because recordRefusal's catch was EMPTY:
//     catch { /* audit is best-effort; never let it affect the fence outcome */ }
// A refusal whose insert failed left nothing anywhere, making "the fence never fired" and "the fence
// fired and was not recorded" the same observation.
//
// THE SWALLOW IS CORRECT AND STAYS. The docstring is right that an audit write must never block a
// claim decision; a fence failing closed because system_events is unreachable would be far worse
// than an unreadable counter. What changes is that the catch is no longer silent.
//
// THESE TESTS FORCE THE FAILURE. This SD exists because a guard's refuse path may never have
// executed while its pass path runs constantly — so a suite that exercised the happy path would
// inherit exactly that blindness. The failure path is the subject, so it is what gets driven.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const { recordRefusal, auditFailures } = require_('../../../lib/fleet/claimant-liveness.cjs');

const okDb = () => ({ from: () => ({ insert: async () => ({ error: null }) }) });
const throwingDb = (msg = 'permission denied for table system_events') => ({
  from: () => ({ insert: async () => { throw new Error(msg); } }),
});

const detail = { session_id: 's-1', verdict: 'DEAD', reason: 'pid not running' };

beforeEach(() => { auditFailures.claim_write_refused_claimant_not_live = 0; });

describe('FR-1: a failed refusal-audit write is visible instead of silent', () => {
  // THE DECIDING SCENARIO. Before this change the same call left no trace of any kind.
  it('counts and reports the failure when the insert throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await recordRefusal(throwingDb(), detail, { sdKey: 'SD-X' });
      expect(auditFailures.claim_write_refused_claimant_not_live).toBe(1);
      const said = warn.mock.calls.flat().join(' ');
      expect(said).toMatch(/REFUSAL AUDIT WRITE FAILED/);
      expect(said).toMatch(/UNRECORDED/);
      // The operator must be told the direction of the error: the count UNDER-reports.
      expect(said).toMatch(/under-report/i);
    } finally { warn.mockRestore(); }
  });

  // TR-2 / TS-4 CONTROL — the whole point of keeping the swallow. If this regresses, an audit
  // outage becomes a claim outage, which is strictly worse than the defect being fixed.
  it('CONTROL: it still never throws, so the fence outcome cannot be affected', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(recordRefusal(throwingDb(), detail, {})).resolves.toBeUndefined();
      // Even a pathological client that throws on .from() must not escape.
      const hostile = { from: () => { throw new Error('client exploded'); } };
      await expect(recordRefusal(hostile, detail, {})).resolves.toBeUndefined();
      expect(auditFailures.claim_write_refused_claimant_not_live).toBe(2);
    } finally { warn.mockRestore(); }
  });

  // CONTROL in the other direction — a counter that increments on success would make the signal
  // meaningless, and a warning on a healthy write would train readers to ignore it.
  it('CONTROL: a successful write neither counts nor warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await recordRefusal(okDb(), detail, { sdKey: 'SD-Y' });
      expect(auditFailures.claim_write_refused_claimant_not_live).toBe(0);
      expect(warn).not.toHaveBeenCalled();
    } finally { warn.mockRestore(); }
  });

  it('accumulates across repeated failures, so the under-report magnitude is knowable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      for (let i = 0; i < 3; i += 1) await recordRefusal(throwingDb(), detail, {});
      expect(auditFailures.claim_write_refused_claimant_not_live).toBe(3);
      expect(warn.mock.calls.flat().join(' ')).toMatch(/at least 3/);
    } finally { warn.mockRestore(); }
  });

  // Logging must not become a new way for the fence to die.
  it('survives a console.warn that itself throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => { throw new Error('stdout gone'); });
    try {
      await expect(recordRefusal(throwingDb(), detail, {})).resolves.toBeUndefined();
      expect(auditFailures.claim_write_refused_claimant_not_live).toBe(1);
    } finally { warn.mockRestore(); }
  });
});
