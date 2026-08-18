// SD-MAN-INFRA-VENTURE-CRACK-GATE-001 FR-3 (class c): chairman_site_review bridge-write.
import { describe, it, expect, vi } from 'vitest';
import {
  shouldAttestChairmanSiteReview,
  buildChairmanSiteReviewAttestationRow,
  resolveAndWriteChairmanSiteReviewAttestation,
  PRODUCT_REVIEW_DECISION_TYPE,
} from '../../../../lib/eva/bridge/chairman-site-review-attestation.js';

const VENTURE_ID = '50763b6a-1fad-4e1e-b2fc-296a1d66ebf9';
const DECISION_ID = 'aa11bb22-cc33-dd44-ee55-ff6677889900';

const PRODUCT_REVIEW_ROW = {
  venture_id: VENTURE_ID,
  decision_type: PRODUCT_REVIEW_DECISION_TYPE,
  lifecycle_stage: 23,
  attempt_number: 1,
  brief_data: { ventureName: 'AltifyAI', guidedTour: ['step1', 'step2'] },
};

describe('shouldAttestChairmanSiteReview (pure)', () => {
  it('approved product_review decision -> PASS', () => {
    expect(shouldAttestChairmanSiteReview(PRODUCT_REVIEW_ROW, 'approved')).toEqual({ shouldWrite: true, verdict: 'PASS' });
  });

  it('rejected product_review decision -> BLOCKED', () => {
    expect(shouldAttestChairmanSiteReview(PRODUCT_REVIEW_ROW, 'rejected')).toEqual({ shouldWrite: true, verdict: 'BLOCKED' });
  });

  it('a non-product_review decision_type (e.g. a kill-gate call routed through the same chairman_approval category) is never attested', () => {
    const result = shouldAttestChairmanSiteReview({ ...PRODUCT_REVIEW_ROW, decision_type: 'kill_gate' }, 'approved');
    expect(result.shouldWrite).toBe(false);
    expect(result.reason).toContain('kill_gate');
  });

  it('a decision row with no venture_id is never attested', () => {
    const result = shouldAttestChairmanSiteReview({ ...PRODUCT_REVIEW_ROW, venture_id: null }, 'approved');
    expect(result.shouldWrite).toBe(false);
  });

  it('a null decision row (not found) is never attested', () => {
    expect(shouldAttestChairmanSiteReview(null, 'approved')).toEqual({ shouldWrite: false, reason: 'decision row not found' });
  });

  it('an action with no attestation mapping is never attested (defer never reaches here in practice, but this is the safety net)', () => {
    const result = shouldAttestChairmanSiteReview(PRODUCT_REVIEW_ROW, 'deferred');
    expect(result.shouldWrite).toBe(false);
  });
});

describe('buildChairmanSiteReviewAttestationRow (pure)', () => {
  it('a PASS row carries a 64-hex-char content hash of the reviewed brief_data', () => {
    const row = buildChairmanSiteReviewAttestationRow({ decisionRow: PRODUCT_REVIEW_ROW, decisionId: DECISION_ID, verdict: 'PASS', decidedBy: 'rick@example.com' });
    expect(row.subject_content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.verdict).toBe('PASS');
  });

  it('a BLOCKED row carries NO content hash (not required, and none was reviewed-and-passed)', () => {
    const row = buildChairmanSiteReviewAttestationRow({ decisionRow: PRODUCT_REVIEW_ROW, decisionId: DECISION_ID, verdict: 'BLOCKED', decidedBy: 'rick@example.com' });
    expect(row.subject_content_hash).toBeUndefined();
  });

  it('attested_by and produced_by are always distinct (satisfies vga_attester_not_producer by construction)', () => {
    const row = buildChairmanSiteReviewAttestationRow({ decisionRow: PRODUCT_REVIEW_ROW, decisionId: DECISION_ID, verdict: 'PASS', decidedBy: 'rick@example.com' });
    expect(row.attested_by).toBe('rick@example.com');
    expect(row.produced_by).not.toBe(row.attested_by);
  });

  it('citation resolves the kind:identifier shape and cites the real decision row', () => {
    const row = buildChairmanSiteReviewAttestationRow({ decisionRow: PRODUCT_REVIEW_ROW, decisionId: DECISION_ID, verdict: 'PASS', decidedBy: 'rick@example.com' });
    expect(row.citation).toBe(`chairman_decision:${DECISION_ID}`);
    expect(row.citation).toMatch(/^[a-z_][a-z0-9_]*:[A-Za-z0-9._/-]{6,}$/);
  });

  it('findings is a plain object carrying the decision context', () => {
    const row = buildChairmanSiteReviewAttestationRow({ decisionRow: PRODUCT_REVIEW_ROW, decisionId: DECISION_ID, verdict: 'BLOCKED', decidedBy: 'rick@example.com', rationale: 'needs a working checkout flow' });
    expect(row.findings).toEqual({ decision_id: DECISION_ID, action: 'rejected', rationale: 'needs a working checkout flow', lifecycle_stage: 23, attempt_number: 1 });
  });

  it('enforcement_strength is convention, never structural (no external_verification evidence is supplied)', () => {
    const row = buildChairmanSiteReviewAttestationRow({ decisionRow: PRODUCT_REVIEW_ROW, decisionId: DECISION_ID, verdict: 'PASS', decidedBy: 'rick@example.com' });
    expect(row.enforcement_strength).toBe('convention');
  });
});

function makeSupabase({ decisionRow, decisionFetchError, insertResult, insertError } = {}) {
  const insert = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn(() => Promise.resolve({ data: insertResult ?? null, error: insertError ?? null })),
    })),
  }));
  return {
    from: vi.fn((table) => {
      if (table === 'chairman_decisions') {
        return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: decisionRow ?? null, error: decisionFetchError ?? null })) })) })) };
      }
      if (table === 'venture_gate_attestations') {
        return { insert };
      }
      throw new Error(`unmocked table: ${table}`);
    }),
    __insert: insert,
  };
}

describe('resolveAndWriteChairmanSiteReviewAttestation (I/O)', () => {
  it('happy path: approved product_review -> writes a PASS attestation', async () => {
    const supabase = makeSupabase({ decisionRow: PRODUCT_REVIEW_ROW, insertResult: { id: 7 } });
    const result = await resolveAndWriteChairmanSiteReviewAttestation(supabase, { decisionId: DECISION_ID, action: 'approved', decidedBy: 'rick@example.com' });
    expect(result).toEqual({ written: true, id: 7, verdict: 'PASS' });
    expect(supabase.__insert).toHaveBeenCalledWith(expect.objectContaining({ verdict: 'PASS', check_type: 'chairman_site_review', venture_id: VENTURE_ID }));
  });

  it('happy path: rejected product_review -> writes a BLOCKED attestation', async () => {
    const supabase = makeSupabase({ decisionRow: PRODUCT_REVIEW_ROW, insertResult: { id: 8 } });
    const result = await resolveAndWriteChairmanSiteReviewAttestation(supabase, { decisionId: DECISION_ID, action: 'rejected', decidedBy: 'rick@example.com' });
    expect(result).toEqual({ written: true, id: 8, verdict: 'BLOCKED' });
  });

  it('a non-product_review decision never reaches the insert call at all', async () => {
    const supabase = makeSupabase({ decisionRow: { ...PRODUCT_REVIEW_ROW, decision_type: 'kill_gate' } });
    const result = await resolveAndWriteChairmanSiteReviewAttestation(supabase, { decisionId: DECISION_ID, action: 'approved', decidedBy: 'rick@example.com' });
    expect(result.written).toBe(false);
    expect(supabase.__insert).not.toHaveBeenCalled();
  });

  it('the attestations table not yet being applied resolves to written:false, never throws', async () => {
    const supabase = makeSupabase({ decisionRow: PRODUCT_REVIEW_ROW, insertError: { code: 'PGRST205', message: 'schema cache miss' } });
    const result = await resolveAndWriteChairmanSiteReviewAttestation(supabase, { decisionId: DECISION_ID, action: 'approved', decidedBy: 'rick@example.com' });
    expect(result.written).toBe(false);
    expect(result.reason).toContain('not yet applied');
  });

  it('a real DB CHECK-constraint rejection (e.g. DECIDED_BY was never set to a real email) throws loudly rather than being swallowed', async () => {
    const supabase = makeSupabase({
      decisionRow: PRODUCT_REVIEW_ROW,
      insertError: { message: 'new row for relation "venture_gate_attestations" violates check constraint "vga_chairman_review_is_human"' },
    });
    await expect(resolveAndWriteChairmanSiteReviewAttestation(supabase, { decisionId: DECISION_ID, action: 'approved', decidedBy: 'chairman-cli' }))
      .rejects.toThrow('vga_chairman_review_is_human');
  });

  it('a chairman_decisions fetch error throws rather than silently skipping', async () => {
    const supabase = makeSupabase({ decisionFetchError: { message: 'connection refused' } });
    await expect(resolveAndWriteChairmanSiteReviewAttestation(supabase, { decisionId: DECISION_ID, action: 'approved', decidedBy: 'rick@example.com' }))
      .rejects.toThrow('connection refused');
  });
});
