// QF-20260609-660 — heal-command sd-persist must NOT emit HEAL_STATUS=PASS when a score
// failed to persist (e.g. a null/invalid total_score violating the eva_vision_scores NOT NULL
// constraint). Previously a failed insert was console.error'd + `continue`d, dropping the SD
// from insertedIds; if all failed, insertedIds was empty -> the verdict else-branch emitted
// PASS while writing zero rows (silent false-pass losing learning data).
//
// Mirrors the repo's heal-command test style (heal-low-confidence-unverified.test.js): the full
// CLI/DB path is gated by Supabase availability, so this asserts the pure verdict + validation
// logic via small mocks of the exact code paths.
import { describe, it, expect } from 'vitest';

// Mirrors the new guard in cmdSDPersist (heal-command.mjs): a total_score that is not a finite
// number is treated as a persist failure (it would violate the NOT NULL constraint).
function isValidTotalScore(s) {
  return typeof s === 'number' && Number.isFinite(s);
}

// Mirrors the verdict precedence in cmdSDPersist after the QF-20260609-660 fix.
function computeHealVerdict({ insertedIds = [], persistFailures = [], inProgress = false }) {
  if (persistFailures.length > 0) return 'PERSIST_FAILED';
  const needsCorrection = insertedIds.filter((s) => s.action !== 'accept');
  if (needsCorrection.length > 0) return inProgress ? 'NEEDS_CORRECTION_DEFERRED' : 'NEEDS_CORRECTION';
  return 'PASS';
}

describe('heal sd-persist: invalid total_score detection (QF-20260609-660)', () => {
  it('treats null/undefined/NaN/non-number total_score as invalid (would not persist)', () => {
    expect(isValidTotalScore(null)).toBe(false);
    expect(isValidTotalScore(undefined)).toBe(false);
    expect(isValidTotalScore(NaN)).toBe(false);
    expect(isValidTotalScore('80')).toBe(false);
    expect(isValidTotalScore({})).toBe(false);
  });
  it('accepts finite numeric total_score (including 0)', () => {
    expect(isValidTotalScore(0)).toBe(true);
    expect(isValidTotalScore(100)).toBe(true);
    expect(isValidTotalScore(72.5)).toBe(true);
  });
});

describe('heal sd-persist: verdict never PASS when a score failed to persist (QF-20260609-660)', () => {
  it('THE BUG: all inserts failed -> PERSIST_FAILED, never PASS', () => {
    // pre-fix this produced empty insertedIds -> else-branch -> PASS (silent false-pass)
    expect(computeHealVerdict({ insertedIds: [], persistFailures: [{ sdKey: 'SD-X', reason: 'null total_score' }] }))
      .toBe('PERSIST_FAILED');
  });
  it('mixed: some persisted (even accept) + a failure -> failure takes precedence', () => {
    expect(computeHealVerdict({ insertedIds: [{ action: 'accept' }], persistFailures: [{ sdKey: 'SD-Y', reason: 'boom' }] }))
      .toBe('PERSIST_FAILED');
  });
  it('all persisted, none below threshold -> PASS', () => {
    expect(computeHealVerdict({ insertedIds: [{ action: 'accept' }, { action: 'accept' }] })).toBe('PASS');
  });
  it('persisted with a sub-threshold score -> NEEDS_CORRECTION (not masked)', () => {
    expect(computeHealVerdict({ insertedIds: [{ action: 'escalate' }] })).toBe('NEEDS_CORRECTION');
    expect(computeHealVerdict({ insertedIds: [{ action: 'escalate' }], inProgress: true })).toBe('NEEDS_CORRECTION_DEFERRED');
  });
});
