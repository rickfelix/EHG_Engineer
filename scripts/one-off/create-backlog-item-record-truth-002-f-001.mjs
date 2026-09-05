import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdKey = 'SD-LEO-ORCH-CAPA-RECORD-TRUTH-002-F';
const sdUuid = '0cec8c1e-bbe3-4447-869d-6fa26191003f';

const { data, error } = await supabase
  .from('sd_backlog_map')
  .insert({
    sd_id: sdUuid,
    backlog_id: `BL-${sdKey}-001`,
    backlog_title: 'Census the parent-lead/dependency axis across every known claim surface',
    item_description:
      'scripts/tier-floor-census.mjs only ever swept the tier-rank axis. Extended sweep() to a ' +
      'second, parameterized pattern (parent_sd_id|parentLeadPending|parentLeadPendingVerdict) ' +
      'diffed against a new PARENT_LEAD_KNOWN_SURFACES table (kept separate from KNOWN_SURFACES ' +
      'so the tier axis posture vocabulary never bleeds into this one), seeded with the 9 ' +
      'confirmed-wired surfaces plus the 3 investigated candidate surfaces, per FR-1/FR-2.',
    priority: 'high',
    item_type: 'story',
    completion_status: 'NOT_STARTED',
  })
  .select('sd_id, backlog_id');

if (error) {
  console.error('INSERT_ERR:', error);
  process.exit(1);
}
console.log('BACKLOG_ITEM_CREATED:', JSON.stringify(data, null, 2));
