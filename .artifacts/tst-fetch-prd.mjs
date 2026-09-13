import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data, error } = await sb.from('product_requirements_v2').select('*').eq('id','PRD-SD-LEO-INFRA-PUBLISH-OUTCOME-OBSERVER-001').maybeSingle();
if (error) { console.error('ERR', error); process.exit(1); }
if (!data) { console.error('NO ROW'); process.exit(1); }
console.log('KEYS:', Object.keys(data).join(', '));
const out = {};
for (const k of ['functional_requirements','technical_requirements','test_scenarios','acceptance_criteria','risks','system_architecture','integration_operationalization','implementation_approach','metadata','phase','status','updated_at']) out[k]=data[k];
fs.writeFileSync(process.argv[2], JSON.stringify(out,null,2));
console.log('WROTE', process.argv[2], JSON.stringify(out).length, 'bytes');
