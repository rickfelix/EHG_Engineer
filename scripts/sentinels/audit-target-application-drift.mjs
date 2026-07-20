#!/usr/bin/env node
/**
 * Portfolio-wide target_application drift audit.
 *
 * SD-LEO-INFRA-FAIL-CLOSED-VENTURE-001-B / PA-6 / FR-B6.
 * Promoted from scripts/one-off/_audit-target-application-drift.mjs to a
 * recurring CI sentinel. Runs weekly via GitHub Actions
 * (.github/workflows/audit-target-application-drift.yml).
 *
 * Usage:
 *   node scripts/sentinels/audit-target-application-drift.mjs           # human-readable
 *   node scripts/sentinels/audit-target-application-drift.mjs --json    # JSON output for CI artifact
 *   node scripts/sentinels/audit-target-application-drift.mjs --strict  # non-zero exit when drift > 0
 *
 * Output (JSON mode):
 *   {
 *     timestamp, at_risk_ventures: [...], auto_sds_total, by_venture: {...},
 *     drift: { total, samples: [...] }, completed_drift: [...]
 *   }
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
dotenv.config();
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9 — this is a weekly CI drift
// sentinel whose whole purpose is comprehensive coverage (--strict gates CI on drift.total,
// derived from autoSds below); a PostgREST-capped read would silently under-report drift.
// Both ventures and strategic_directives_v2 are growing tables — paginate to completion.
import { fetchAllPaginated } from '../../lib/db/fetch-all-paginated.mjs';

const args = process.argv.slice(2);
const JSON_MODE = args.includes('--json');
const STRICT_MODE = args.includes('--strict');

const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function log(...args) {
  if (!JSON_MODE) console.log(...args);
}

log('=== Portfolio-wide target_application drift audit (PA-6) ===\n');

const report = {
  timestamp: new Date().toISOString(),
  at_risk_ventures: [],
  auto_sds_total: 0,
  by_venture: {},
  drift: { total: 0, samples: [] },
  completed_drift: [],
  registry_entries: 0,
};

// 1. At-risk ventures (pipeline_mode='building' AND repo_url IS NULL)
let atRisk;
try {
  atRisk = await fetchAllPaginated(() => sb
    .from('ventures')
    .select('id, name, current_lifecycle_stage, pipeline_mode, repo_url, deployment_url, archetype, status')
    .is('repo_url', null)
    .eq('pipeline_mode', 'building')
    .order('id', { ascending: true }));
} catch (e) { log('at-risk ventures query failed: ' + e.message); atRisk = []; }
report.at_risk_ventures = (atRisk || []).map((v) => ({
  id: v.id,
  name: v.name,
  current_lifecycle_stage: v.current_lifecycle_stage,
  archetype: v.archetype,
  status: v.status,
}));
log(`At-risk ventures (pipeline_mode='building' AND repo_url IS NULL): ${atRisk?.length || 0}`);
for (const v of atRisk || []) {
  log(`  - ${(v.name || '?').padEnd(30)} | stage ${v.current_lifecycle_stage} | ${v.archetype} | status=${v.status}`);
}

// 2. SDs from auto-pipeline-stage-17 with target_application=EHG
log('\n=== SDs with auto-pipeline-stage-17 generation_source AND target_application=EHG ===');
let autoSds;
try {
  autoSds = await fetchAllPaginated(() => sb
    .from('strategic_directives_v2')
    .select('sd_key, title, status, target_application, metadata, parent_sd_id')
    .eq('target_application', 'EHG')
    .filter('metadata->>generation_source', 'eq', 'auto-pipeline-stage-17-doc-gen')
    .order('id', { ascending: true }));
} catch (e) { log('auto-pipeline SD query failed: ' + e.message); autoSds = []; }
report.auto_sds_total = autoSds?.length || 0;
log(`Total: ${report.auto_sds_total}`);

const byVenture = {};
for (const sd of autoSds || []) {
  const venture = sd.metadata?.venture_name || sd.metadata?.source_venture_name || sd.sd_key.split('-').slice(1, 3).join('-');
  byVenture[venture] = (byVenture[venture] || 0) + 1;
}
report.by_venture = byVenture;
log('By venture/prefix:');
for (const [k, v] of Object.entries(byVenture).sort((a, b) => b[1] - a[1])) {
  log(`  ${k.padEnd(40)} ${v}`);
}

// 3. Drift candidates: target_application=EHG but venture name != 'EHG'
log('\n=== Drift candidates: target_application=EHG but venture name != "EHG" ===');
const driftSamples = [];
for (const sd of autoSds || []) {
  const ventureId = sd.metadata?.source_venture_id || sd.metadata?.venture_id;
  if (!ventureId) continue;
  const { data: v } = await sb.from('ventures').select('name').eq('id', ventureId).maybeSingle();
  if (v && v.name && v.name.toLowerCase() !== 'ehg') {
    report.drift.total++;
    if (driftSamples.length < 20) driftSamples.push({ sd_key: sd.sd_key, venture: v.name, status: sd.status });
  }
}
report.drift.samples = driftSamples;
log(`Drift count: ${report.drift.total} SDs`);
for (const s of driftSamples) {
  log(`  ${s.sd_key.padEnd(70)} | venture=${s.venture} | status=${s.status}`);
}

// 4. Already-merged drift (most severe — corrective candidates)
log('\n=== Already-merged drift (most severe) ===');
for (const sd of autoSds || []) {
  if (sd.status !== 'completed') continue;
  const ventureId = sd.metadata?.source_venture_id || sd.metadata?.venture_id;
  if (!ventureId) continue;
  const { data: v } = await sb.from('ventures').select('name').eq('id', ventureId).maybeSingle();
  if (v && v.name && v.name.toLowerCase() !== 'ehg') {
    report.completed_drift.push({ sd_key: sd.sd_key, venture: v.name });
  }
}
log(`Completed (merged) drift SDs: ${report.completed_drift.length}`);
for (const c of report.completed_drift) {
  log(`  ${c.sd_key.padEnd(70)} | venture=${c.venture}`);
}

// 5. Registry context
try {
  const registry = JSON.parse(readFileSync('./applications/registry.json', 'utf8'));
  const apps = registry.applications || registry;
  const list = Array.isArray(apps) ? apps : Object.values(apps);
  report.registry_entries = list.length;
  log(`\n=== applications/registry.json: ${list.length} entries ===`);
  if (registry.last_updated) log(`last_updated: ${registry.last_updated}`);
  for (const a of list) log(`  ${(a.name || a.id || '?').padEnd(30)} | ${a.local_path || a.path || '-'}`);
} catch (e) {
  log('registry.json read error:', e.message);
}

if (JSON_MODE) {
  console.log(JSON.stringify(report, null, 2));
}

if (STRICT_MODE && report.drift.total > 0) {
  log(`\n[strict] drift detected (${report.drift.total} SDs) — exiting non-zero`);
  process.exit(1);
}
