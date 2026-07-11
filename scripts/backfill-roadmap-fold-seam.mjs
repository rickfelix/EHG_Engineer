#!/usr/bin/env node
// One-time backfill — SD-LEO-INFRA-ROADMAP-FOLD-SEAM-001 (FR-4).
//
// Records gate-tag wave dispositions for the nine ratified-but-waveless
// workstreams named in the plan-gap audit (Solomon verdict cd261597,
// 2026-07-11), and archives the superseded EVA Intake Roadmap row (ed12bf74 —
// standing 2026-06-13 chairman order that was never executed). Idempotent:
// applyWaveDisposition derives a deterministic source_id per workstream, so
// UNIQUE(wave_id, source_type, source_id) makes a second run a no-op; the
// archive is a status flip guarded by its current value.
//
// Placements are Solomon-PROPOSED gate tags flagged with provenance
// (disposition_source below) — reversible row-level edits the chairman can
// re-disposition at any time.
//
// Usage: node scripts/backfill-roadmap-fold-seam.mjs [--dry-run]

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { applyWaveDisposition } from '../lib/roadmap/wave-disposition.js';

const WAVE_1 = '8990e54c-9e0c-48ab-b488-917d523bdd9b'; // Wave 1: EHG Foundation
const WAVE_2 = 'e7585d66-b995-430a-a9e9-2d38976aada1'; // Wave 2: Revenue rails ready
const EVA_INTAKE_ROADMAP = 'ed12bf74-57c9-4ee0-a1b3-273bef11705c';
const DISPOSITION_SOURCE = 'plan-gap-backfill-20260711';

// The nine orphans, per the plan-gap audit's proposed placements.
const ORPHANS = [
  { key: 'operating-company-spine-core', title: 'Operating-company spine core (incl. sec-8 pipeline/CRM fold-in, ratified 07-10)', wave: WAVE_1 },
  { key: 'deep-challenge-26-stage-commission', title: '26-stage DEEP CHALLENGE commission (Stage-0 first, 07-10)', wave: WAVE_1 },
  { key: 's20-26-simulated-run-harness', title: 'S20-26 simulated-run harness (built + smoke-verified; run pending GO)', wave: WAVE_1 },
  { key: 'kill-gate-teeth-proof-regime', title: 'Kill-gate teeth-proof regime (designed 07-11; ALPHA on GO, BETA post seam fix)', wave: WAVE_1 },
  { key: 'apa-cluster', title: 'APA cluster (children A-D complete; E draft; chairman-fenced)', wave: WAVE_1 },
  { key: 'chairman-console-eva-meetings', title: 'Chairman console / EVA-run meetings / venture AI-CEO org vision (07-10)', wave: WAVE_1 },
  { key: 'deploy-pipeline', title: 'Venture deploy pipeline (parent completed; MarketLens live) — W3 entry-gate enabler', wave: WAVE_2 },
  { key: 'demand-distribution-engine', title: 'Demand/distribution engine (A-D complete; E gated on live venture)', wave: WAVE_2 },
  { key: 'venture-selection-fresh-start', title: 'Venture-selection method + 07-08 fresh-start pivot (produces the W3 gate candidate)', wave: WAVE_2 },
];

const dryRun = process.argv.includes('--dry-run');
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

let inserted = 0, existing = 0;
for (const o of ORPHANS) {
  if (dryRun) { console.log(`  [dry-run] would disposition "${o.title}" -> wave ${o.wave}`); continue; }
  const before = await supabase.from('roadmap_wave_items').select('id')
    .eq('wave_id', o.wave).eq('source_type', 'adam_direct')
    .contains('metadata', { source_key: o.key }).maybeSingle();
  const res = await applyWaveDisposition(supabase, {
    waveDisposition: { waveId: o.wave },
    sourceKey: o.key,
    title: o.title,
    dispositionSource: DISPOSITION_SOURCE,
  });
  if (before.data) existing += 1; else inserted += 1;
  console.log(`  ✓ ${before.data ? 'exists' : 'dispositioned'}: ${o.key} -> item ${res.itemId}`);
}

// Archive the superseded EVA Intake Roadmap (status flip, never a delete).
if (!dryRun) {
  const { data: row } = await supabase.from('strategic_roadmaps')
    .select('id,status').eq('id', EVA_INTAKE_ROADMAP).maybeSingle();
  if (!row) {
    console.log(`  ⚠ EVA Intake Roadmap ${EVA_INTAKE_ROADMAP} not found — skipping archive`);
  } else if (row.status === 'archived') {
    console.log('  ✓ EVA Intake Roadmap already archived (idempotent)');
  } else {
    const { error } = await supabase.from('strategic_roadmaps')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', EVA_INTAKE_ROADMAP);
    if (error) { console.error(`  ❌ archive failed: ${error.message}`); process.exit(1); }
    console.log('  ✓ EVA Intake Roadmap archived (status flip; content retained)');
  }
}

console.log(`\nBackfill ${dryRun ? 'DRY-RUN' : 'complete'}: ${inserted} inserted, ${existing} already present, ${ORPHANS.length} total.`);

// Enumeration proof (paste into the PR): every orphan has a disposition row.
if (!dryRun) {
  const { data: proof } = await supabase.from('roadmap_wave_items')
    .select('title,wave_id,metadata')
    .eq('source_type', 'adam_direct')
    .filter('metadata->>disposition_source', 'eq', DISPOSITION_SOURCE);
  console.log(`\nEnumeration (${(proof ?? []).length}/9 expected):`);
  for (const p of proof ?? []) console.log(`  - [${p.wave_id === WAVE_1 ? 'W1' : 'W2'}] ${p.title.slice(0, 90)}`);
}
