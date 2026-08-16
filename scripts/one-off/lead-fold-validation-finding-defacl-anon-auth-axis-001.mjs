#!/usr/bin/env node
// LEAD-phase: fold VALIDATION sub-agent finding into SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001
// before LEAD-TO-PLAN handoff (CLAUDE_LEAD.md: "route findings into PRD draft").
//
// VALIDATION (evidence row 9af23eb7-318e-4063-99c9-55373a220802) flagged the predecessor
// migration's header (database/chairman-gated/20260816_close_remaining_secdef_execute_
// exposure.sql:16-28) which independently concluded: "A follow-up investigation retrying
// 'fix the ALTER DEFAULT PRIVILEGES statement' would target the wrong mechanism" — but reading
// that header directly (done here) shows this warning is scoped to the PUBLIC axis only. The
// SAME header explicitly states "FR-4's only real, deliverable value was ever the anon-axis
// default removal" -- i.e. an anon/authenticated-axis ADP fix (exactly this SD's mechanism,
// independently confirmed live by scripts/one-off/verify-defacl-anon-auth-axis-mechanism-001.mjs)
// is NOT the mechanism the predecessor's warning targets. The PUBLIC-axis 84% public_exec=true
// finding (636/759 functions) has its own separate, already-identified root cause: a blanket
// `GRANT EXECUTE ... TO anon, authenticated, PUBLIC` loop at
// database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19,
// tracked as a distinct defect class, detected (not prevented) by the existing
// secdef-execute-revoke-lint.mjs + audit-rpc-execute-grants.mjs completeness gate. This SD's
// acceptance script must therefore prove the narrower, achievable claim (no anon/authenticated
// EXECUTE inherited VIA DEFAULT ACL) and must NOT claim to fix the broader public_exec=true rate,
// which is a separate mechanism out of scope here.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const SD_KEY = 'SD-LEO-SEC-DEFACL-ANON-AUTH-AXIS-001';

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id, risks')
  .eq('sd_key', SD_KEY)
  .single();
if (readErr) { console.error('READ ERR:', readErr.message); process.exit(1); }

const marker = 'PRD must distinguish';
const already = (sd.risks || []).some((r) => String(r.risk || '').includes(marker));
if (already) { console.log('ALREADY PRESENT'); process.exit(0); }

const risks = [
  ...(Array.isArray(sd.risks) ? sd.risks : []),
  {
    risk:
      'The predecessor migration (database/chairman-gated/20260816_close_remaining_secdef_execute_exposure.sql:16-28) independently found that a PUBLIC-axis ADP fix is a structural no-op (84% of public functions, 636/759, are public_exec=true via a SEPARATE mechanism: a blanket GRANT...TO PUBLIC loop at database/migrations/20260603_03_revoke_secdef_execute_from_anon_authenticated_rollback.sql:19), and warns "retrying fix the ALTER DEFAULT PRIVILEGES statement would target the wrong mechanism." PRD must distinguish this SD\'s claim (no anon/authenticated EXECUTE inherited via default ACL for postgres/supabase_admin — confirmed live and narrower) from the broader, already-tracked public_exec=true defect (a different mechanism, out of this SD\'s scope, already detected by secdef-execute-revoke-lint.mjs + audit-rpc-execute-grants.mjs\'s completeness gate) — do not let the acceptance script claim to close the public_exec rate.',
    impact: 'medium',
    likelihood: 'medium',
    mitigation:
      'Acceptance script asserts the narrow claim only (probe function created post-apply: has_function_privilege(anon/authenticated, oid, EXECUTE) = false, sourced from pg_default_acl inheritance specifically). PRD documents the separate PUBLIC-axis leak as an explicitly out-of-scope, already-tracked defect with its own owner (the two DETECTIVE controls named in the predecessor header), not silently absorbed into this SD\'s success criteria.',
  },
];

const { error } = await supabase.from('strategic_directives_v2').update({ risks }).eq('id', sd.id);
if (error) { console.error('UPDATE ERR:', error.message); process.exit(1); }
console.log('risks now:', risks.length);
