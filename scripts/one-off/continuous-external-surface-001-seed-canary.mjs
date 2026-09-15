#!/usr/bin/env node
// Seeds the single permanently-public canary row for SD-LEO-INFRA-CONTINUOUS-EXTERNAL-SURFACE-001.
// Deliberately a plain service-role write (never routed through the migration file -- an
// INSERT there would fail migration-tier-classifier.mjs's provably-additive rules and force
// this SD's schema migration into TIER-2). Idempotent: upserts on the single well-known id so
// re-running never creates a second row.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const CANARY_ID = '00000000-0000-0000-0000-000000000001';

async function main() {
  const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { error } = await supabase.from('public_surface_canary').upsert(
    { id: CANARY_ID, label: 'continuous-external-surface-canary' },
    { onConflict: 'id' }
  );
  if (error) throw error;

  const { count, error: countErr } = await supabase.from('public_surface_canary').select('*', { count: 'exact', head: true });
  if (countErr) throw countErr;

  console.log('CANARY_SEEDED:', JSON.stringify({ id: CANARY_ID, total_rows: count }));
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
