#!/usr/bin/env node
/**
 * Protocol publication audit — SD-LEO-INFRA-PROTOCOL-PUBLICATION-PIPELINE-001 (FR-1).
 *
 * Asserts the publication-pipeline integrity invariants:
 *   1. COMPLETENESS — every leo_protocol_sections row carries an explicit
 *      metadata.publication_status in {runtime, file, retired} (0 ambiguous).
 *   2. MAPPING INTEGRITY — every section_type referenced by the two
 *      section-file-mapping JSONs exists in the DB (drift detection), and
 *      every dark section (unmapped + no target_file) is explicitly classified.
 *
 * Exit codes: 0 = all invariants hold; 1 = violations (listed on stdout).
 * Usage: npm run protocol:pub-audit   |   node scripts/protocol-publication-audit.cjs [--json]
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

const VALID_STATUSES = new Set(['runtime', 'file', 'retired']);

/**
 * Pure invariant evaluation (exported for unit tests — no DB/IO).
 * @param {Array<{id:number,section_type:string,target_file:string|null,metadata:object|null}>} rows
 * @param {Set<string>} mappedTypes - section_types referenced by either mapping JSON
 * @returns {{unclassified:Array, invalidStatus:Array, mappingDrift:string[], darkUnreviewed:Array, counts:Object, ok:boolean}}
 */
function evaluatePublicationInvariants(rows, mappedTypes) {
  const unclassified = [];
  const invalidStatus = [];
  const darkUnreviewed = [];
  const counts = { runtime: 0, file: 0, retired: 0 };
  const dbTypes = new Set();

  for (const r of rows) {
    dbTypes.add(r.section_type);
    const status = r.metadata && r.metadata.publication_status;
    if (!status) {
      unclassified.push({ id: r.id, section_type: r.section_type });
      continue;
    }
    if (!VALID_STATUSES.has(status)) {
      invalidStatus.push({ id: r.id, status });
      continue;
    }
    counts[status]++;
    const isDark = !r.target_file && !mappedTypes.has(r.section_type);
    if (isDark && status === 'file' && !(r.metadata.publication_note || '').length) {
      darkUnreviewed.push({ id: r.id, section_type: r.section_type });
    }
  }

  const mappingDrift = [...mappedTypes].filter((t) => !dbTypes.has(t));
  const ok = unclassified.length === 0 && invalidStatus.length === 0 && mappingDrift.length === 0;
  return { unclassified, invalidStatus, mappingDrift, darkUnreviewed, counts, ok };
}

function loadMappedTypes(repoRoot) {
  const mapped = new Set();
  for (const file of ['scripts/section-file-mapping.json', 'scripts/section-file-mapping-digest.json']) {
    const m = JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8'));
    for (const f of Object.values(m)) (f.sections || []).forEach((s) => mapped.add(s));
  }
  return mapped;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const sb = createSupabaseServiceClient();
  const repoRoot = path.resolve(__dirname, '..');
  const mappedTypes = loadMappedTypes(repoRoot);

  const { data: rows, error } = await sb
    .from('leo_protocol_sections')
    .select('id, section_type, target_file, metadata');
  if (error) throw new Error(`leo_protocol_sections read failed: ${error.message}`);

  const result = evaluatePublicationInvariants(rows, mappedTypes);

  if (asJson) {
    console.log(JSON.stringify({ total: rows.length, ...result }, null, 2));
  } else {
    console.log(`Protocol publication audit — ${rows.length} sections`);
    console.log(`  runtime: ${result.counts.runtime}  file: ${result.counts.file}  retired: ${result.counts.retired}`);
    if (result.unclassified.length) {
      console.log(`  ❌ UNCLASSIFIED (${result.unclassified.length}):`);
      result.unclassified.forEach((u) => console.log(`     - id=${u.id} ${u.section_type}`));
    }
    if (result.invalidStatus.length) {
      console.log(`  ❌ INVALID STATUS (${result.invalidStatus.length}):`);
      result.invalidStatus.forEach((u) => console.log(`     - id=${u.id} status=${u.status}`));
    }
    if (result.mappingDrift.length) {
      console.log(`  ❌ MAPPING DRIFT — mapped section_types absent from DB (${result.mappingDrift.length}):`);
      result.mappingDrift.forEach((t) => console.log(`     - ${t}`));
    }
    if (result.darkUnreviewed.length) {
      console.log(`  ⚠️  dark 'file' sections missing a publication_note (${result.darkUnreviewed.length}) — advisory`);
    }
    console.log(result.ok ? '  ✅ all invariants hold' : '  ❌ violations found');
  }
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = { evaluatePublicationInvariants, VALID_STATUSES, loadMappedTypes };

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
