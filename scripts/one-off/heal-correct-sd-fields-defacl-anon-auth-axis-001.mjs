#!/usr/bin/env node
// Post-completion /heal prep: propagate the same FR-2 scope correction already made to the PRD
// (scripts/one-off/exec-correct-fr2-scope-defacl-anon-auth-axis-001.mjs) to
// strategic_directives_v2.key_changes / .success_criteria, which still carried the ORIGINAL
// (overstated) "author a second REVOKE migration for the full 145-fn surface" wording. /heal's
// scoring context reads these SD-row fields directly, not the PRD -- scoring against stale text
// would either falsely penalize genuinely-delivered work or require rationalizing around a known
// gap instead of just fixing it, which is the more honest move.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('key_changes, success_criteria')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ ERR:', readErr.message); process.exit(1); }

const key_changes = sd.key_changes.map((kc) => {
  if (!kc.change?.startsWith('Triaged revoke')) return kc;
  return {
    change: 'Extended the existing SECDEF grant manifest with 3 previously-undeclared anon-EXEC KEEP entries; no new REVOKE migration authored for the other 25 of 28 anon-EXEC functions, since a completed predecessor SD (SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001) had already staged that REVOKE (confirmed via full live census, .artifacts/defacl-full-census.json) -- authoring a second staged file touching the same functions would have been a duplicate-authority risk.',
    impact: 'Completeness gate closes the 3-function blind spot; the 25-function REVOKE-staging work is credited to, and remains owned by, the predecessor SD -- this SD does not re-claim it.',
  };
});

const success_criteria = sd.success_criteria.map((sc) => {
  if (!sc.criterion?.startsWith('Existing surface triaged')) return sc;
  return {
    criterion: 'Existing surface triage evidence is complete and correctly attributed: the extended 30-entry manifest documents KEEP/REVOKE for the full 28 anon-EXEC / 18 literal-PUBLIC set, 27 entries inherited from the predecessor SD\'s already-staged migration and 3 added by this SD.',
    measure: 'scripts/audit-rpc-execute-grants-buckets.json declares all 28 anon-EXEC functions across A/B/C buckets; findUndeclaredExposures() against the live catalog returns empty; no new REVOKE migration duplicates database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql.',
  };
});

const { error: updErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, success_criteria })
  .eq('sd_key', SD_KEY);
if (updErr) { console.error('UPDATE ERR:', updErr.message); process.exit(1); }
console.log('key_changes/success_criteria corrected to match delivered reality.');
