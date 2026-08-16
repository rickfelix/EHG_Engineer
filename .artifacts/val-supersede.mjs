import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const OLD = '36887768-6c1d-43b6-8eb4-f1c9b0ae43f9';
const NEW = '0332fe88-4e8d-4362-9c41-07c3fc96ac86';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Read-merge-write: never String() a jsonb column, never blind-overwrite it.
const { data: row, error: readErr } = await s
  .from('sub_agent_execution_results').select('id,metadata,verdict').eq('id', OLD).single();
if (readErr) { console.error('read failed:', readErr.message); process.exit(1); }

const merged = {
  ...row.metadata,
  superseded_by: NEW,
  superseded_at: new Date().toISOString(),
  superseded_reason:
    'DO NOT ACT ON THIS ROW. It carries a FALSE advisory claiming the predecessor migration '
    + '20260728_revoke_public_execute_role_flag_rpcs.sql does not exist. It DOES exist (commit 13d02e18d81) but sits on the '
    + 'unmerged branch fix/role-flag-execute-revoke. This row also contains shell-mangled text (backticks were consumed by '
    + 'command substitution during the write). The corrected, authoritative VALIDATION evidence for this SD is row ' + NEW + '.'
};

const { data: upd, error: updErr } = await s
  .from('sub_agent_execution_results').update({ metadata: merged }).eq('id', OLD).select('id');
if (updErr) { console.error('update failed:', updErr.message); process.exit(1); }
// An UPDATE matching zero rows is indistinguishable from success — assert the row count.
if (!upd || upd.length !== 1) { console.error('UPDATE matched', upd ? upd.length : 0, 'rows — expected 1'); process.exit(1); }

const { data: check } = await s.from('sub_agent_execution_results').select('metadata').eq('id', OLD).single();
console.log('old row superseded_by persisted =', check.metadata.superseded_by);
console.log('rows updated =', upd.length);
