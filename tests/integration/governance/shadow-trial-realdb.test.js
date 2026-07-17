/**
 * Real-DB integration: shadow-trial child A CEREMONY_PENDING liveness.
 * SD-LEO-INFRA-SHADOW-TRIAL-RATIFICATION-001-A (FR-5, risk 93c8ed1d R1: the mocked-seam
 * trap — unit stubs alone would green-mask a broken live seam).
 *
 * READ-ONLY by design: this test never inserts chairman_decisions rows or proposals into
 * the shared DB (that would put noise on the chairman's decision surface). It proves the
 * live seam end-to-end up to the write boundary: the probe runs against the REAL PostgREST
 * error surface and must classify the pre-ceremony state correctly.
 *
 * Guarded: skips entirely without real-DB credentials (CI unit lanes stay hermetic).
 */

import { describe, test, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { stageProposal, TABLE } from '../../../lib/governance/shadow-trial/proposal-writer.mjs';

const HAS_REAL_DB = !!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

describe.skipIf(!HAS_REAL_DB)('shadow-trial child A — real-DB seam', () => {
  const supabase = HAS_REAL_DB
    ? createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

  test('dry staging against the real DB classifies the table state correctly (never a crash)', async () => {
    const res = await stageProposal(supabase, {
      artifact_class: 'closure_predicates',
      target_ref: 'realdb-liveness-probe',
      current_hash: 'probe',
      proposed_diff: 'probe',
      proposer: 'realdb-test',
      provenance: 'shadow-trial-realdb.test.js',
      rationale: 'liveness probe — dry, never written',
    }, { dry: true });

    // Pre-ceremony: { staged:false, ceremony_pending:true }. Post-ceremony: { staged:false, dry:true }.
    // Either is a healthy live seam; anything else (throw / error) is the trap this test exists to catch.
    expect(res.staged).toBe(false);
    expect(res.ceremony_pending === true || res.dry === true).toBe(true);
    expect(res.error).toBeUndefined();
  });

  test(`real PostgREST error shape for missing ${TABLE} is classified as ceremony-pending (pre-ceremony only)`, async () => {
    const probe = await supabase.from(TABLE).select('id').limit(1);
    if (!probe.error) {
      // Ceremony already performed — table exists; nothing to classify.
      expect(Array.isArray(probe.data)).toBe(true);
      return;
    }
    const { isMissingTableError } = await import('../../../lib/governance/shadow-trial/proposal-writer.mjs');
    expect(isMissingTableError(probe.error)).toBe(true);
  });
});
