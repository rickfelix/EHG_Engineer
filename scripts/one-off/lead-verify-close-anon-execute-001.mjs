import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, metadata')
  .eq('sd_key', 'SD-LEO-INFRA-CLOSE-ANON-EXECUTE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

// GATE_MECHANISM_CLAIM_VERIFIER requires the exact shape { verified_by, verified_at: "path:LINE" }.
const mechanism_verifications = [
  {
    verified_by: 'Golf-3 (fork investigation, live DB queries + tool runs during LEAD)',
    verified_at: 'database/migrations/20260614_role_handoff_atomic_coordinator_flag.sql:31',
  },
  {
    verified_by: 'Golf-3 (fork investigation, live DB queries + tool runs during LEAD)',
    verified_at: 'database/migrations/20260615_role_handoff_atomic_adam_flag.sql:16',
  },
  {
    verified_by: 'Golf-3 (fork investigation, live anon-key RPC probes + pg_proc query during LEAD)',
    verified_at: 'database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql:171',
  },
  {
    verified_by: 'Golf-3 (fork investigation, ran the lint directly during LEAD: 0 violations)',
    verified_at: 'scripts/lint/secdef-execute-revoke-lint.mjs:37',
  },
  {
    verified_by: 'Golf-3 (fork investigation, ran the audit directly during LEAD: 2 undeclared functions)',
    verified_at: 'scripts/audit-rpc-execute-grants.mjs:213',
  },
  {
    verified_by: 'Golf-3 (fork investigation, live pg_proc query during LEAD confirmed prosecdef=true despite the file header)',
    verified_at: 'database/chairman-gated/20260817_fdbk_error_capture_rpc.sql:7',
  },
  {
    verified_by: 'Golf-3 (fork investigation, confirmed database/chairman-gated/20260816_defacl_anon_auth_axis.sql still has no @approved-by stamp despite its owning SD status=completed)',
    verified_at: 'database/chairman-gated/20260816_defacl_anon_auth_axis.sql:1',
  },
];

const scope_decision = {
  decision: 'DESCOPE the SD\'s original scope items #1 (census script) and #4 (CI predicate) as duplicative of already-live infrastructure; narrow to repairing the 6 role-flag functions, closing 2 currently-undeclared functions, wiring the existing completeness gate into scheduled CI, and escalating 2 discovered false-completion/drift findings rather than fixing them unilaterally.',
  rationale: 'scripts/audit-rpc-execute-grants.mjs (buckets mode) and scripts/lint/secdef-execute-revoke-lint.mjs already deliver scope items #1 and #4, confirmed by directly running both during LEAD. Building new versions would duplicate working, already-CI-wired infrastructure.',
  decided_by: 'Golf-3 (session a1d6d6cf-4e4c-455a-b5bd-6066cae77c32), LEAD phase',
};

const metadata = {
  ...sd.metadata,
  mechanism_verifications,
  scope_decision,
};

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ metadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log(`SD metadata updated: ${mechanism_verifications.length} mechanism_verifications + scope_decision recorded.`);
