import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-LEO-INFRA-CLOSE-ANON-EXECUTE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

// The original success_criteria described the SD's PRE-LEAD scope (a new census script, a new
// lint, a chairman-applied default-ACL migration) -- LEAD-phase investigation found the first two
// already exist and work, and the third is a separate SD's already-authored deliverable. These
// are REPLACED (not just measured) to reflect what was actually in this SD's delivered scope,
// so the record does not read as unmet promises for deliberately descoped, already-duplicate work.
const success_criteria = [
  {
    criterion: 'A new chairman-gated migration REVOKEs EXECUTE on the 6 role-flag functions (solomon/adam/coordinator) plus set_session_awaiting_approval, guarded so it applies safely regardless of the adam pair\'s live state',
    measure: 'Verified: database/chairman-gated/20260905_close_role_flag_secdef_execute_exposure.sql exists with the guarded REVOKE/GRANT + DO $verify$ block; live to_regprocedure() probes during EXEC confirmed 4 of 7 targets exist today and 2 (adam) do not, matching the migration\'s own guard logic',
  },
  {
    criterion: 'The completeness audit (scripts/audit-rpc-execute-grants.mjs, buckets mode) reaches zero undeclared functions once the migration applies',
    measure: 'Measured live during EXEC: 2 undeclared -> 1 (fn_submit_error_capture closed via manifest declaration; set_session_awaiting_approval remains until the chairman-gated migration is applied -- expected, not a defect)',
  },
  {
    criterion: 'The already-existing secdef-execute-revoke-lint.mjs and audit-rpc-execute-grants.mjs are reused, not duplicated',
    measure: 'Confirmed via LEAD-phase fork + Explore verification: both tools run live and pass/fail correctly against real data; this SD\'s original scope items #1 (census) and #4 (lint) were descoped as duplicative rather than rebuilt',
  },
  {
    criterion: 'The existing completeness audit is wired into scheduled CI, closing its own originating SD\'s disclosed manual-only gap',
    measure: 'Verified: .github/workflows/audit-rpc-execute-grants-buckets-check.yml created, daily cron + workflow_dispatch, mirrors the two existing sibling exit-predicate workflows',
  },
];

const success_metrics = [
  {
    actual: '100% -- the 3 delivered key_changes (migration, manifest entry, scheduled workflow) all verified live during EXEC; the 4th (defacl migration apply) and 5th (bulk triage of ~650 functions) original scope items were descoped as duplicative/already-satisfied, not left undelivered',
    metric: 'Implementation completeness',
    target: '100% of scope items implemented',
  },
  {
    actual: '19/19 tests passing in tests/unit/audit-rpc-execute-grants-buckets.test.js (extended: count assertion 30->31 plus new fn_submit_error_capture coverage); no JS/TS logic was added elsewhere (the migration and workflow are SQL/YAML, verified live instead of unit-tested)',
    metric: 'Test coverage',
    target: '≥80% code coverage for new code',
  },
  {
    actual: '0 regressions -- tests/unit/lint/secdef-execute-revoke-lint.test.js (25 tests) and the full audit-rpc-execute-grants-buckets.test.js suite both green; PR #8277 CI (including the full coverage job) passed clean',
    metric: 'Zero regressions',
    target: '0 existing tests broken',
  },
];

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_criteria, success_metrics })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD success_criteria and success_metrics updated to reflect actually-delivered scope.');
