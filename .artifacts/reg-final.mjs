import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb=createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ROW='1398d843-6e2d-4e02-b67b-1953f8dff8f2';
const {data:prev}=await sb.from('sub_agent_execution_results').select('metadata').eq('id',ROW).single();
const base={files:463,filesPassed:462,filesSkipped:1,tests:6009,passed:5995,failed:0,expectedFail:1,skipped:13};
const head={files:464,filesPassed:463,filesSkipped:1,tests:6027,passed:6013,failed:0,expectedFail:1,skipped:13};
const {error}=await sb.from('sub_agent_execution_results').update({
 verdict:'PASS', confidence:94, updated_at:new Date().toISOString(),
 summary:'PASS — backward compatible. Baseline 9126e8903f2: 5995 passed / 0 failed (6009 total, 463 files). HEAD 9dc277c7168: 6013 passed / 0 failed (6027 total, 464 files). +18 tests, +1 file, zero baseline-passing tests now failing. No exported function signature changed; all 8 touched files have byte-identical export surfaces. DRAIN_SETS shape unchanged (additive string literals only, 4 roles). Migration is inert — no auto-applier exists.',
 justification:'Four independent checks, all measured directly in the worktree rather than inherited from prior sub-agent claims. (1) API SIGNATURES: git diff 9126e8903f2..HEAD across the 8 touched files yields ZERO added-or-removed lines matching function-definition, arrow-function, export or module.exports patterns — buildIdentityMessage, insertCoordinationRow callers, emitOverdueSignal and emitPersistentUnverifiedSignal all keep their parameter lists; every change is an added property inside an existing object literal or a comment. (2) EXPORT SURFACE: per-file md5 of the export/module.exports lines is identical base-vs-HEAD for all 8 files. DRAIN_SETS keeps its Object.freeze({role: Object.freeze([...strings])}) shape; only the VALUES changed, additively, adding the worker_signal literal to solomon/michael/adam/coordinator with no removals, so existing kind lookups are unaffected. (3) BASELINE TESTS: measured by reverting lib/scripts/tests to 9126e8903f2 and moving the branch-new static-guard test aside, running the six suites, then restoring (git diff HEAD confirmed empty afterward). Baseline 5995 passed / 0 failed / 1 expected-fail / 13 skipped over 6009 tests in 463 files. HEAD 6013 passed / 0 failed / 1 expected-fail / 13 skipped over 6027 tests in 464 files. Strictly additive: no baseline-passing test fails at HEAD, skipped and expected-fail counts unchanged. (4) MIGRATION INERTNESS: no CI workflow applies migrations. The sole apply path is scripts/apply-migration.js, which requires an explicit file path plus --prod-deploy behind a 3-factor guard (single-use 1h MIGRATION_APPLY_TOKEN or chairman authorization); there is no apply-all-pending runner. schema-drift-guard.yml only runs a read-only supabase db diff. The migration therefore stays inert until explicitly approved.',
 conditions:[],
 recommendations:[
  'Advisory (not a regression): .github/workflows/migration-deploy-drift-guard.yml emits ::error:: for RECENT committed-but-unapplied migrations, so 20260906_role_drain_sets_add_worker_signal.sql will trip that guard on CI until it is either applied via the chairman-gated apply-migration.js --prod-deploy path or given an explicit disposition. This is the intended ceremony pressure, not a defect introduced by this SD.',
  'The runtime worker_signal drain behavior is code-side (lib/fleet/worker-status.cjs DRAIN_SETS) and does not depend on the pending migration, so the PENDING state creates no runtime gap — the migration only reconciles the role_drain_sets table to match code.'
 ],
 warnings:[],
 critical_issues:[],
 metadata:{...(prev?.metadata||{}), provisional:false, finalized_at:new Date().toISOString(),
   baseline_commit:'9126e8903f2', head_commit:'9dc277c7168',
   test_baseline:base, test_after:head,
   test_delta:{files:+1,tests:+18,passed:+18,failed:0},
   suites:['tests/unit/fleet/','tests/unit/coordinator/','tests/unit/coordination/','tests/unit/periodic-liveness/','tests/unit/governance/','tests/static-guards/'],
   api_signature_changes:0, export_surface_changes:0, files_analyzed:8,
   drain_sets_shape_unchanged:true, drain_sets_roles_extended:['solomon','michael','adam','coordinator'],
   migration_auto_apply_risk:'NONE — no apply-all-pending runner; apply-migration.js requires explicit path + --prod-deploy 3-factor guard',
   worktree_restored_clean:true}
}).eq('id',ROW);
if(error){console.error('UPDATE FAIL',error);process.exit(1);}
console.log('FINALIZED row',ROW,'verdict=PASS');
