#!/usr/bin/env node
/**
 * backfill-adam-ghosts — SD-LEO-INFRA-SOURCING-ENGINE-ADAM-DIRECT-REGISTRY-001 (FR-2 CLI).
 *
 * Registers Adam-sourced "ghost" SDs (metadata.sourced_by='adam' with no roadmap_wave_items row)
 * into the LEO Roadmap via the dormant-safe backfillAdamGhosts. DRY-RUN by default — pass --apply to
 * write (and even then it stays dry-run until BOTH the lane column + source_type CHECK migrations are
 * applied, so it can never prematurely mutate the chairman-visible roadmap).
 *
 * Usage:  npm run sourcing:backfill-adam-ghosts            # dry-run report
 *         npm run sourcing:backfill-adam-ghosts -- --apply # live (only effective once migrations applied)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { backfillAdamGhosts } from '../../lib/sourcing-engine/adam-direct-registry.js';

const apply = process.argv.includes('--apply');
const capArg = (process.argv.find((a) => a.startsWith('--cap=')) || '').split('=')[1];

async function main() {
  const db = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const res = await backfillAdamGhosts(db, { apply, cap: capArg ? Number(capArg) : undefined });
  const mode = res.dry_run ? 'DRY-RUN' : 'APPLIED';
  console.log(`[backfill-adam-ghosts] ${mode}: ${res.registered}/${res.candidates} ghost(s) ${res.dry_run ? 'would register' : 'registered'} (wave=${res.wave_id ? res.wave_id.slice(0, 8) : 'none'})`);
  if (res.lane_column_missing) console.log('  note: roadmap_wave_items.lane column dormant — forced dry-run (apply the lane migration to enable lane stamping).');
  if (res.source_type_unsupported) console.log("  note: source_type CHECK does not yet admit 'adam_direct' — forced dry-run (apply 20260620_roadmap_wave_items_adam_direct_source_type.sql).");
  if (res.errors.length) for (const e of res.errors) console.warn(`  [error] ${e.sd_key}: ${e.error}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('[backfill-adam-ghosts] fatal:', e.message); process.exit(1); });
