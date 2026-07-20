#!/usr/bin/env node
/**
 * Corrective backfill — SD-LEO-INFRA-ESTATE-LEDGER-PROJECTION-001 (FR-1).
 *
 * The estate drain (SD-LEO-INFRA-ESTATE-DISPOSITION-001) registered all 561 idea-estate items into
 * conversion_ledger and wrote each one's disposition_classification + 0-3 compounding_score into the
 * SOURCE row's raw_data — but for the dominant case (a novel improvement-candidate left UNdispositioned
 * to stay in the backlog) it never PROJECTED a verdict onto the ledger row. Result: every estate ledger
 * row has a NULL triage_verdict and the backlog is un-mineable.
 *
 * This one-shot, idempotent backfill reads each source table's raw_data back-pointer
 * (raw_data.conversion_ledger_id) + the already-computed raw_data.disposition_classification and projects
 * the classification onto the referenced ledger row via recordVerdict() — setting triage_verdict +
 * intake_status='triaged'. It NEVER writes a terminal disposition (the backlog gauge is unaffected) and
 * NEVER mints SDs (linked_sd_key stays NULL). The forward fix (FR-2, in drain-intake.mjs) prevents
 * recurrence; this corrects the rows already drained.
 *
 *   DEFAULT = --dry-run: zero writes; reports the projection plan.
 *   --apply : projects each verdict onto its ledger row (idempotent — a re-run reports 0 net updates).
 *
 * Usage:
 *   node scripts/intake/backfill-estate-ledger-projection.mjs            # dry-run (default)
 *   node scripts/intake/backfill-estate-ledger-projection.mjs --apply
 */
import dotenv from 'dotenv';
dotenv.config({ path: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.env', override: true });
import { createSupabaseServiceClient } from '../../lib/supabase-client.js';
import { recordVerdict } from '../../lib/intake/conversion-ledger.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — the estate source tables are
// ongoing intake pools (drain-intake.mjs keeps draining into them), not a frozen historical
// corpus; a capped read here would silently leave rows past 1000 unprojected with no error.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;

// The 3 estate source tables (the 4th pool, ehg_folder, has no source rows).
export const ESTATE_SOURCE_TABLES = ['eva_todoist_intake', 'eva_youtube_intake', 'eva_claude_code_intake'];

/** PURE: extract the projection {ledger_id, classification} from a source row's raw_data, or null. */
export function extractProjection(row) {
  const raw = (row && row.raw_data && typeof row.raw_data === 'object' && !Array.isArray(row.raw_data)) ? row.raw_data : {};
  const ledger_id = raw.conversion_ledger_id || null;
  const classification = raw.disposition_classification || null;
  if (!ledger_id || !classification) return null;
  return { source_id: row.id, ledger_id, classification };
}

async function loadProjectable(sb, table) {
  let rows;
  try {
    rows = await fetchAllPaginated(() => sb.from(table).select('id, raw_data').order('id', { ascending: true }));
  } catch (e) {
    throw new Error(`load ${table}: ${e.message}`);
  }
  return rows.map((r) => extractProjection(r)).filter(Boolean).map((p) => ({ ...p, table }));
}

async function main() {
  const sb = createSupabaseServiceClient();
  console.log(`\n=== estate ledger projection backfill (${DRY_RUN ? 'DRY-RUN — zero writes' : 'APPLY'}) ===`);
  const loaded = await Promise.all(ESTATE_SOURCE_TABLES.map((t) => loadProjectable(sb, t)));
  const items = loaded.flat();
  console.log(`   projectable source rows: ${ESTATE_SOURCE_TABLES.map((t, i) => `${t}=${loaded[i].length}`).join(', ')} | total=${items.length}`);

  let updated = 0, alreadyProjected = 0, orphanBackPointer = 0, failed = 0;
  const verdictDist = {};
  for (const it of items) {
    verdictDist[it.classification] = (verdictDist[it.classification] || 0) + 1;
    // Read current ledger state so idempotency (already-projected) is observable + reportable.
    const { data: cur, error: rdErr } = await sb.from('conversion_ledger')
      .select('id, triage_verdict').eq('id', it.ledger_id).maybeSingle();
    if (rdErr) { console.warn(`   ⚠️  read ${it.ledger_id}: ${rdErr.message}`); failed++; continue; }
    if (!cur) { orphanBackPointer++; continue; } // back-pointer references a missing ledger row
    if (cur.triage_verdict === it.classification) { alreadyProjected++; continue; }
    if (DRY_RUN) { updated++; continue; }
    try {
      await recordVerdict(it.ledger_id, { triage_verdict: it.classification }, { client: sb });
      updated++;
    } catch (e) { console.error(`   ❌ ${it.ledger_id}: ${e.message}`); failed++; }
  }

  console.log('\n--- projection plan ---');
  console.log('   verdict distribution :', JSON.stringify(verdictDist));
  console.log(`   ${DRY_RUN ? 'would update' : 'updated'}     : ${updated}`);
  console.log(`   already-projected    : ${alreadyProjected}  (idempotent)`);
  console.log(`   orphan back-pointer  : ${orphanBackPointer}  (no ledger row)`);
  console.log(`   failed               : ${failed}`);
  if (DRY_RUN) console.log('\n   DRY-RUN: zero writes. Re-run with --apply to project the verdicts onto the ledger.');
}

const invokedDirectly = process.argv[1] && /backfill-estate-ledger-projection\.mjs$/.test(process.argv[1]);
if (invokedDirectly) main().catch((e) => { console.error('backfill FAILED:', e?.stack || e); process.exit(1); });
