// SD-LEO-INFRA-ADVICE-OUTCOME-LEDGER-002 (FR-1) — canonical instrument-only outcome writer.
//
// The failure mode this guards against: a writer that can be talked into a good outcome by the
// proposal's OWN self-report text (CONST-002). Every "unmeasurable" test seeds a row whose
// outcome_ref text CLAIMS success, proving the writer never reads that claim.

import { describe, it, expect, vi } from 'vitest';
import { resolveLedgerOutcome, deriveSdKeyFromRef } from '../../../lib/ledger/outcome-writer.js';

const row = (outcome_sd_key, outcome_ref) => ({ outcome_sd_key, outcome_ref });

describe('resolveLedgerOutcome — outcome_sd_key path', () => {
  it('TS-1: a completed downstream SD resolves to shipped_clean', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue('completed');
    const result = await resolveLedgerOutcome(row('SD-X', null), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'RESOLVED', outcome: 'shipped_clean' });
    expect(sdStatusLookup).toHaveBeenCalledWith('SD-X');
  });

  it('a cancelled downstream SD resolves to reverted', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue('cancelled');
    const result = await resolveLedgerOutcome(row('SD-X', null), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'RESOLVED', outcome: 'reverted' });
  });

  it('an in_progress downstream SD returns NO_CHANGE, never unmeasurable', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue('in_progress');
    const result = await resolveLedgerOutcome(row('SD-X', null), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'NO_CHANGE' });
  });

  it('a not-found downstream SD (null status) returns NO_CHANGE, never unmeasurable', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue(null);
    const result = await resolveLedgerOutcome(row('SD-DOES-NOT-EXIST', null), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'NO_CHANGE' });
  });
});

describe('resolveLedgerOutcome — derivable outcome_ref path (ELIGIBLE / CASE_DRIFT)', () => {
  it('an ELIGIBLE ref with no outcome_sd_key derives and backfills the key on RESOLVED', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue('completed');
    const result = await resolveLedgerOutcome(row(null, 'SD-LEO-INFRA-X-001'), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'RESOLVED', outcome: 'shipped_clean', outcome_sd_key: 'SD-LEO-INFRA-X-001' });
    expect(sdStatusLookup).toHaveBeenCalledWith('SD-LEO-INFRA-X-001');
  });

  it('TS-1 (CASE_DRIFT clean): a lowercase SD key uppercases and resolves exactly like outcome_sd_key', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue('completed');
    const result = await resolveLedgerOutcome(row(null, 'sd-leo-infra-x-001'), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'RESOLVED', outcome: 'shipped_clean', outcome_sd_key: 'SD-LEO-INFRA-X-001' });
  });

  it('a CASE_DRIFT ref that is really a narrative paragraph (prefix-only match) is NOT derived — NO_CHANGE, sdStatusLookup never called', async () => {
    const sdStatusLookup = vi.fn();
    const ref = 'SD-LEO-INFRA-X-001 (in_progress) -- narrative note about why this was accepted';
    const result = await resolveLedgerOutcome(row(null, ref), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'NO_CHANGE' });
    expect(sdStatusLookup).not.toHaveBeenCalled();
  });

  it('a derivable ref pointing at a non-terminal SD returns NO_CHANGE without backfilling outcome_sd_key', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue('draft');
    const result = await resolveLedgerOutcome(row(null, 'SD-LEO-INFRA-X-002'), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'NO_CHANGE' });
  });

  it('a well-formed but nonexistent derived SD key returns NO_CHANGE (dead key, not unmeasurable)', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue(null);
    const result = await resolveLedgerOutcome(row(null, 'SD-LEO-INFRA-GHOST-999'), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'NO_CHANGE' });
  });
});

describe('resolveLedgerOutcome — EMPTY vs NOT_APPLICABLE (TS-2)', () => {
  it('TS-2: an empty ref returns NO_CHANGE, never unmeasurable', async () => {
    const sdStatusLookup = vi.fn();
    const result = await resolveLedgerOutcome(row(null, null), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'NO_CHANGE' });
    expect(sdStatusLookup).not.toHaveBeenCalled();
  });

  it('TS-2: narrative prose returns UNMEASURABLE with no reason field, evidence pointer left untouched by the writer', async () => {
    const sdStatusLookup = vi.fn();
    const result = await resolveLedgerOutcome(row(null, 'shipped and verified clean'), { sdStatusLookup });
    expect(result).toEqual({ verdict: 'UNMEASURABLE', outcome: 'unmeasurable' });
    expect(result.outcome_ref).toBeUndefined();
    expect(sdStatusLookup).not.toHaveBeenCalled();
  });

  it('a commit-sha-shaped ref returns UNMEASURABLE', async () => {
    const result = await resolveLedgerOutcome(row(null, 'a1b2c3d4e5f6789012345678901234567890abcd'), { sdStatusLookup: vi.fn() });
    expect(result).toEqual({ verdict: 'UNMEASURABLE', outcome: 'unmeasurable' });
  });

  it('a QF-excluded ref returns UNMEASURABLE', async () => {
    const result = await resolveLedgerOutcome(row(null, 'QF-20260509-PRMERGE-EXACT'), { sdStatusLookup: vi.fn() });
    expect(result).toEqual({ verdict: 'UNMEASURABLE', outcome: 'unmeasurable' });
  });
});

describe('resolveLedgerOutcome — TS-3 instrument diversity (refuted case)', () => {
  it('a self-report claiming success, with no sd_key and no derivable ref, NEVER resolves to shipped_clean — only unmeasurable', async () => {
    const sdStatusLookup = vi.fn();
    const result = await resolveLedgerOutcome(
      row(null, 'shipped and verified clean — all tests passing, deployed to prod'),
      { sdStatusLookup },
    );
    expect(result.verdict).toBe('UNMEASURABLE');
    expect(result.outcome).toBe('unmeasurable');
    expect(result.outcome).not.toBe('shipped_clean');
    expect(sdStatusLookup).not.toHaveBeenCalled();
  });

  it('resolveLedgerOutcome never reads a proposal_summary/body field even if present on the row', async () => {
    const sdStatusLookup = vi.fn().mockResolvedValue('completed');
    const contaminated = { outcome_sd_key: null, outcome_ref: null, proposal_summary: 'trust me, shipped clean' };
    const result = await resolveLedgerOutcome(contaminated, { sdStatusLookup });
    // outcome_ref is empty -> NO_CHANGE regardless of what proposal_summary claims
    expect(result).toEqual({ verdict: 'NO_CHANGE' });
  });
});

describe('resolveLedgerOutcome — non-string outcome_ref (TESTING sub-agent edge case)', () => {
  it('a non-string outcome_ref does not crash and is treated via String() coercion', async () => {
    const sdStatusLookup = vi.fn();
    const result = await resolveLedgerOutcome(row(null, { weird: 'object' }), { sdStatusLookup });
    // String({weird:'object'}) === '[object Object]' -> NARRATIVE -> UNMEASURABLE (documented,
    // not a crash; a real-world row should never carry a non-string ref, but the writer must not throw)
    expect(result.verdict).toBe('UNMEASURABLE');
  });
});

describe('deriveSdKeyFromRef', () => {
  it('TS-4e fixture parity: agrees with resolveLedgerOutcome on each canonical shape', () => {
    expect(deriveSdKeyFromRef('SD-LEO-INFRA-X-001')).toBe('SD-LEO-INFRA-X-001');
    expect(deriveSdKeyFromRef('sd-leo-infra-x-001')).toBe('SD-LEO-INFRA-X-001');
    expect(deriveSdKeyFromRef('SD-LEO-INFRA-X-001 (in_progress) -- narrative note')).toBeNull();
    expect(deriveSdKeyFromRef(null)).toBeNull();
    expect(deriveSdKeyFromRef('narrative prose')).toBeNull();
    expect(deriveSdKeyFromRef('a1b2c3d4e5f6789012345678901234567890abcd')).toBeNull();
    expect(deriveSdKeyFromRef('QF-20260509-PRMERGE-EXACT')).toBeNull();
  });
});
