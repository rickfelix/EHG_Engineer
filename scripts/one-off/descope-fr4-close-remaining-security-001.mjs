// Marks FR-4 (ALTER DEFAULT PRIVILEGES recurrence control) as descoped on the PRD, with the
// EXEC-phase-corrected rationale (this is a real, active production issue -- not a CI-fixture
// artifact, as an earlier hypothesis wrongly claimed). Written for explicit LEAD review at
// PLAN-TO-LEAD / LEAD-FINAL-APPROVAL -- see database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql
// header for the full investigation trail (3 independent fix attempts, all failed identically).
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const PRD_ID = 'PRD-SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001';

const { data: current, error: fetchErr } = await supabase.from('product_requirements_v2')
  .select('functional_requirements, metadata').eq('id', PRD_ID).maybeSingle();
if (fetchErr) throw fetchErr;
if (!current) throw new Error(`No PRD found for id=${PRD_ID}`);

const fr = current.functional_requirements.map((item) => {
  if (item.id !== 'FR-4') return item;
  return {
    ...item,
    status: 'descoped',
    description: `${item.description}\n\nDESCOPED AT EXEC-TO-PLAN (2026-08-16): three independent, evidence-targeted fix attempts (seed REVOKE-then-GRANT reorder, aclexplode-based self-test redesign, owner-entry seed GRANT to postgres/anon/authenticated) all failed identically against the real CI Postgres environment -- the ADP statement could not be made to hold. Root cause, confirmed by BOTH the SECURITY and TESTING sub-agents independently re-measuring live production: this is NOT a CI-fixture artifact (an earlier hypothesis explicitly retracted after measurement) -- production shows the identical behavior TODAY (636/759 = 84% of public-schema SECURITY DEFINER functions are currently PUBLIC-executable, actively ongoing, new functions continuing to arrive that way). The leak enters DOWNSTREAM of the default ACL mechanism this FR targets, not from an ineffective REVOKE statement -- the ADP row itself is already PUBLIC-free, yet functions still arrive PUBLIC-executable. A concrete, unverified lead was identified: database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19 contains a blanket GRANT ... TO anon, authenticated, PUBLIC loop. The ADP statement and its self-test were removed from the migration pair entirely (0 executable ADP statements remain) rather than shipped unverified. Two independent recurrence controls remain in place regardless of this descope: FR-6 (lint, blocks new non-compliant functions at PR time) and scripts/audit-rpc-execute-grants.mjs's completeness gate (currently a manual npm script only, not wired into CI). Follow-up SD/QF needed: (a) a dedicated minimal harness to isolate the downstream-PUBLIC-leak mechanism (one ADP statement + one CREATE FUNCTION + read proacl, isolated from the 27-stub shared test container, per TESTING's recommendation) starting from the June-2026 rollback script lead; (b) wire the completeness gate into CI.`,
  };
});

const metadata = {
  ...(current.metadata || {}),
  fr4_descope: {
    descoped: true,
    descoped_at: '2026-08-16',
    descoped_at_phase: 'EXEC-TO-PLAN',
    reason: 'Three independent fix attempts against real CI Postgres all failed identically. Root cause confirmed live in production (not a CI-fixture artifact): 84% of public SECURITY DEFINER functions are currently PUBLIC-executable, leak is downstream of the default ACL, not fixable by this SD\'s migration mechanism.',
    production_measurement: '636/759 (84%) of public-schema SECURITY DEFINER functions carry public_exec=true, independently re-measured by both SECURITY and TESTING sub-agents',
    unverified_lead: 'database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19 -- blanket GRANT ... TO anon, authenticated, PUBLIC loop',
    remaining_controls: [
      'FR-6 lint (scripts/lint/secdef-execute-revoke-lint.mjs, blocking in CI via .github/workflows/secdef-execute-revoke-lint.yml)',
      'scripts/audit-rpc-execute-grants.mjs completeness gate -- currently manual npm script only, not wired into CI',
    ],
    followup_needed: [
      'Dedicated minimal harness for the ADP/downstream-PUBLIC-leak mechanism investigation (isolated from the 27-stub shared DDL test container)',
      'Wire audit-rpc-execute-grants.mjs completeness gate into CI',
    ],
    requires_lead_signoff: true,
    lead_signoff_mechanism: 'Normal LEO protocol gates at PLAN-TO-LEAD and LEAD-FINAL-APPROVAL for this same SD -- not a separate out-of-band check.',
  },
};

const { data: updated, error: updateErr } = await supabase.from('product_requirements_v2')
  .update({ functional_requirements: fr, metadata })
  .eq('id', PRD_ID)
  .select('id, metadata').maybeSingle();
if (updateErr) throw updateErr;
console.log('FR-4 marked descoped. metadata.fr4_descope keys:', Object.keys(updated.metadata.fr4_descope));
