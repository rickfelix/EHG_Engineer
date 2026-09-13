/**
 * venture_quality_findings_finding_category_check set-containment regression test
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A (TS-2)
 *
 * Verifies database/migrations/20260913_venture_quality_findings_capa_baseline_categories.sql:
 *   - every category the live constraint accepted BEFORE this migration still
 *     validates AFTER it (additive-only, no regression)
 *   - exactly {accessibility, performance, responsive} are newly accepted
 *
 * Deliberately a SET-CONTAINMENT check, not a hardcoded count: TESTING (PLAN
 * phase) found a hardcoded "12 pre-existing values" claim was wrong on all
 * three fronts (code array=15, migration-file lineage=13, live DB=10) and
 * a length-only assertion can't catch EXEC copying the wrong source list.
 *
 * Approach: introspect pg_constraint.conbindef via exec_sql_readonly (mirrors
 * tests/database/model-usage-log-phase-check.test.js), falling back to probe
 * inserts when that RPC isn't available in this test environment.
 */

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// The 10 base categories that predate this migration -- must remain accepted
// (regression check). NOT the full FINDING_CATEGORIES code array, which also
// includes feedback_widget_present/error_capture_wired/usability/
// journey_coherence -- those were added by other migrations/SDs and are out
// of this test's scope.
const PRE_EXISTING_CATEGORIES = [
  'npm_audit', 'secrets', 'lint', 'test_suite',
  'unit_test', 'e2e_test',
  'uat_test', 'bug_report', 'uat_signoff',
  'capability',
];

const NEWLY_ADDED_CATEGORIES = ['accessibility', 'performance', 'responsive'];

function extractInListValues(constraintDef) {
  const match = constraintDef.match(/IN\s*\(([^)]+)\)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''));
}

// TESTING sub-agent finding (PLAN-phase re-verification): a bare `!insertErr`
// doesn't discriminate WHY an insert failed -- an RLS denial or a missing
// required column would read identically to a genuine CHECK-constraint
// rejection, so the "still rejects an invented category" test could pass
// vacuously even with the constraint dropped entirely. Postgres error code
// 23514 is specifically check_violation; assert on that, not just "any error".
async function probeInsert(category) {
  const probeVentureId = '00000000-0000-0000-0000-000000000001';
  const probeHash = `capa-001-a-probe-${category}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const { error: insertErr } = await supabase.from('venture_quality_findings').insert({
    venture_id: probeVentureId,
    stage_number: 20,
    finding_category: category,
    severity: 'low',
    finding_hash: probeHash,
    evidence_pointer: { probe: 'SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A/TS-2' },
  });
  await supabase.from('venture_quality_findings').delete().eq('finding_hash', probeHash);
  return { accepted: !insertErr, code: insertErr?.code ?? null, message: insertErr?.message ?? null };
}

describe('venture_quality_findings_finding_category_check (SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-A, TS-2)', () => {
  it('accepts every pre-existing category AND the 3 newly added categories (set containment)', async () => {
    let acceptedValues = null;

    try {
      const { data, error } = await supabase.rpc('exec_sql_readonly', {
        sql: `SELECT pg_get_constraintdef(c.oid) AS def
              FROM pg_constraint c
              JOIN pg_class t ON t.oid = c.conrelid
              WHERE t.relname = 'venture_quality_findings'
                AND c.conname = 'venture_quality_findings_finding_category_check'`,
      });
      if (!error && data?.[0]?.def) {
        acceptedValues = extractInListValues(data[0].def);
      }
    } catch {
      // fall through to probe-insert path below
    }

    if (acceptedValues) {
      for (const cat of PRE_EXISTING_CATEGORIES) {
        expect(acceptedValues, `pre-existing category '${cat}' must remain accepted (regression)`).toContain(cat);
      }
      for (const cat of NEWLY_ADDED_CATEGORIES) {
        expect(acceptedValues, `newly added category '${cat}' must be accepted`).toContain(cat);
      }
      return;
    }

    // Fallback: exec_sql_readonly RPC unavailable in this environment -- probe
    // each category with a real insert/delete pair against the CHECK constraint.
    for (const cat of PRE_EXISTING_CATEGORIES) {
      const r = await probeInsert(cat);
      expect(r.accepted, `pre-existing category '${cat}' should not raise 23514 (regression); got code=${r.code} msg=${r.message}`).toBe(true);
    }
    for (const cat of NEWLY_ADDED_CATEGORIES) {
      const r = await probeInsert(cat);
      expect(r.accepted, `newly added category '${cat}' should not raise 23514; got code=${r.code} msg=${r.message}`).toBe(true);
    }
  });

  it('still rejects a category outside both the pre-existing and newly added sets, specifically via the CHECK constraint (23514)', async () => {
    const r = await probeInsert('not-a-real-category');
    expect(r.accepted, 'an invented category must still be rejected by the CHECK constraint').toBe(false);
    expect(r.code, `rejection must be check_violation (23514), not some other failure (e.g. RLS): got code=${r.code} msg=${r.message}`).toBe('23514');
  });
});
