/**
 * Catch-layer-migration report — the chairman's success metric for the
 * governance-situation loop (SD-LEO-INFRA-GOVERNANCE-SITUATION-CONTINUOUS-001 FR-4).
 *
 * Read-only over issue_patterns rows carrying the metadata convention
 * {class, catch_layer}. The loop is WORKING when catches migrate DOWN over time
 * (chairman → solomon → probe) at stable-or-falling severity: fewer chairman-catches,
 * more probe-catches.
 *
 * Usage: node scripts/governance/catch-layer-migration-report.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { SITUATION_CLASSES, CATCH_LAYERS } from '../../lib/governance/situation-capture.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — issue_patterns is a growing
// table and this report accumulates ALL governance-situation rows ever captured; a
// PostgREST-capped read would silently understate the chairman's success metric (fewer
// chairman-catches over time could just be truncation, not real migration).
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function monthOf(iso) {
  return typeof iso === 'string' && iso.length >= 7 ? iso.slice(0, 7) : 'unknown';
}

async function main() {
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('issue_patterns')
      .select('id, issue_summary, severity, status, occurrence_count, metadata')
      .eq('category', 'governance_situation')
      .order('id', { ascending: true }));
  } catch (e) {
    console.error(`Fatal: issue_patterns read failed: ${e.message}`);
    process.exit(1);
  }

  const rows = (data || []).filter((r) => SITUATION_CLASSES.includes(r.metadata?.class));
  const byClass = {};
  const byLayer = Object.fromEntries(CATCH_LAYERS.map((l) => [l, 0]));
  const trend = {}; // month -> layer -> count

  for (const r of rows) {
    const cls = r.metadata.class;
    const layer = CATCH_LAYERS.includes(r.metadata.catch_layer) ? r.metadata.catch_layer : 'chairman';
    byClass[cls] = (byClass[cls] || 0) + 1;
    byLayer[layer] += 1;
    const m = monthOf(r.metadata.first_seen_at);
    trend[m] = trend[m] || Object.fromEntries(CATCH_LAYERS.map((l) => [l, 0]));
    trend[m][layer] += 1;
  }

  console.log('Catch-Layer Migration Report (governance-situation loop)');
  console.log('='.repeat(60));
  console.log(`Situations captured: ${rows.length}`);
  console.log('\nBy class:');
  for (const cls of SITUATION_CLASSES) console.log(`  ${cls.padEnd(20)} ${byClass[cls] || 0}`);
  console.log('\nBy catch layer (migration target: chairman -> solomon -> probe):');
  for (const layer of CATCH_LAYERS) console.log(`  ${layer.padEnd(10)} ${byLayer[layer]}`);
  console.log('\nTrend by month:');
  for (const m of Object.keys(trend).sort()) {
    const t = trend[m];
    console.log(`  ${m}  chairman=${t.chairman} solomon=${t.solomon} probe=${t.probe}`);
  }
  const open = rows.filter((r) => r.status === 'active' || r.status === 'assigned').length;
  console.log(`\nOpen (active/assigned): ${open} | Resolved: ${rows.length - open}`);

  // Machine-readable summary for digest composition.
  console.log(`CATCH_LAYER_SUMMARY=${JSON.stringify({ total: rows.length, by_layer: byLayer, by_class: byClass, open })}`);
}

main();
