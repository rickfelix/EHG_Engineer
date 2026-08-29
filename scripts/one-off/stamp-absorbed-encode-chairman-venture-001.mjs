#!/usr/bin/env node
/**
 * SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001 (FR-5): stamp the 10 source roadmap_wave_items
 * with metadata.absorbed_into_sd_key. Data-only (metadata JSONB merge) -- item_disposition's
 * CHECK constraint has no 'absorbed' value and this SD does not widen it.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_KEY = 'SD-LEO-INFRA-ENCODE-CHAIRMAN-VENTURE-001';
const IDS = [
  '02f08249-1314-4118-a46c-c1df0db284ad',
  '2ce2c440-3477-478e-be24-b7d15168440a',
  '1480e681-6579-4814-ac5a-a455868f5455',
  '7cb38c21-56aa-4bd2-9d38-ab1577ea26c3',
  '2fd9c164-94f2-4c49-877a-2bd0bbfe03ec',
  '6890c776-ef1b-4f08-9ca6-0696131b4409',
  '0c144d40-588c-44a4-8abc-9320ac966d2b',
  'e0684492-e22a-48b1-833a-2b3c9f9841bc',
  '36f1e1a7-33fe-44f2-bf0e-db427f9411f9',
  '7fd55181-c832-4ed6-bd7c-2d7911603477',
];

let stamped = 0;
for (const id of IDS) {
  const { data: row, error: readErr } = await supabase
    .from('roadmap_wave_items')
    .select('id, metadata')
    .eq('id', id)
    .single();
  if (readErr) { console.error(`READ FAILED ${id}:`, readErr.message); process.exit(1); }

  const metadata = { ...(row.metadata || {}), absorbed_into_sd_key: SD_KEY, absorbed_at: new Date().toISOString() };
  const { error: updErr } = await supabase
    .from('roadmap_wave_items')
    .update({ metadata })
    .eq('id', id);
  if (updErr) { console.error(`UPDATE FAILED ${id}:`, updErr.message); process.exit(1); }
  stamped++;
  console.log(`stamped ${id}`);
}

console.log(`\nDone: ${stamped}/${IDS.length} stamped with absorbed_into_sd_key=${SD_KEY}`);
process.exit(0);
