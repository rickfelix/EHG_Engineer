// READ-ONLY: introspect the live CHECK constraint on sms_inbound_log.outcome.
// SECURITY sub-agent, SD-LEO-FIX-EVERY-CHAIRMAN-SMS-001 EXEC_TO_PLAN. No writes.
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { discoverConstraintsViaSupabase } from '../scripts/discover-schema-constraints.js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createSupabaseServiceClient();

try {
  const rows = await discoverConstraintsViaSupabase(sb, 'sms_inbound_log');
  console.log('LIVE_CHECK_CONSTRAINTS on sms_inbound_log:');
  for (const r of rows) console.log(`  ${r.constraint_name} [${r.column_name}] => ${r.constraint_definition}`);
  const outcomeC = rows.find((r) => r.constraint_name === 'sms_inbound_log_outcome_check');
  console.log('ACCEPTS_no_open_question=', outcomeC ? /no_open_question/.test(outcomeC.constraint_definition) : 'CONSTRAINT_ABSENT');
} catch (e) {
  console.log('INTROSPECTION_ERROR', e.message);
}

// Read-only: confirm the widening did not reclassify any historical row.
const { count, error: cErr } = await sb
  .from('sms_inbound_log')
  .select('*', { count: 'exact', head: true })
  .eq('outcome', 'no_open_question');
console.log('existing_no_open_question_rows=', cErr ? 'ERR ' + cErr.message : count);

const { count: total, error: tErr } = await sb
  .from('sms_inbound_log')
  .select('*', { count: 'exact', head: true });
console.log('total_sms_inbound_log_rows=', tErr ? 'ERR ' + tErr.message : total);
process.exit(0);
