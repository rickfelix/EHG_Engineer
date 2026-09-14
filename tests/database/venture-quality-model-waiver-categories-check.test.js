/**
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B, TS-6.
 *
 * Live probe against venture_quality_findings_finding_category_check confirming
 * feedback_widget_present/error_capture_wired are STILL rejected today (RISK
 * sub-agent finding, 2026-09-13: both categories exist in the code-level
 * FINDING_CATEGORIES array with a live detector, but no applied migration accepts
 * them into the DB CHECK constraint). This SD authors NO migration for this gap --
 * it records the gap as a dated waiver on both dimensions in
 * lib/eva/quality-model/registry.js instead. This test cross-checks the registry's
 * waiver claim against the live constraint, so a future migration that DOES close
 * the gap will fail this test loudly (a stale waiver claiming rejection that the DB
 * no longer performs), prompting the waiver to be removed rather than left stale.
 *
 * Mirrors tests/database/venture-quality-findings-capa-baseline-categories-check.test.js's
 * probe-insert pattern (23514 = check_violation, never a bare "!insertErr").
 */
import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import { getDimension } from '../../lib/eva/quality-model/registry.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const WAIVED_REJECTED_CATEGORIES = ['feedback_widget_present', 'error_capture_wired'];

async function probeInsert(category) {
  const probeVentureId = '00000000-0000-0000-0000-000000000001';
  const probeHash = `capa-001-b-waiver-probe-${category}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { error: insertErr } = await supabase.from('venture_quality_findings').insert({
    venture_id: probeVentureId,
    stage_number: 20,
    finding_category: category,
    severity: 'low',
    finding_hash: probeHash,
    evidence_pointer: { probe: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B/TS-6' },
  });
  await supabase.from('venture_quality_findings').delete().eq('finding_hash', probeHash);
  return { accepted: !insertErr, code: insertErr?.code ?? null, message: insertErr?.message ?? null };
}

describe('SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-B TS-6: waived categories vs. the live DB constraint', () => {
  for (const category of WAIVED_REJECTED_CATEGORIES) {
    it(`'${category}' is rejected (23514) by the live constraint, matching its registry waiver`, async () => {
      const dimension = getDimension(category);
      expect(dimension, `registry has no entry for '${category}'`).toBeTruthy();
      expect(dimension.waiver, `'${category}' should carry a dated waiver recording the DB-constraint gap`).toBeTruthy();

      const r = await probeInsert(category);
      expect(
        r.accepted,
        `'${category}' is expected to still be rejected by the live constraint (matching its registry waiver) -- ` +
        'if this now passes, the constraint gap has been closed and the waiver on this dimension should be removed, not left stale.'
      ).toBe(false);
      expect(r.code, `rejection must be check_violation (23514), not some other failure: got code=${r.code} msg=${r.message}`).toBe('23514');
    });
  }
});
