#!/usr/bin/env node
// QF-20260829-634 binding sequencing amendment (Solomon 69ecbca0): before the
// leg-3 fail-closed flip in lib/eva/reality-gates.js can ship, every boundary in
// the designated-gated-boundary registry (BOUNDARY_CONFIG keys) must have either
// a canonical gate_boundary_config row or an explicit empty-requirements marker
// (a row with required_artifacts: []). This script is the re-runnable evidence
// for that census -- run it before any future change to the designated-boundary
// registry, not just once at ship time.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { BOUNDARY_CONFIG } from '../../lib/eva/reality-gates.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const designated = Object.keys(BOUNDARY_CONFIG);
  const { data: rows, error } = await supabase
    .from('gate_boundary_config')
    .select('from_stage, to_stage, required_artifacts');

  if (error) {
    console.error('Census FAILED — could not read gate_boundary_config:', error.message);
    process.exit(1);
  }

  const covered = new Map();
  for (const row of rows || []) {
    covered.set(`${row.from_stage}->${row.to_stage}`, row.required_artifacts || []);
  }

  const gaps = [];
  const ok = [];
  for (const key of designated) {
    if (covered.has(key)) {
      const artifacts = covered.get(key);
      ok.push(`${key} -- covered (${artifacts.length === 0 ? 'explicit empty-requirements marker' : `${artifacts.length} required artifact(s)`})`);
    } else {
      gaps.push(key);
    }
  }

  console.log('QF-20260829-634 boundary completeness census');
  console.log('='.repeat(60));
  console.log(`Designated boundaries (BOUNDARY_CONFIG): ${designated.length}`);
  console.log(`gate_boundary_config rows read: ${(rows || []).length}`);
  console.log('');
  for (const line of ok) console.log(`  OK   ${line}`);
  for (const key of gaps) console.log(`  GAP  ${key} -- NO canonical row, NO empty-requirements marker. Leg-3 fail-closed will BLOCK this boundary on every crossing until resolved.`);
  console.log('');

  if (gaps.length > 0) {
    console.log(`CENSUS FAILED: ${gaps.length} gap(s) found. Do NOT ship the leg-3 fail-closed flip until each gap has a canonical row (or an explicit required_artifacts: [] marker if it genuinely needs none).`);
    process.exit(1);
  }

  console.log('CENSUS PASSED: every designated boundary has a canonical row. The leg-3 fail-closed flip is a safe no-op today.');
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
