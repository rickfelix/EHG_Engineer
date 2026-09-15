import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv'; dotenv.config();
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: dup, error: e1 } = await s.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,scope,description')
  .eq('sd_key','SD-LEO-INFRA-WIRE-FEEDBACK-TABLE-001');
console.log('=== FLAGGED DUP ===', e1||'');
for (const r of dup||[]) {
  console.log('key:', r.sd_key, '| status:', r.status, '| phase:', r.current_phase);
  console.log('title:', r.title);
  console.log('desc:', (r.description||'').slice(0,500));
  console.log('scope:', (r.scope||'').slice(0,500));
}

const { data: me, error: e2 } = await s.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase,metadata')
  .eq('sd_key','SD-LEO-INFRA-SKILL-LIBRARY-VERSIONED-001');
console.log('\n=== THIS SD ===', e2||'');
for (const r of me||[]) {
  console.log('title:', r.title, '| status:', r.status, '| phase:', r.current_phase);
  console.log('dedup meta:', JSON.stringify({dedup_match_sd_key:r.metadata?.dedup_match_sd_key, dedup_score:r.metadata?.dedup_score, dedup_reason:r.metadata?.dedup_reason}));
}

// Independent scope-duplicate search across ALL non-terminal SDs
const { data: all, error: e3 } = await s.from('strategic_directives_v2')
  .select('sd_key,title,status,current_phase')
  .not('status','in','(completed,cancelled,archived,superseded)');
console.log('\n=== OPEN SDs MATCHING skill/tool-grant/privilege/toolset ===', e3||'', '(pop:', (all||[]).length, ')');
const rx = /skill|tool.?grant|least.?privileg|toolset|tool.?contract|capabilit/i;
for (const r of all||[]) if (rx.test(r.title||'')) console.log(` - ${r.sd_key} [${r.status}/${r.current_phase}] ${r.title}`);
