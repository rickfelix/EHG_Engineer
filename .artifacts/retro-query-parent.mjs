import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PARENT_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001';

async function main() {
  const { data: parent, error: pErr } = await supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('sd_key', PARENT_KEY)
    .maybeSingle();
  if (pErr || !parent) {
    console.error('PARENT NOT FOUND', pErr);
    return;
  }
  console.log('=== PARENT ===');
  console.log(JSON.stringify({
    id: parent.id, sd_key: parent.sd_key, title: parent.title, status: parent.status,
    sd_type: parent.sd_type, created_at: parent.created_at, description: parent.description,
    scope: parent.scope, metadata_keys: parent.metadata ? Object.keys(parent.metadata) : [],
  }, null, 2));
  console.log('metadata.children:', JSON.stringify(parent.metadata?.children, null, 2));

  // Find children by parent_sd_id
  const { data: children, error: cErr } = await supabase
    .from('strategic_directives_v2')
    .select('id, sd_key, title, status, sd_type, created_at, updated_at, description, scope, metadata')
    .eq('parent_sd_id', parent.id)
    .order('sd_key', { ascending: true });
  if (cErr) console.error('CHILDREN ERR', cErr);
  console.log('\n=== CHILDREN (by parent_sd_id) ===', children?.length);
  for (const c of (children || [])) {
    console.log(`- ${c.sd_key} | status=${c.status} | ${c.title}`);
  }

  // Existing retrospectives for parent
  const { data: parentRetros } = await supabase
    .from('retrospectives')
    .select('id, sd_id, retro_type, retrospective_type, quality_score, status, created_at, updated_at, title')
    .eq('sd_id', parent.id)
    .order('created_at', { ascending: false });
  console.log('\n=== EXISTING PARENT RETROSPECTIVES ===');
  console.log(JSON.stringify(parentRetros, null, 2));

  global.__parent = parent;
  global.__children = children;
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
