#!/usr/bin/env node
/**
 * backfill-414-null-titles.mjs — one-shot recovery for the belt-dry root cause
 * (SD-LEO-INFRA-AUTO-REFILL-414-NULL-TITLES-001).
 *
 * All pending todoist/youtube roadmap_wave_items had title=NULL, so evaluateRefillCandidate rejected
 * every one (missing_title) and the auto-refill cron promoted 0 → the fleet belt could not refill.
 * This re-resolves each null-title pending row's title from its source intake table by source_id and
 * writes it. Rows whose source title is irrecoverable are dispositioned item_disposition='dropped' +
 * metadata.title_unrecoverable=true (NOTE: the item_disposition CHECK is
 * pending|selected|deferred|brainstorm|promoted|dropped — 'dropped' is the CHECK-valid disposition
 * that removes the row from the pending pool; the SD's suggested 'source_title_unrecoverable' is NOT
 * a valid CHECK value and rides in metadata instead) so no silent null-title belt blocker remains.
 *
 * DRY-RUN BY DEFAULT. Pass --apply to write. Idempotent (only touches title IS NULL pending rows).
 *
 * Usage: node scripts/sourcing-engine/backfill-414-null-titles.mjs [--apply]
 */
import 'dotenv/config';
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { fileURLToPath, pathToFileURL } from 'url';
import { resolveSourceTitle } from '../../lib/sourcing-engine/resolve-source-title.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — every scanned row is
// resolved + written; a capped read would silently leave belt-blocking null-title rows
// unrecovered with no error, defeating this backfill's purpose.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

/**
 * @param {{ supabase: object, apply?: boolean, log?: Function }} opts
 * @returns {Promise<{ scanned:number, recovered:number, dispositioned:number, dry_run:boolean }>}
 */
export async function runBackfill({ supabase, apply = false, log = console.log } = {}) {
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('roadmap_wave_items')
      .select('id, title, source_type, source_id, item_disposition, metadata')
      .is('title', null)
      .eq('item_disposition', 'pending')
      .in('source_type', ['todoist', 'youtube'])
      .order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`select null-title pending rows failed: ${e.message}`);
  }

  const res = { scanned: rows.length, recovered: 0, dispositioned: 0, dry_run: !apply };
  log(`[backfill-414] scanned ${res.scanned} pending null-title todoist/youtube row(s) | apply=${apply}`);

  for (const row of rows) {
    const title = await resolveSourceTitle(supabase, row);
    if (title) {
      if (apply) {
        // Idempotent: only update while still null.
        const { error: uErr } = await supabase
          .from('roadmap_wave_items').update({ title }).eq('id', row.id).is('title', null);
        if (uErr) { log(`[backfill-414] WARN update ${row.id} failed: ${uErr.message}`); continue; }
      }
      res.recovered++;
    } else {
      // Irrecoverable source title → disposition so it leaves the pending pool (no silent blocker).
      if (apply) {
        const merged = { ...(row.metadata || {}), title_unrecoverable: true };
        const { error: dErr } = await supabase
          .from('roadmap_wave_items')
          .update({ item_disposition: 'dropped', metadata: merged })
          .eq('id', row.id).eq('item_disposition', 'pending');
        if (dErr) { log(`[backfill-414] WARN disposition ${row.id} failed: ${dErr.message}`); continue; }
      }
      res.dispositioned++;
    }
  }

  log(`[backfill-414] ${apply ? 'APPLIED' : 'DRY-RUN'}: recovered=${res.recovered} dispositioned(dropped)=${res.dispositioned} of ${res.scanned}`);
  return res;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apply = process.argv.includes('--apply');
  const supabase = createSupabaseServiceClient();
  runBackfill({ supabase, apply })
    .then((r) => { process.exit(r.scanned === 0 || r.dry_run || r.recovered + r.dispositioned === r.scanned ? 0 : 1); })
    .catch((e) => { console.error('[backfill-414] ERROR', e.message); process.exit(1); });
}
