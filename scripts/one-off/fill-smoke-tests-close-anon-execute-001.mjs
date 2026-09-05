import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sd, error: readErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', 'SD-LEO-INFRA-CLOSE-ANON-EXECUTE-001')
  .maybeSingle();
if (readErr) { console.error(readErr); process.exit(1); }

const smoke_test_steps = [
  {
    step_number: 1,
    instruction: 'Run AUDIT_GRANTS_MODE=buckets node scripts/audit-rpc-execute-grants.mjs against the live database before any fix',
    expected_outcome: 'Reports exactly 2 undeclared anon/PUBLIC-executable SECURITY DEFINER functions: set_session_awaiting_approval and fn_submit_error_capture -- verified live during LEAD',
  },
  {
    step_number: 2,
    instruction: 'Run node scripts/lint/secdef-execute-revoke-lint.mjs --all against the current repo state',
    expected_outcome: '308 pre-existing violations reported (the grandfathered backlog) -- confirms the lint is live and scanning database/chairman-gated/ correctly; the --diff (CI default) mode reports 0 since no scoped file has changed yet',
  },
  {
    step_number: 3,
    instruction: 'After FR-1/FR-2 land: re-run AUDIT_GRANTS_MODE=buckets node scripts/audit-rpc-execute-grants.mjs',
    expected_outcome: 'Reports zero undeclared functions',
  },
];

const { error: writeErr } = await supabase
  .from('strategic_directives_v2')
  .update({ smoke_test_steps })
  .eq('id', sd.id);
if (writeErr) { console.error('WRITE ERROR', writeErr); process.exit(1); }
console.log('SD smoke_test_steps filled with real content.');
