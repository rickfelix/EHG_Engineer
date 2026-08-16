// Final LEAD-phase gate fixes for SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001: mechanism
// verifications (GATE_MECHANISM_CLAIM_VERIFIER), dependencies (GATE_SD_QUALITY /
// JSONB_FIELDS_INCOMPLETE), and real key_principles/strategic_objectives replacing the
// /leo create template placeholders.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';

const { data: sd, error: fetchErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', SD_KEY)
  .maybeSingle();
if (fetchErr) throw fetchErr;

const verified_at = new Date().toISOString();
const mechanism_verifications = [
  {
    claim: 'scripts/audit-rpc-execute-grants.mjs only checks authenticated EXECUTE, has no anon/PUBLIC dimension',
    verified_by: 'direct Read of the file this session',
    verified_at: 'scripts/audit-rpc-execute-grants.mjs:82 (has_function_privilege call names authenticated only, no anon/public equivalent anywhere in the file)',
  },
  {
    claim: '20260728_revoke_public_execute_role_flag_rpcs.sql (commit 13d02e18d81) revokes FROM PUBLIC, anon, authenticated for its 4 functions and ships a paired _DOWN.sql',
    verified_by: 'git show 13d02e18d81 this session',
    verified_at: 'database/migrations/20260728_revoke_public_execute_role_flag_rpcs.sql (commit 13d02e18d81, not merged to main)',
  },
  {
    claim: 'fn_stage_artifact_precondition has a direct .rpc() caller in scripts/harness/s20-fixture.mjs, contradicting the "called only by SECDEF fn" label',
    verified_by: 'direct Read of the file this session',
    verified_at: 'scripts/harness/s20-fixture.mjs:219 (const { data: precondition } = await supabase.rpc(\'fn_stage_artifact_precondition\', ...))',
  },
  {
    claim: 'scripts/lint/rls-anon-tenant-predicate-lint.mjs steers policy authors toward fn_user_has_company_access() as an auth-binding primitive',
    verified_by: 'direct Read of the file this session',
    verified_at: 'scripts/lint/rls-anon-tenant-predicate-lint.mjs:207 (unbound_tenant_predicate message template names fn_user_has_company_access())',
  },
  {
    claim: 'The repo convention for a chairman-gated permission migration includes a paired _rollback.sql file',
    verified_by: 'directory listing this session',
    verified_at: 'database/migrations/20260602_pin_search_path_security_definer_functions_rollback.sql (existing paired-rollback example)',
  },
  {
    claim: 'fn_write_kill_audit_trail (Bucket A) currently carries an explicit PUBLIC grant, confirming the no-op risk for a REVOKE that omits PUBLIC',
    verified_by: 'live has_function_privilege query this session, via supabase.rpc(\'exec_sql\', {sql_text})',
    verified_at: 'live catalog query, pg_proc/pg_namespace, 2026-08-15 (public_exec=true measured directly)',
  },
];

const key_principles = [
  'Never revoke based on inference — every function\'s bucket assignment must trace to a specific, cited caller-scan dimension (app .rpc() call site, RLS policy body, function body, trigger, or view definition), not "looks unused"',
  'PUBLIC must be included in every REVOKE and in the ALTER DEFAULT PRIVILEGES scope — anon/authenticated inherit PUBLIC\'s grant, so omitting it silently no-ops the fix (C1/C2 corrections)',
  'The verifier must be able to observe the actual change being made — a regression check that only watches the axis the migration does NOT touch (authenticated) proves nothing about the axis it does (anon)',
  'Permission changes are non-delegable and stay on the chairman 3-factor --prod-deploy path — EXEC authors and verifies, never applies',
  'A one-shot chairman-ceremony apply requires a paired rollback authored from a freshly-captured pre-apply ACL baseline, not written from memory after the fact',
];

const strategic_objectives = [
  'Close the anon/PUBLIC EXECUTE exposure on the verified residual (Bucket A\'s 6 + Bucket B\'s currently-anon-exposed subset, re-measured at PLAN/EXEC time) without breaking any authenticated app workflow',
  'Fix the two mechanism defects found at LEAD (PUBLIC omitted from REVOKE/ADP scope) before any SQL is authored, so the migration actually achieves its stated goal rather than appearing to on paper',
  'Extend the regression verifier so it can observe the anon axis — the actual security fix — rather than only the authenticated axis it currently checks',
  'Convert this from a one-time cleanup into a durable guard: ALTER DEFAULT PRIVILEGES scoped correctly, plus a CI-parseable standing check for future SECURITY DEFINER functions',
  'Preserve the deliberate exclusions (Bucket C\'s 9 functions, the SMS webhook, anon-facing-policy-backed helpers) — a security fix that breaks a working integration is not a net improvement',
];

const dependencies = [
  {
    dependency: '20260728_revoke_public_execute_role_flag_rpcs.sql (commit 13d02e18d81)',
    type: 'precedent (not blocking)',
    note: 'Predecessor migration for the same exposure class. Exists on an unmerged branch (fix/role-flag-execute-revoke), not main — its "applied 2026-07-28" claim could not be independently confirmed via live grant probing this session without risking a mutation of live coordinator/solomon election state. Establishes the correct REVOKE pattern (FROM PUBLIC, anon, authenticated) this SD\'s original description incorrectly omitted PUBLIC from.',
  },
  {
    dependency: 'scripts/audit-rpc-execute-grants.mjs',
    type: 'tooling (must be extended, not blocking)',
    note: 'Existing regression guard for the authenticated axis. This SD must extend it (or add a companion) to cover anon/PUBLIC before the migration can be verified as working.',
  },
];

const { error: updateErr } = await supabase
  .from('strategic_directives_v2')
  .update({
    key_principles,
    strategic_objectives,
    dependencies,
    metadata: { ...sd.metadata, mechanism_verifications },
  })
  .eq('id', sd.id);
if (updateErr) throw updateErr;
console.log('Finalized: mechanism_verifications (6), key_principles (5), strategic_objectives (5), dependencies (2).');
