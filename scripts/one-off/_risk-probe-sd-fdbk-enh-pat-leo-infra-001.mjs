import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// 1. Function overload check
console.log('--- 1. Function overload check (pg_proc) ---');
const { data: procs, error: e1 } = await supabase.rpc('exec_sql', {
  query: `SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE p.proname = 'update_sd_after_lead_evaluation'
             AND n.nspname = 'public';`
});
if (e1) console.log('exec_sql RPC error:', e1.message);
else console.log(JSON.stringify(procs, null, 2));

// 2. Count existing SDs at status='active'
console.log('\n--- 2. SDs at status=active ---');
const { data: activeSDs, count: activeCount, error: e3 } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key,current_phase,status,updated_at', { count: 'exact' })
  .eq('status', 'active')
  .order('updated_at', { ascending: false });
console.log('Count:', activeCount, 'Error:', e3?.message);
if (activeSDs && activeSDs.length) {
  console.log('Sample (most recent 10):');
  activeSDs.slice(0, 10).forEach(sd => console.log(`  ${sd.sd_key} phase=${sd.current_phase} updated=${sd.updated_at}`));
}

// 3. Baseline in_progress count
console.log('\n--- 3. SDs at status=in_progress (baseline) ---');
const { count: ipCount } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key', { count: 'exact', head: true })
  .eq('status', 'in_progress');
console.log('Count:', ipCount);

// 4. status CHECK constraint
console.log('\n--- 4. status column CHECK constraint ---');
const { data: checkCons, error: e5 } = await supabase.rpc('exec_sql', {
  query: `SELECT conname, pg_get_constraintdef(oid) AS def
            FROM pg_constraint
           WHERE conrelid = 'public.strategic_directives_v2'::regclass
             AND contype = 'c';`
});
if (e5) console.log('exec_sql error:', e5.message);
else console.log(JSON.stringify(checkCons, null, 2));

// 5. Triggers
console.log('\n--- 5. Triggers on strategic_directives_v2 ---');
const { data: triggers, error: e6 } = await supabase.rpc('exec_sql', {
  query: `SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
            FROM pg_trigger
           WHERE tgrelid = 'public.strategic_directives_v2'::regclass
             AND NOT tgisinternal;`
});
if (e6) console.log('exec_sql error:', e6.message);
else console.log(JSON.stringify(triggers, null, 2));

// 6. Current function body
console.log('\n--- 6. Current function body ---');
const { data: fnBody, error: e7 } = await supabase.rpc('exec_sql', {
  query: `SELECT pg_get_functiondef(p.oid) AS def
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE p.proname = 'update_sd_after_lead_evaluation'
             AND n.nspname = 'public'
           LIMIT 1;`
});
if (e7) console.log('exec_sql error:', e7.message);
else if (fnBody && fnBody.length) console.log(fnBody[0].def);
else console.log('(no rows)');

// 7. Look at SD itself
console.log('\n--- 7. SD record ---');
const { data: sd } = await supabase
  .from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,sd_type,priority,scope,strategic_intent,description,key_changes,risks,implementation_guidelines,dependencies,success_metrics,metadata,smoke_test_steps,user_acceptance_criteria')
  .eq('sd_key', 'SD-FDBK-ENH-PAT-LEO-INFRA-001')
  .maybeSingle();
console.log(JSON.stringify(sd, null, 2));
