#!/usr/bin/env node
/**
 * QF-20260830-939: one-time registration of the TRIANGULATION AUDIT's periodic_process_registry
 * row. stampLastFired() (lib/periodic-liveness/stamp-last-fired.js) deliberately never auto-creates
 * a row for an unregistered process_key — registry membership must be explicit. Idempotent
 * (upsert on process_key): safe to re-run.
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';

export const PROCESS_KEY = 'adam:triangulation-audit';
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export async function seedTriangulationAuditRegistry(supabase) {
  const { error } = await supabase
    .from('periodic_process_registry')
    .upsert({
      process_key: PROCESS_KEY,
      display_name: 'Adam loop: Triangulation Audit (weekly self-analytics, ratification 7b28b8f0)',
      owner: 'adam',
      process_type: 'standalone_cron',
      expected_interval_seconds: SEVEN_DAYS_SECONDS,
      liveness_source: 'self_stamped',
      liveness_source_ref: { cron: '11 9 * * 1', discovered_from: 'ADAM_LOOPS' },
      session_bound: false,
      currently_expected_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'process_key' });
  if (error) throw new Error(`seed-triangulation-audit-registry failed: ${error.message}`);
  return { seeded: true, process_key: PROCESS_KEY };
}

async function main() {
  const supabase = createSupabaseServiceClient();
  const result = await seedTriangulationAuditRegistry(supabase);
  console.log(`[seed-triangulation-audit-registry] registered ${result.process_key} (expected_interval_seconds=${SEVEN_DAYS_SECONDS})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error('seed-triangulation-audit-registry failed:', err?.message || err); process.exit(1); });
}
