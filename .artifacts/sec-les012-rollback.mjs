import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();
const { data } = await s.from('product_requirements_v2')
  .select('risks, integration_operationalization, metadata')
  .eq('id','PRD-SD-LEARN-FIX-ADDRESS-PAT-LES-012').maybeSingle();
const blob = JSON.stringify(data);
console.log('PRD metadata keys:', Object.keys(data?.metadata||{}));
const io = JSON.stringify(data?.integration_operationalization||{});
console.log('--- rollback_procedure in integration_operationalization ---');
console.log(data?.integration_operationalization?.observability_rollout?.rollback_procedure || '(none)');
console.log('--- does the DB PRD still contain the dangerous "re-null" language? ---');
const hits = (blob.match(/re-null/gi)||[]).length;
console.log('occurrences of "re-null":', hits);
for (const m of blob.matchAll(/.{140}re-null.{200}/gi)) console.log('  >>', m[0].replace(/\\"/g,'"'), '\n');
