#!/usr/bin/env node
/**
 * SD-LEO-INFRA-UNBLOCK-PORTFOLIO-WIDE-001 (FR-4) — CLI for the venture lineage write path.
 * Makes lib/governance/venture-lineage.js reachable from a live entry point (no dark seam).
 *
 * Usage:
 *   node scripts/write-venture-lineage.mjs <ventureId> [--blueprint <uuid>] [--vision <uuid>] [--arch <uuid>] [--overwrite]
 * With no lineage flags it prints the current lineage (read-only). DORMANT today (0/9 derivable).
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeVentureLineage, LINEAGE_COLUMNS } from '../lib/governance/venture-lineage.js';

function flag(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const ventureId = process.argv[2];
  if (!ventureId || ventureId.startsWith('--')) {
    console.error('Usage: node scripts/write-venture-lineage.mjs <ventureId> [--blueprint <uuid>] [--vision <uuid>] [--arch <uuid>] [--overwrite]');
    console.error('Lineage columns:', LINEAGE_COLUMNS.join(', '));
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
  const supabase = createClient(url, key);

  const proposed = {};
  const bp = flag('--blueprint'); if (bp) proposed.source_blueprint_id = bp;
  const vi = flag('--vision'); if (vi) proposed.vision_id = vi;
  const ar = flag('--arch'); if (ar) proposed.architecture_plan_id = ar;
  const overwrite = process.argv.includes('--overwrite');

  if (Object.keys(proposed).length === 0) {
    const { data, error } = await supabase.from('ventures')
      .select('id, name, source_blueprint_id, vision_id, architecture_plan_id').eq('id', ventureId).single();
    console.log(error ? `read error: ${error.message}` : JSON.stringify(data, null, 2));
    process.exit(error ? 1 : 0);
  }

  const r = await writeVentureLineage(supabase, ventureId, proposed, { overwrite });
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.success ? 0 : 1);
}

main().catch((e) => { console.error('write-venture-lineage failed:', e && e.message ? e.message : e); process.exit(1); });
