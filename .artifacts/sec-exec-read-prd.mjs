import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('product_requirements_v2').select('id,title,content,metadata,risks,constraints').eq('directive_id','SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C');
const txt = JSON.stringify(data);
console.log('PRD rows:', data.length, 'chars:', txt.length);
for (const kw of ['revoke','AAD','in-process','residual','dotenv','domain separator']) {
  const idxs = []; let i = -1;
  while ((i = txt.toLowerCase().indexOf(kw.toLowerCase(), i+1)) !== -1) idxs.push(i);
  console.log(`\n### "${kw}" x${idxs.length}`);
  for (const j of idxs.slice(0,4)) console.log('   ...' + txt.slice(Math.max(0,j-260), j+260).replace(/\n/g,' ') + '...');
}
