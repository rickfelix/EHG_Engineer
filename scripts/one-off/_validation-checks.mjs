// One-off validation checks for SD-FDBK-ENH-CASCADE-TRIGGER-3627-001 LEAD validation-agent
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('--- 1. Probe sd_phase_handoffs for sd_key column ---');
const { data: keyProbe, error: keyErr } = await sb.from('sd_phase_handoffs').select('sd_key').limit(1);
console.log('sd_key probe:', keyErr ? `ERROR ${keyErr.code}: ${keyErr.message}` : `OK rows=${(keyProbe||[]).length}`);

const { data: idProbe, error: idErr } = await sb.from('sd_phase_handoffs').select('sd_id').limit(1);
console.log('sd_id probe:', idErr ? `ERROR: ${idErr.message}` : `OK rows=${(idProbe||[]).length}`);

console.log('\n--- 2. Search SDs for prior fixes mentioning exec-context-guard or sd_key ---');
const { data: sds, error: sdsErr } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, created_at')
  .or('title.ilike.%exec-context-guard%,title.ilike.%assertSweepHandoffGate%,title.ilike.%sd_phase_handoffs.sd_key%')
  .order('created_at', { ascending: false });
if (sdsErr) console.log('SD search err:', sdsErr.message);
console.log(`SD title-matches: ${(sds||[]).length}`);
for (const s of (sds||[])) console.log(`  ${s.sd_key} [${s.status}/${s.current_phase}] ${s.title}`);

console.log('\n--- 2b. SD scope / description search ---');
const { data: sds2 } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, created_at')
  .or('description.ilike.%assertSweepHandoffGate%,description.ilike.%sd_phase_handoffs.sd_key%,scope.ilike.%assertSweepHandoffGate%,scope.ilike.%sd_phase_handoffs.sd_key%')
  .order('created_at', { ascending: false });
console.log(`SD body-matches: ${(sds2||[]).length}`);
for (const s of (sds2||[])) console.log(`  ${s.sd_key} [${s.status}/${s.current_phase}] ${s.title}`);

console.log('\n--- 3. QF search ---');
const { data: qfs, error: qfErr } = await sb.from('quick_fixes')
  .select('id, qf_key, title, status, created_at')
  .or('title.ilike.%exec-context-guard%,title.ilike.%assertSweepHandoffGate%,title.ilike.%sd_phase_handoffs%')
  .order('created_at', { ascending: false });
if (qfErr) console.log('QF err:', qfErr.message);
console.log(`QF title-matches: ${(qfs||[]).length}`);
for (const q of (qfs||[])) console.log(`  ${q.qf_key || q.id?.slice(0,8)} [${q.status}] ${q.title}`);

console.log('\n--- 4. SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (introducer) ---');
const { data: introSD } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, completed_at')
  .or('sd_key.eq.SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001,id.eq.SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001');
console.log(JSON.stringify(introSD || [], null, 2));

console.log('\n--- 5. Witness SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001 ---');
const { data: witnessSD } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, progress, completed_at, updated_at')
  .or('sd_key.eq.SD-LEO-INFRA-CLAIM-LIFECYCLE-RELEASE-001,id.eq.2a017ba5-ad88-4746-b2a8-0a8016c13835');
console.log(JSON.stringify(witnessSD || [], null, 2));

console.log('\n--- 5b. Witness SD accepted handoffs (by sd_id UUID) ---');
const { data: witnessHandoffs } = await sb.from('sd_phase_handoffs')
  .select('id, from_phase, to_phase, status, created_at')
  .eq('sd_id', '2a017ba5-ad88-4746-b2a8-0a8016c13835')
  .order('created_at', { ascending: true });
console.log(`Witness handoffs by sd_id UUID: ${(witnessHandoffs||[]).length}`);
for (const h of (witnessHandoffs||[])) console.log(`  ${h.from_phase} -> ${h.to_phase} [${h.status}] @ ${h.created_at}`);

console.log('\n--- 6. In-flight SDs touching stale-session-sweep or exec-context-guard ---');
const { data: inflightSDs } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase')
  .in('status', ['active', 'draft', 'planning'])
  .or('description.ilike.%stale-session-sweep%,description.ilike.%exec-context-guard%,scope.ilike.%stale-session-sweep%,scope.ilike.%exec-context-guard%')
  .order('created_at', { ascending: false });
console.log(`In-flight overlapping SDs: ${(inflightSDs||[]).length}`);
for (const s of (inflightSDs||[])) console.log(`  ${s.sd_key} [${s.status}/${s.current_phase}] ${s.title}`);

console.log('\n--- 7. Target SD self-load ---');
const { data: targetSD } = await sb.from('strategic_directives_v2')
  .select('id, sd_key, title, status, current_phase, sd_type, priority, scope, description')
  .eq('id', '38f4e8aa-0610-4f0d-a344-1b1968fef6b1');
if (targetSD && targetSD[0]) {
  const t = targetSD[0];
  console.log(`Target: ${t.sd_key} [${t.status}/${t.current_phase}] type=${t.sd_type} prio=${t.priority}`);
  console.log(`Title: ${t.title}`);
  console.log(`Scope length: ${(t.scope||'').length}, Description length: ${(t.description||'').length}`);
  console.log(`Scope (first 1200): ${(t.scope||'').slice(0,1200)}`);
}

console.log('\n--- 8. Most-recent commits referencing exec-context-guard ---');
import { execSync } from 'child_process';
const log = execSync('git log --all --oneline --since="2026-04-15" -- lib/exec-context-guard.mjs', { encoding: 'utf8' });
console.log(log || '(no commits)');
