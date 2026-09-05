import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, key_changes, strategic_objectives, risks, metadata')
  .eq('sd_key', 'SD-LEO-INFRA-CLOSE-ANON-EXECUTE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const key_changes = [
  {
    change: 'New chairman-gated migration (database/chairman-gated/) REVOKEs EXECUTE FROM PUBLIC, anon, authenticated on the 6 role-flag functions (solomon/adam/coordinator) plus set_session_awaiting_approval, GRANTs to service_role, with a DO $verify$ has_function_privilege self-test -- guarded so it does not error on the not-yet-live adam pair',
    impact: 'Closes the one genuinely urgent live risk: a future apply of the adam-flag migration would otherwise land anon-callable (an RLS-bypass write on claude_sessions)',
  },
  {
    change: 'scripts/audit-rpc-execute-grants-buckets.json gains a documented entry for fn_submit_error_capture (intentionally anon-facing, already defended by its own severity-clamp/allow-list)',
    impact: 'The existing completeness gate reaches zero undeclared functions honestly, without force-closing a legitimate design',
  },
  {
    change: 'New scheduled CI workflow running the existing scripts/audit-rpc-execute-grants.mjs (buckets mode), mirroring the session-liveness-ssot-exit-predicate-check.yml pattern',
    impact: 'A previously manual-only completeness gate now runs automatically, closing a gap its own originating SD explicitly disclosed and left open',
  },
];

const strategic_objectives = [
  'Close the one live, urgent anon-EXECUTE risk (the adam-flag migration landing open on its eventual apply) without duplicating already-working security infrastructure',
  'Escalate, not silently paper over, two discovered false-completion/drift findings (an approved-but-unapplied migration; a staged-labeled-but-live function)',
];

const risks = [
  ...(Array.isArray(sd.risks) ? sd.risks : []),
  {
    risk: 'The original SD scope (a new census script + a new CI predicate) would have duplicated scripts/audit-rpc-execute-grants.mjs and scripts/lint/secdef-execute-revoke-lint.mjs, both already live and passing',
    mitigation: 'LEAD-phase fork + Explore verification directly ran both existing tools against the live database before authoring the PRD; scope was narrowed to the 4 non-redundant items',
    severity: 'low',
  },
];

const metadata = { ...sd.metadata, needs_enrichment: [] };

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ key_changes, strategic_objectives, risks, metadata })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD key_changes/strategic_objectives/risks filled; needs_enrichment cleared.');
