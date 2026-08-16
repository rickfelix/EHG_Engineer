#!/usr/bin/env node
// LEAD-phase gate remediation for SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001.
// Fixes GATE_MECHANISM_CLAIM_VERIFIER (cites the live independent verification run at
// scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs), GATE_SD_METRICS_SUFFICIENCY
// and GATE_VERIFIER_PARITY_PRECHECK (adds a 2nd strategic_objective + 3rd success_metric).
// Idempotent: exits 0 if mechanism_verifications is already populated.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata, strategic_objectives, success_metrics')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ ERR:', readErr.message); process.exit(1); }

if (Array.isArray(sd.metadata?.mechanism_verifications) && sd.metadata.mechanism_verifications.length) {
  console.log('ALREADY PRESENT:', JSON.stringify(sd.metadata.mechanism_verifications));
  process.exit(0);
}

const mechanism_verifications = [
  {
    verified_by: 'Bravo (worker session 698520e6-7b16-46b5-a207-42548fe6a180)',
    verified_at: 'scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs:28,33,37',
    claim:
      'pg_default_acl rows for functions in schema public (creator roles postgres AND supabase_admin) grant EXECUTE to anon and authenticated BY NAME, with no literal-PUBLIC grantee entry — so a REVOKE EXECUTE ... FROM PUBLIC-only ADP is a structural no-op on this axis. Live census: 145 SECDEF fns, 28 anon-EXEC, 41 authenticated-EXEC, 18 literal-PUBLIC. fn_submit_venture_user_feedback currently anon-EXEC=true (binding KEEP constraint).',
    method:
      'Wrote and ran an independent verification script against the live catalog via supabase.rpc(\'exec_sql\', {sql_text}) (service-role REST path; the direct pooler connection failed with "password authentication failed for user postgres", matching the credential-broken finding already on record at scripts/one-off/lead-correct-scan-findings-close-remaining-security-001.mjs:98-102). Query at :28 returns raw_acl="{postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}" for (postgres,public) and "{postgres=X/supabase_admin,anon=X/supabase_admin,authenticated=X/supabase_admin,service_role=X/supabase_admin}" for (supabase_admin,public) — both by-name, zero literal-PUBLIC entries (a literal-PUBLIC entry would render as a bare "=X/<owner>" with no rolename). Census query at :33 returned {total_secdef:145, anon_exec:28, authenticated_exec:41, literal_public:18}, exactly matching the proposal\'s inherited census — not stale. Keep-check query at :37 confirmed fn_submit_venture_user_feedback anon_exec=true today, grounding the binding constraint the coordinator_review_reason requires this SD to preserve.',
  },
];

const { error: metaErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata: { ...(sd.metadata || {}), mechanism_verifications } })
  .eq('id', sd.id);
if (metaErr) { console.error('METADATA UPDATE ERR:', metaErr.message); process.exit(1); }
console.log('WROTE', mechanism_verifications.length, 'mechanism verification(s)');

const strategic_objectives = [
  ...(Array.isArray(sd.strategic_objectives) ? sd.strategic_objectives : []),
  {
    objective: 'Shrink the live anon/authenticated-EXEC surface to a documented KEEP set via evidence-based triage, not a blind bulk revoke',
    metric: 'REVOKE set = (28 anon-EXEC ∪ 41 authenticated-EXEC) minus KEEP list; every KEEP entry has a recorded caller in the SD evidence',
  },
];
const { error: objErr } = await supabase
  .from('strategic_directives_v2')
  .update({ strategic_objectives })
  .eq('id', sd.id);
if (objErr) { console.error('OBJECTIVES UPDATE ERR:', objErr.message); process.exit(1); }
console.log('strategic_objectives now:', strategic_objectives.length);

const success_metrics = [
  ...(Array.isArray(sd.success_metrics) ? sd.success_metrics : []),
  {
    metric: 'Literal PUBLIC aclitems on SECURITY DEFINER functions in public',
    target: '0 (was 18)',
  },
];
const { error: metErr } = await supabase
  .from('strategic_directives_v2')
  .update({ success_metrics })
  .eq('id', sd.id);
if (metErr) { console.error('METRICS UPDATE ERR:', metErr.message); process.exit(1); }
console.log('success_metrics now:', success_metrics.length);
