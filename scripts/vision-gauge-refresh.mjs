#!/usr/bin/env node
/**
 * SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-2) — refresh the vision BUILD-completeness gauge.
 *
 * Computes the Vision Denominator Registry gauge (lib/vision/vdr-registry.js) and APPENDS a
 * historized snapshot to the vision_build_gauge table (the auditable, trend-able record Adam
 * works down). This is the runtime invoker for the VDR lib + the writer behind the Adam
 * exec-summary's live read and the Chairman-UI tile.
 *
 * Usage:
 *   node scripts/vision-gauge-refresh.mjs            # compute + persist a snapshot
 *   node scripts/vision-gauge-refresh.mjs --dry-run  # compute + print, do NOT write
 *
 * Fail-soft: if the vision doc is unavailable the snapshot is still written with available=false
 * (so the trend honestly records "gauge unavailable" rather than a gap). Exit 0 on success,
 * 1 on a hard DB/compute error.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { computeBuildGauge } from '../lib/vision/vdr-registry.js';
// SD-LEO-INFRA-VDR-GREP-SEAM-CROSSREPO-001: the cross-repo code-grep seam + repo-root map were extracted
// from this file into a SINGLE shared source so scripts/adam-exec-summary.mjs injects the identical seam.
import { makeDefaultGrepSeam } from '../lib/vision/vdr-grep-seam.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

// SD-LEO-INFRA-VISION-GAUGE-HISTORIZE-001 (FR-4): the append shape is a PURE, exported function so the
// historization contract (exactly the 8 writable columns; id + measured_at default at the DB) is
// unit-testable WITHOUT a live DB — and so the fail-soft invariant holds: a doc-unavailable gauge is
// still RECORDED (available=false, overall_pct=null), never a missing row.
export function buildGaugeRow(gauge) {
  const g = gauge || {};
  return {
    overall_pct: g.overall_pct ?? null,        // NULL when unavailable — never a fabricated 0
    available: !!g.available,
    per_layer: g.per_layer || {},
    components: g.components || [],
    denominator: g.denominator || 0,
    total_capabilities: g.total_capabilities || 0,
    unknown_count: g.unknown_count || 0,
    source: 'vdr',
  };
}
// Shared seam: git grep over tracked files (archive/test excluded); an absent/unreadable checkout
// returns accessible:false so the probe degrades to 'unknown' (honest — never guessed). The 'ehg'
// sibling root is overridable via VDR_EHG_REPO_ROOT (default <repo>/../ehg).
const grep = makeDefaultGrepSeam({ engineerRoot: REPO_ROOT });

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('[vision-gauge] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required'); process.exit(1); }
  const supabase = createClient(url, key);

  let gauge;
  try {
    // SD-LEO-INFRA-VISION-GAUGE-HISTORIZE-001 (FR-2/FR-3): historize the SAME gauge the chairman sees.
    // scripts/adam-exec-summary.mjs computes the headline % with visionSource:true (the re-anchorable
    // ladder pointer added by SD-LEO-INFRA-VISION-LADDER-V1-001 FR-5). This writer pre-dated that switch
    // and still read the default EHG-VISION.md markdown source — so its persisted snapshots would diverge
    // from the displayed headline (and the trend that reads them would be meaningless). Mirror the email's
    // source so the historized number and the headline number are the same gauge. Still fail-soft.
    gauge = await computeBuildGauge({ io: { supabase, grep }, visionSource: true });
  } catch (e) {
    console.error('[vision-gauge] compute failed: ' + (e?.message || e));
    process.exit(1);
  }

  const row = buildGaugeRow(gauge);

  console.log(`[vision-gauge] available=${row.available} overall=${row.overall_pct == null ? 'n/a' : row.overall_pct + '%'} ` +
    `probeable=${row.denominator}/${row.total_capabilities} unknown=${row.unknown_count}`);
  console.log('[vision-gauge] per_layer=' + JSON.stringify(row.per_layer));
  if (!gauge.coherence?.ok) {
    console.warn('[vision-gauge] WARN registry<->vision drift: ' + JSON.stringify(gauge.coherence));
  }

  if (dryRun) { console.log('[vision-gauge] --dry-run: not persisted'); return; }

  // vision_build_gauge is created by 20260614_vision_build_gauge.sql, a chairman-gated migration
  // not yet applied to prod, so it is absent from the schema snapshot until apply (the lint
  // resolves automatically once the snapshot is regenerated post-apply).
  const { error } = await supabase.from('vision_build_gauge').insert(row); // schema-lint-disable-line
  if (error) {
    // Table may not exist yet (migration not applied) — surface clearly, don't crash silently.
    console.error('[vision-gauge] insert failed (is the migration applied?): ' + error.message);
    process.exit(1);
  }
  console.log('[vision-gauge] snapshot persisted to vision_build_gauge');
}

// Entrypoint guard (FR-4): only run when executed directly (node scripts/vision-gauge-refresh.mjs /
// npm run vision:gauge), so importing buildGaugeRow in a unit test does NOT connect to the DB or exit.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => { console.error('[vision-gauge] UNHANDLED: ' + (e?.message || e)); process.exit(1); });
}
