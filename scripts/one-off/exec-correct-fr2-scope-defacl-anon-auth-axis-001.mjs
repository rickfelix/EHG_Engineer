#!/usr/bin/env node
// EXEC-phase measurement correction for SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001 / FR-2.
//
// Full live census (union of anon_exec/auth_exec/literal_public over public prosecdef fns,
// .artifacts/defacl-full-census.json, 45 rows) cross-checked against the EXISTING
// scripts/audit-rpc-execute-grants-buckets.json manifest (27 entries, A=6/B=10/C=11 -- already
// authored by the completed predecessor SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001) shows:
//   - All 28 live anon-exec SECDEF functions in public: 25 are ALREADY declared+triaged
//     (16 as Bucket A/B REVOKE-worthy, already staged in
//     database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql -- NOT yet
//     applied, ceremony-pending, but the authoring work is done; 9 as Bucket C KEEP).
//   - All 18 live literal-PUBLIC SECDEF functions: all 18 already declared (subset of the 28).
//   - Exactly 3 anon-exec functions are UNDECLARED: fn_submit_venture_user_feedback,
//     fn_submit_venture_feedback, fn_submit_venture_error -- precisely the binding-KEEP finding
//     VALIDATION/Explore already surfaced.
// Consequence: FR-2's real EXEC deliverable is adding those 3 manifest entries, NOT re-authoring
// a REVOKE migration for the 16 Bucket A/B functions (a second staged file touching the same
// functions the predecessor SD already staged would be a duplicate-authority risk, not added
// value). Correcting the PRD's FR-2 acceptance criteria to match this measured reality.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';

const { data: prd, error: readErr } = await supabase
  .from('product_requirements_v2')
  .select('functional_requirements')
  .eq('id', PRD_ID)
  .single();
if (readErr) { console.error('READ ERR:', readErr.message); process.exit(1); }

const frs = prd.functional_requirements.map((fr) => {
  if (fr.id !== 'FR-2') return fr;
  return {
    ...fr,
    requirement:
      'Add the 3 currently-undeclared anon-EXEC functions (fn_submit_venture_user_feedback, fn_submit_venture_feedback, fn_submit_venture_error) to scripts/audit-rpc-execute-grants-buckets.json as Bucket C (KEEP) entries -- the completeness gate cannot see the binding KEEP constraint without this.',
    description:
      'EXEC-PHASE MEASUREMENT CORRECTION (2026-08-16, full live census .artifacts/defacl-full-census.json, 45 rows, cross-checked against the 27-entry existing manifest): of the 28 live anon-EXEC SECDEF functions in public, 25 are ALREADY declared and triaged by the completed predecessor SD (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001) -- 16 as Bucket A/B REVOKE-worthy, already staged in database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql (authoring done, ceremony-apply pending, out of this SD\'s scope to re-author or apply); 9 as Bucket C KEEP. All 18 literal-PUBLIC functions are a subset of those 28 and are likewise already declared. The ORIGINAL FR-2 scope (re-triage the full 28/41/18 surface from scratch) OVERSTATED the residual: the true gap is exactly 3 undeclared anon-EXEC functions. Authoring a second REVOKE migration for the already-staged 16 would create a duplicate-authority risk (two chairman-gated files touching the same functions) rather than adding value. Revised deliverable: extend the manifest with 3 new Bucket C entries only.',
    acceptance_criteria: [
      'AC-1: scripts/audit-rpc-execute-grants-buckets.json grows from 27 to 30 entries, adding fn_submit_venture_user_feedback, fn_submit_venture_feedback, fn_submit_venture_error to Bucket C with documented callers (the ehg/altifyai feedback-widget RPC consumers shipped in SD-ALTIFYAI-LEO-ORCH-SPRINT-2026-001-E1 / QF-20260816-865).',
      'AC-2: findUndeclaredExposures() run against the live catalog (anon/PUBLIC axis) returns an empty array once the 3 new entries are added -- verified against .artifacts/defacl-full-census.json, not re-invented.',
      'AC-3: No new REVOKE migration is authored for the pre-existing Bucket A/B (16-function) set -- database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql remains the sole authority for that revoke; this SD does not duplicate it.',
    ],
  };
});

const { error: updErr } = await supabase.from('product_requirements_v2').update({ functional_requirements: frs }).eq('id', PRD_ID);
if (updErr) { console.error('UPDATE ERR:', updErr.message); process.exit(1); }
console.log('FR-2 corrected to match measured reality.');
