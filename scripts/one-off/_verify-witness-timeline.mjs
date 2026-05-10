import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const sd_id = 'b737c27f-3e83-4887-999e-3c1ae158faf4';

const { data: handoffs } = await supabase
  .from('sd_phase_handoffs')
  .select('id, handoff_type, status, created_at, accepted_at, from_phase, to_phase')
  .eq('sd_id', sd_id)
  .order('created_at', { ascending: true });

console.log('=== Handoffs for SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A ===');
for (const h of (handoffs || [])) {
  console.log(`${h.created_at} | ${h.handoff_type || '(no type)'} | ${h.from_phase}→${h.to_phase} | status=${h.status} | accepted_at=${h.accepted_at}`);
}

const { data: retros } = await supabase
  .from('retrospectives')
  .select('id, retrospective_type, status, quality_score, created_at, sd_key')
  .eq('sd_id', sd_id)
  .order('created_at', { ascending: true });

console.log('\n=== Retros for SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-A ===');
for (const r of (retros || [])) {
  console.log(`${r.created_at} | type=${r.retrospective_type} | status=${r.status} | qs=${r.quality_score} | sd_key=${r.sd_key}`);
}

// Inspect SD audit log if exists
console.log('\n=== Check sd_audit_log or status history ===');
const { data: audit } = await supabase
  .from('sd_audit_log')
  .select('id, sd_id, action, old_value, new_value, created_at')
  .eq('sd_id', sd_id)
  .order('created_at', { ascending: true })
  .limit(20);
if (audit) {
  for (const a of audit) {
    console.log(`${a.created_at} | ${a.action} | ${a.old_value}→${a.new_value}`);
  }
} else {
  console.log('(no sd_audit_log table or no rows)');
}
