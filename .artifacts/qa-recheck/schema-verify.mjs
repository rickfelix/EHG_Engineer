import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const targets = {
  retention_archive: ['id','source_table','row_data','archived_at','payload','row_timestamp','source_id'],
  issue_patterns: ['id','pattern_id','issue_summary','created_at','pattern_name','trend'],
  session_coordination: ['id','message_type','payload','created_at'],
  codebase_health_snapshots: ['dimension','target_application','score','findings','trend_direction','metadata'],
};
for (const [table, cols] of Object.entries(targets)) {
  console.log(`\n== ${table} ==`);
  for (const c of cols) {
    const { error } = await sb.from(table).select(c).limit(1);
    console.log(`  ${error ? (error.code === '42703' ? 'ABSENT ' : 'ERR:'+error.code+' ') : 'PRESENT'} ${c}`);
  }
}
console.log('\n== VERBATIM SELECTS FROM THE CODE ==');
const checks = [
  ['session_coordination (resolveT2Facts)', () => sb.from('session_coordination').select('id, message_type, payload, created_at').limit(1)],
  ['retention_archive (resolveT2Facts)', () => sb.from('retention_archive').select('id, source_table, row_data, archived_at').eq('source_table','session_coordination').limit(1)],
  ['issue_patterns (resolveT3Facts)', () => sb.from('issue_patterns').select('id, pattern_id, issue_summary, created_at').limit(1)],
  ['session_coordination (resolveT3Facts)', () => sb.from('session_coordination').select('id, payload, created_at').limit(1)],
];
for (const [name, fn] of checks) {
  const { error, data } = await fn();
  console.log(`  ${error ? 'FAIL ' + error.code + ' ' + error.message : 'OK   rows=' + (data?.length ?? 0)}  <- ${name}`);
}
