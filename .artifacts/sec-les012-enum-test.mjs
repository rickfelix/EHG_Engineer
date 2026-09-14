import 'dotenv/config';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
const s = createSupabaseServiceClient();

// EXACT replication of fetchAllMarkedRows(): offset pagination, NO .order()
async function fetchAllMarkedRows() {
  const rows = []; let from = 0; const pageSize = 1000;
  for (;;) {
    const { data, error } = await s.from('product_requirements_v2')
      .select('id, metadata')
      .not('metadata->integration_backfill','is',null)
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length===0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

for (let trial = 1; trial <= 3; trial++) {
  const rows = await fetchAllMarkedRows();
  const ids = rows.map(r=>r.id);
  const uniq = new Set(ids);
  const markerOnly = rows.filter(r => Object.keys(r.metadata||{}).length === 1);
  console.log(`trial ${trial}: returned=${ids.length} distinct=${uniq.size} duplicates=${ids.length-uniq.size} markerOnly_seen=${markerOnly.length}`);
}

// ground truth: how many marker-only rows actually exist
const { data: gt } = await s.rpc('exec_sql', { sql_text: "SELECT count(*) AS marker_only FROM product_requirements_v2 WHERE metadata ? 'integration_backfill' AND (SELECT count(*) FROM jsonb_object_keys(metadata))=1" });
console.log('GROUND TRUTH marker-only rows:', JSON.stringify(gt?.[0]?.result));
