import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const s = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: row, error } = await s.from('sub_agent_execution_results').select('*').eq('id','06363563-9963-4fe0-8768-05bab7da3aba').maybeSingle();
if (error) { console.log('ERR', error.message); process.exit(1); }
const m = row.metadata;
console.log('verdict:', row.verdict, '| original_verdict:', m.original_verdict, '| confidence:', row.confidence);
console.log('phase(col):', row.phase, '| phase(meta):', m.phase);
console.log('metadata.error:', JSON.stringify(m.error));
console.log('_findings_stripped:', m._findings_stripped, '| _findings_had_keys:', JSON.stringify(m._findings_had_keys));
console.log('metadata.findings type:', Array.isArray(m.findings) ? `array len ${m.findings.length}` : typeof m.findings);
if (Array.isArray(m.findings)) m.findings.forEach((f,i)=>console.log(`  [${i}] ${String(f).slice(0,95)}...`));
console.log('summary present:', !!row.summary, '| len', (row.summary||'').length);
console.log('detailed_analysis len:', (row.detailed_analysis||'').length);
console.log('test_suite_result len:', (m.test_suite_result||'').length);
console.log('prd_coverage:', JSON.stringify(m.prd_coverage));
