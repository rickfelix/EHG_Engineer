import { describe, it, expect, vi } from 'vitest';
import { evaluateCrackGateStatus, fetchPbnStatus, fetchLatestAttestation, recordCrackGateObservation, hasUnavailableSource } from '../../../lib/eva/lifecycle/crack-gate-evaluator.js';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';

/**
 * Per TR-5: no catch-all fallback. Any table/rpc not explicitly configured throws, so a new
 * unmocked read is a loud test failure, never a silent pass-through.
 */
function makeSupabase({ pbnRow, pbnError, attestations = {} } = {}) {
  return {
    rpc: vi.fn((fnName, args) => {
      if (fnName !== 'venture_pbn_status') throw new Error(`unmocked rpc: ${fnName}`);
      if (pbnError) return Promise.resolve({ data: null, error: pbnError });
      return Promise.resolve({ data: pbnRow ? [pbnRow] : [], error: null });
    }),
    from: vi.fn((table) => {
      if (table !== 'v_venture_gate_attestations_latest') throw new Error(`unmocked table: ${table}`);
      return {
        select: vi.fn(() => ({
          eq: vi.fn((col, val) => ({
            eq: vi.fn((col2, checkType) => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  maybeSingle: vi.fn(() => {
                    const entry = attestations[checkType];
                    if (entry?.error) return Promise.resolve({ data: null, error: entry.error });
                    return Promise.resolve({ data: entry?.row ?? null, error: null });
                  }),
                })),
              })),
            })),
          })),
        })),
      };
    }),
  };
}

const PASS_ROW = (checkType) => ({
  verdict: 'PASS', attested_by: 'rick@example.com', produced_by: 'stage-17-blueprint-review',
  subject_ref: `probe://${checkType}`, citation: 'https://example.com/review', path_to_pass: 'n/a', computed_at: new Date().toISOString(),
});

describe('crack-gate-evaluator (SD-FDBK-FIX-VENTURE-CRACK-GATE-001)', () => {
  describe('fetchPbnStatus', () => {
    it('TS-1a: PBN_SCORED/PASS passes through unchanged', async () => {
      const supabase = makeSupabase({ pbnRow: { status: 'PBN_SCORED', verdict: 'PASS', source: 'ventures_metadata', reason: 'metadata_authoritative', degraded: false } });
      const result = await fetchPbnStatus(supabase, VENTURE_ID);
      expect(result.status).toBe('PBN_SCORED');
      expect(result.verdict).toBe('PASS');
    });

    it('TS-4: an RPC error surfaces as PBN_SOURCE_UNAVAILABLE with the error message in reason, never silently swallowed', async () => {
      const supabase = makeSupabase({ pbnError: { message: 'connection refused' } });
      const result = await fetchPbnStatus(supabase, VENTURE_ID);
      expect(result.status).toBe('PBN_SOURCE_UNAVAILABLE');
      expect(result.reason).toContain('connection refused');
    });

    it('TS-2: PBN_CONFLICT passes through unchanged (evaluator must not resolve it)', async () => {
      const supabase = makeSupabase({ pbnRow: { status: 'PBN_CONFLICT', verdict: null, source: 'both', reason: 'metadata=PASS;nursery=REJECT', degraded: false } });
      const result = await fetchPbnStatus(supabase, VENTURE_ID);
      expect(result.status).toBe('PBN_CONFLICT');
      expect(result.verdict).toBeNull();
    });
  });

  describe('fetchLatestAttestation', () => {
    it('TS-1b: a PASS row resolves to verdict=PASS', async () => {
      const supabase = makeSupabase({ attestations: { stage17_judgment: { row: PASS_ROW('stage17_judgment') } } });
      const result = await fetchLatestAttestation(supabase, VENTURE_ID, 'stage17_judgment');
      expect(result.verdict).toBe('PASS');
    });

    it('no row (absence) resolves to NO_DATA, never PASS -- fail-closed on absence', async () => {
      const supabase = makeSupabase({ attestations: {} });
      const result = await fetchLatestAttestation(supabase, VENTURE_ID, 'chairman_site_review');
      expect(result.verdict).toBe('NO_DATA');
    });

    it('TS-4b/ATTESTATION_SOURCE_UNAVAILABLE: a missing-relation error (PGRST205) is distinguished from NO_DATA', async () => {
      const supabase = makeSupabase({ attestations: { stage17_judgment: { error: { code: 'PGRST205', message: "Could not find the table 'public.v_venture_gate_attestations_latest' in the schema cache" } } } });
      const result = await fetchLatestAttestation(supabase, VENTURE_ID, 'stage17_judgment');
      expect(result.verdict).toBe('ATTESTATION_SOURCE_UNAVAILABLE');
      expect(result.reason).toBe('attestations_table_not_yet_applied');
    });

    it('a non-missing-relation read error is also ATTESTATION_SOURCE_UNAVAILABLE but with a distinct reason', async () => {
      const supabase = makeSupabase({ attestations: { stage17_judgment: { error: { code: '08006', message: 'connection timeout' } } } });
      const result = await fetchLatestAttestation(supabase, VENTURE_ID, 'stage17_judgment');
      expect(result.verdict).toBe('ATTESTATION_SOURCE_UNAVAILABLE');
      expect(result.reason).toContain('connection timeout');
      expect(result.reason).not.toBe('attestations_table_not_yet_applied');
    });
  });

  describe('evaluateCrackGateStatus', () => {
    it('TS-1: all three PASS -> overall=MEETS_CRITERION, missing=[]', async () => {
      const supabase = makeSupabase({
        pbnRow: { status: 'PBN_SCORED', verdict: 'PASS', source: 'ventures_metadata', reason: 'metadata_authoritative', degraded: false },
        attestations: { stage17_judgment: { row: PASS_ROW('stage17_judgment') }, chairman_site_review: { row: PASS_ROW('chairman_site_review') } },
      });
      const result = await evaluateCrackGateStatus(supabase, VENTURE_ID);
      expect(result.overall).toBe('MEETS_CRITERION');
      expect(result.missing).toEqual([]);
    });

    it('F1 fix (post-merge TESTING mutation finding): PBN_SCORED but verdict=REJECT -> overall=NOT_MET, pbn named in missing[]. Without the pbn.verdict===PASS conjunct in evaluateCrackGateStatus, this case would wrongly read as satisfied since status alone is PBN_SCORED', async () => {
      const supabase = makeSupabase({
        pbnRow: { status: 'PBN_SCORED', verdict: 'REJECT', source: 'ventures_metadata', reason: 'metadata_authoritative', degraded: false },
        attestations: { stage17_judgment: { row: PASS_ROW('stage17_judgment') }, chairman_site_review: { row: PASS_ROW('chairman_site_review') } },
      });
      const result = await evaluateCrackGateStatus(supabase, VENTURE_ID);
      expect(result.overall).toBe('NOT_MET');
      expect(result.missing.map((m) => m.check)).toContain('pbn');
    });

    it('TS-2/PBN_CONFLICT: overall=NOT_MET, fail-closed, never picks a side', async () => {
      const supabase = makeSupabase({
        pbnRow: { status: 'PBN_CONFLICT', verdict: null, source: 'both', reason: 'metadata=PASS;nursery=REJECT', degraded: false },
        attestations: { stage17_judgment: { row: PASS_ROW('stage17_judgment') }, chairman_site_review: { row: PASS_ROW('chairman_site_review') } },
      });
      const result = await evaluateCrackGateStatus(supabase, VENTURE_ID);
      expect(result.overall).toBe('NOT_MET');
      expect(result.missing.map((m) => m.check)).toContain('pbn');
    });

    it('all three missing -> overall=NOT_MET with all three named in missing[]', async () => {
      const supabase = makeSupabase({ pbnRow: { status: 'PBN_NOT_SCORED', verdict: null, source: 'none', reason: 'no_nursery_row_and_no_metadata_verdict', degraded: false }, attestations: {} });
      const result = await evaluateCrackGateStatus(supabase, VENTURE_ID);
      expect(result.overall).toBe('NOT_MET');
      expect(result.missing.map((m) => m.check).sort()).toEqual(['chairman_site_review', 'pbn', 'stage17_judgment']);
    });

    it('TS-4: attestations table not yet applied (both check types) -> overall=NOT_MET, distinct reason surfaced, not a crash', async () => {
      const notApplied = { error: { code: 'PGRST205', message: 'schema cache miss' } };
      const supabase = makeSupabase({ pbnRow: { status: 'PBN_NOT_SCORED', verdict: null, source: 'none', reason: 'legit', degraded: false }, attestations: { stage17_judgment: notApplied, chairman_site_review: notApplied } });
      const result = await evaluateCrackGateStatus(supabase, VENTURE_ID);
      expect(result.overall).toBe('NOT_MET');
      expect(result.stage17_judgment.verdict).toBe('ATTESTATION_SOURCE_UNAVAILABLE');
      expect(result.chairman_site_review.verdict).toBe('ATTESTATION_SOURCE_UNAVAILABLE');
    });
  });
});

// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-2 (class b): proves the "named verdict contract"
// acceptance criterion -- fetchLatestAttestation()/evaluateCrackGateStatus() must read a
// stage17_judgment row identically regardless of who/what produced it, so a future APA Child E
// automated producer can start writing rows with zero change to this read path.
describe('FR-2 producer-agnostic contract: attested_by/produced_by identity never changes how a row is read', () => {
  const HUMAN_ROW = {
    verdict: 'PASS', attested_by: 'rick@example.com', produced_by: 'manual-review',
    subject_ref: 'probe://stage17_judgment', citation: 'https://example.com/review', path_to_pass: 'n/a', computed_at: '2026-08-18T00:00:00.000Z',
  };
  // Shaped like a hypothetical future APA Child E automated producer -- a specific, identified
  // machine actor (not a generic 'system'/'bot' the table's own denylist would reject), distinct
  // from produced_by, mirroring the vga_attested_by_is_identified precedent for 'testing_agent'.
  const AUTOMATED_ROW = {
    verdict: 'PASS', attested_by: 'apa_e_stage17_judge', produced_by: 'venture_build_pipeline',
    subject_ref: 'probe://stage17_judgment', citation: 'kind:apa_e_run-9f2a1c', path_to_pass: 'n/a', computed_at: '2026-08-18T00:00:00.000Z',
  };

  it('a human-attested PASS row and a hypothetical automated-producer PASS row resolve to the identical verdict', async () => {
    const humanSupabase = makeSupabase({ attestations: { stage17_judgment: { row: HUMAN_ROW } } });
    const automatedSupabase = makeSupabase({ attestations: { stage17_judgment: { row: AUTOMATED_ROW } } });

    const humanResult = await fetchLatestAttestation(humanSupabase, VENTURE_ID, 'stage17_judgment');
    const automatedResult = await fetchLatestAttestation(automatedSupabase, VENTURE_ID, 'stage17_judgment');

    expect(humanResult.verdict).toBe('PASS');
    expect(automatedResult.verdict).toBe('PASS');
    expect(humanResult.verdict).toBe(automatedResult.verdict);
  });

  it('evaluateCrackGateStatus treats both producer shapes as satisfying the stage17_judgment leg identically', async () => {
    const pbnRow = { status: 'PBN_SCORED', verdict: 'PASS', source: 'ventures_metadata', reason: 'metadata_authoritative', degraded: false };

    const humanSupabase = makeSupabase({ pbnRow, attestations: { stage17_judgment: { row: HUMAN_ROW }, chairman_site_review: { row: PASS_ROW('chairman_site_review') } } });
    const automatedSupabase = makeSupabase({ pbnRow, attestations: { stage17_judgment: { row: AUTOMATED_ROW }, chairman_site_review: { row: PASS_ROW('chairman_site_review') } } });

    const humanVerdict = await evaluateCrackGateStatus(humanSupabase, VENTURE_ID);
    const automatedVerdict = await evaluateCrackGateStatus(automatedSupabase, VENTURE_ID);

    expect(humanVerdict.overall).toBe('MEETS_CRITERION');
    expect(automatedVerdict.overall).toBe('MEETS_CRITERION');
    expect(humanVerdict.missing).toEqual(automatedVerdict.missing);
  });
});

describe('recordCrackGateObservation (shared by sweep + publish-gate layers)', () => {
  it('writes a system_events row with the documented payload shape and given source', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn((table) => { if (table !== 'system_events') throw new Error(`unmocked table: ${table}`); return { insert }; }) };

    await recordCrackGateObservation(supabase, VENTURE_ID, { overall: 'NOT_MET', missing: [{ check: 'pbn' }, { check: 'stage17_judgment' }] }, 'publish_gate');

    // ADVERSARIAL REVIEW FIX (live /heal smoke test): system_events' own auto-idempotency-key
    // trigger keys off the TOP-LEVEL venture_id column, not anything inside payload — omitting
    // it collapses every crack-gate row to the same key regardless of venture, causing real
    // 23505 unique-constraint collisions whenever two ventures land in the same wall-clock
    // second within one sweep cycle (reproduced live against the real DB before this fix).
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'VENTURE_CRACK_GATE_OBSERVE_ONLY',
      venture_id: VENTURE_ID,
      payload: expect.objectContaining({ venture_id: VENTURE_ID, would_block: true, missing: ['pbn', 'stage17_judgment'], source: 'publish_gate' }),
    }));
  });

  it('a MEETS_CRITERION verdict records would_block=false', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: () => ({ insert }) };
    await recordCrackGateObservation(supabase, VENTURE_ID, { overall: 'MEETS_CRITERION', missing: [] }, 'sweep');
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ would_block: false }) }));
  });

  it('throws (does not swallow) an insert error', async () => {
    const supabase = { from: () => ({ insert: vi.fn().mockResolvedValue({ error: { message: 'insert denied' } }) }) };
    await expect(recordCrackGateObservation(supabase, VENTURE_ID, { overall: 'NOT_MET', missing: [] }, 'sweep')).rejects.toThrow('insert denied');
  });
});

describe('source pin (TS-9): evaluator module only, never an uncommitted sibling file', () => {
  it('this test file imports only the committed lib module path', async () => {
    const mod = await import('../../../lib/eva/lifecycle/crack-gate-evaluator.js');
    expect(typeof mod.evaluateCrackGateStatus).toBe('function');
    expect(typeof mod.fetchPbnStatus).toBe('function');
    expect(typeof mod.fetchLatestAttestation).toBe('function');
  });
});

// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-8 (class h): distinguishes "the underlying DB objects
// don't exist" from "genuinely not scored/attested yet" -- the exact distinction whose absence
// let the sibling SD's backstop read as shipped while being DB-inert for weeks.
describe('hasUnavailableSource', () => {
  it('reports unavailable:false when every check has a real status/verdict (scored or genuinely not-yet-scored)', () => {
    expect(hasUnavailableSource({
      pbn: { status: 'PBN_SCORED', verdict: 'PASS' },
      stage17_judgment: { verdict: 'PASS' },
      chairman_site_review: { verdict: 'NO_DATA' }, // not-yet-attested is a real, distinct status -- not unavailable
    })).toEqual({ unavailable: false, reasons: [] });
  });

  it('reports unavailable:true with a pbn: reason when the PBN RPC source is unavailable', () => {
    const result = hasUnavailableSource({
      pbn: { status: 'PBN_SOURCE_UNAVAILABLE', reason: 'rpc_error:relation does not exist' },
      stage17_judgment: { verdict: 'PASS' },
      chairman_site_review: { verdict: 'NO_DATA' },
    });
    expect(result.unavailable).toBe(true);
    expect(result.reasons).toEqual(['pbn:rpc_error:relation does not exist']);
  });

  it('reports both attestation reasons when the attestations table is unapplied (the actual failure mode found this session)', () => {
    const result = hasUnavailableSource({
      pbn: { status: 'PBN_SCORED', verdict: 'PASS' },
      stage17_judgment: { verdict: 'ATTESTATION_SOURCE_UNAVAILABLE', reason: 'attestations_table_not_yet_applied' },
      chairman_site_review: { verdict: 'ATTESTATION_SOURCE_UNAVAILABLE', reason: 'attestations_table_not_yet_applied' },
    });
    expect(result.unavailable).toBe(true);
    expect(result.reasons).toEqual([
      'stage17_judgment:attestations_table_not_yet_applied',
      'chairman_site_review:attestations_table_not_yet_applied',
    ]);
  });

  it('handles a null/undefined verdict without throwing', () => {
    expect(hasUnavailableSource(null)).toEqual({ unavailable: false, reasons: [] });
    expect(hasUnavailableSource(undefined)).toEqual({ unavailable: false, reasons: [] });
    expect(hasUnavailableSource({})).toEqual({ unavailable: false, reasons: [] });
  });
});
