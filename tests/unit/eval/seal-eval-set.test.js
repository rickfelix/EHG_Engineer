/**
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-B — seal-writer CLI core (TS-1):
 * dry-run writes nothing; --apply is content-hash idempotent; CEREMONY_PENDING
 * soft-fail on missing table.
 */
import { describe, it, expect } from 'vitest';
import { sealEvalSet } from '../../../scripts/eval/seal-eval-set.mjs';
import { EVAL_SET_CORPORA } from '../../../lib/eval/eval-set-fixtures.mjs';
import { evalCaseHash } from '../../../lib/eval/eval-set-loader.mjs';

/**
 * Stub with insert tracking; existing seals injectable per test.
 * governed_change_proposals defaults to MISSING TABLE (pre-ceremony live state) so
 * the child-C self-reference guard warn-and-proceeds; pass `proposals` to simulate
 * the post-ceremony table (guard then requires a staged row).
 */
function stubDb({ existingHashes = [], readError = null, proposals = undefined, guardError = null } = {}) {
  const inserts = { feedback: [], system_events: [] };
  const MISSING = { code: 'PGRST205', message: "Could not find the table 'public.governed_change_proposals' in the schema cache" };
  return {
    inserts,
    from(table) {
      const result = table === 'governed_change_proposals'
        ? (guardError ? { data: null, error: guardError }
           : proposals === undefined ? { data: null, error: MISSING } : { data: proposals, error: null })
        : (readError
            ? { data: null, error: readError }
            : { data: existingHashes.map((h) => ({ id: `x-${h}`, metadata: { content_hash: h } })), error: null });
      const thenable = { then: (resolve) => resolve(result), limit: () => Promise.resolve(result) };
      return {
        select: () => ({ eq: () => thenable }),
        insert(row) {
          inserts[table].push(row);
          return {
            select: async () => ({ data: [{ id: `${table}-${inserts[table].length}` }], error: null }),
            then: (resolve) => resolve({ data: null, error: null }), // system_events insert awaited bare
          };
        },
      };
    },
  };
}

const silent = () => {};

describe('sealEvalSet (TS-1)', () => {
  it('dry-run (default) performs zero writes and reports the plan', async () => {
    const db = stubDb();
    const r = await sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', log: silent });
    expect(r.applied).toBe(false);
    expect(r.planned).toBe(4);
    expect(db.inserts.feedback).toHaveLength(0);
    expect(db.inserts.system_events).toHaveLength(0);
  });

  it('--apply seals every case with metadata carrying content_hash + synthetic + case payload', async () => {
    const db = stubDb();
    const r = await sealEvalSet({ supabase: db, artifactClass: 'leo_protocol_sections', apply: true, log: silent });
    expect(r.sealed).toBe(5);
    expect(db.inserts.feedback).toHaveLength(5);
    expect(db.inserts.system_events).toHaveLength(5);
    const first = db.inserts.feedback[0];
    expect(first.metadata.record_kind).toBe('eval_case');
    expect(first.metadata.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.metadata.case.case_id).toBe(first.metadata.case_id);
    expect(first.feedback_type).toBe('user_other'); // honest nearest-fit, not the sentry_error cargo cult
    const syntheticFlags = db.inserts.feedback.map((f) => f.metadata.synthetic);
    expect(syntheticFlags.filter(Boolean)).toHaveLength(3); // PS-003..PS-005 labeled
  });

  it('second --apply run seals 0 (content-hash idempotency)', async () => {
    const allHashes = EVAL_SET_CORPORA.closure_predicates.map(evalCaseHash);
    const db = stubDb({ existingHashes: allHashes });
    const r = await sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', apply: true, log: silent });
    expect(r.sealed).toBe(0);
    expect(r.skipped).toBe(4);
    expect(db.inserts.feedback).toHaveLength(0);
  });

  it('CEREMONY_PENDING soft-fail when the table is missing', async () => {
    const db = stubDb({ readError: { code: 'PGRST205', message: "Could not find the table 'public.feedback' in the schema cache" } });
    const r = await sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', apply: true, log: silent });
    expect(r.ceremonyPending).toBe(true);
    expect(r.sealed).toBe(0);
  });

  it('rejects unknown classes', async () => {
    await expect(sealEvalSet({ supabase: stubDb(), artifactClass: 'nope', log: silent })).rejects.toThrow(/unknown artifact class/);
  });
});

describe('self-reference guard (child C FR-4)', () => {
  it('pre-ceremony (proposals table missing): warns and proceeds', async () => {
    const db = stubDb(); // governed_change_proposals defaults to MISSING
    const r = await sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', apply: true, log: silent });
    expect(r.applied).toBe(true);
    expect(r.sealed).toBe(4);
  });

  it('post-ceremony with a CONTENT-BOUND staged proposal: seal authorized (M1)', async () => {
    const boundHash = evalCaseHash(EVAL_SET_CORPORA.closure_predicates[0]);
    const db = stubDb({ proposals: [{ id: 'gp-1', status: 'staged', proposed_diff: `corpus reseal covering ${boundHash}` }] });
    const r = await sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', apply: true, log: silent });
    expect(r.applied).toBe(true);
  });

  it('post-ceremony: a stale/unrelated staged proposal does NOT authorize (M1 content binding)', async () => {
    const db = stubDb({ proposals: [{ id: 'gp-old', status: 'staged', proposed_diff: 'some unrelated earlier change' }] });
    await expect(sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', apply: true, log: silent }))
      .rejects.toThrow(/SELF-REFERENCE GUARD/);
  });

  it('generic (non-missing-table) probe error FAILS CLOSED (M2)', async () => {
    const db = stubDb({ guardError: { code: '42501', message: 'permission denied' } });
    await expect(sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', apply: true, log: silent }))
      .rejects.toThrow(/fail-closed/);
    expect(db.inserts.feedback).toHaveLength(0);
  });

  it('post-ceremony with NO staged proposal: seal refused', async () => {
    const db = stubDb({ proposals: [] });
    await expect(sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', apply: true, log: silent }))
      .rejects.toThrow(/SELF-REFERENCE GUARD/);
    expect(db.inserts.feedback).toHaveLength(0);
  });

  it('dry-run never consults the guard (no writes to authorize)', async () => {
    const db = stubDb({ proposals: [] });
    const r = await sealEvalSet({ supabase: db, artifactClass: 'closure_predicates', log: silent });
    expect(r.applied).toBe(false);
  });
});
