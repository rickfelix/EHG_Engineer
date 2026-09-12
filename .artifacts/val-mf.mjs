import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await sb.from('strategic_directives_v2').select('sd_key, metadata').not('metadata->migration_files','is',null).limit(400);
const rows=(data||[]).filter(r=>Array.isArray(r.metadata?.migration_files)&&r.metadata.migration_files.length);
let withDown=0, total=0;
for (const r of rows){ total++; if (r.metadata.migration_files.some(f=>/_DOWN/i.test(f))) withDown++; }
console.log(`SDs with migration_files: ${total}; of those, listing a _DOWN file: ${withDown}`);
console.log('sample:', JSON.stringify(rows.slice(0,6).map(r=>({sd:r.sd_key, files:r.metadata.migration_files})), null, 1));
