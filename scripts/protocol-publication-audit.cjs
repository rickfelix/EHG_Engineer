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
 *   3. CONTENT UNIQUENESS (SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001, FR-3c) — no two rows share
 *      byte-identical content. CONTENT-HASH-KEYED, not section_type-constraint-keyed: a live
 *      duplicate pair ({544,545}, "handoff_precheck" x2) shared one section_type and evaded the
 *      DB's existing uniqueness constraint entirely, and the archived, inactive anchor_topic-keyed
 *      LINT-ANCHOR-001 would not have caught it either (anchor_topic is NULL on all 3 measured
 *      duplicate families). This check groups by md5(content) directly, independent of
 *      section_type or anchor_topic.
 *
 * Exit codes: 0 = all invariants hold; 1 = violations (listed on stdout); 2 = the audit itself
 * could not complete (DB/infra error) -- fail-open, mirrors check-claude-md-drift.cjs's contract,
 * since this check reads the live DB and must not redden a commit on a transient error or a
 * concurrent session's in-flight write (SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001, FR-3d).
 * Usage: npm run protocol:pub-audit   |   node scripts/protocol-publication-audit.cjs [--json]
 */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

/**
 * SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 (FR-3c): pure content-uniqueness evaluator, exported for
 * unit tests -- no DB/IO. Groups rows by md5(content), independent of section_type or
 * anchor_topic, so a same-section_type duplicate pair (the {544,545} shape) is caught the same
 * way a cross-section_type one would be.
 * @param {Array<{id:number,section_type:string,content:string|null}>} rows
 * @returns {{duplicateFamilies: Array<{hash:string, ids:number[], section_types:string[]}>, ok:boolean}}
 */
function evaluateContentUniqueness(rows) {
  const byHash = new Map();
  for (const r of rows) {
    const content = r.content || '';
    if (!content.trim()) continue; // empty content is not a meaningful duplicate signal
    const hash = crypto.createHash('md5').update(content).digest('hex');
    if (!byHash.has(hash)) byHash.set(hash, []);
    byHash.get(hash).push(r);
  }
  const duplicateFamilies = [];
  for (const [hash, group] of byHash) {
    if (group.length > 1) {
      duplicateFamilies.push({
        hash,
        ids: group.map((r) => r.id),
        section_types: [...new Set(group.map((r) => r.section_type))],
      });
    }
  }
  return { duplicateFamilies, ok: duplicateFamilies.length === 0 };
}

/**
 * SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 (EXEC-phase security-agent finding S-3): section_type is
 * caller-writable through the /learn auto-approve pipeline with no format constraint (0/286 rows
 * contain '::' today, but nothing prevents a future one). This script's stdout now lands in a
 * GitHub Actions log via .github/workflows/protocol-publication-audit.yml, where a literal '::'
 * sequence is parsed as a workflow command -- neutralize it before printing any row-derived
 * value, closing the annotation-spoofing/log-suppression surface at negligible cost.
 */
function escapeForCiLog(value) {
  return String(value).replace(/::/g, ': :');
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

  // warnIfCapTruncated: leo_protocol_sections is a curated, operationally small
  // (dozens-to-low-hundreds of rows) protocol-documentation config table, not a growing event
  // stream -- a full-table read is correct by design (evaluateContentUniqueness needs every
  // row's content). Tripwired rather than a bare unbounded select() so a future growth past the
  // PostgREST page cap fails loudly instead of silently under-scanning.
  const { warnIfCapTruncated } = await import('../lib/db/fetch-all-paginated.mjs');
  const { data: rawRows, error } = await sb
    .from('leo_protocol_sections')
    .select('id, section_type, target_file, content, metadata');
  if (error) throw new Error(`leo_protocol_sections read failed: ${error.message}`);
  const rows = warnIfCapTruncated(rawRows, 'protocol-publication-audit:leo_protocol_sections');

  const result = evaluatePublicationInvariants(rows, mappedTypes);
  const uniqueness = evaluateContentUniqueness(rows);
  const ok = result.ok && uniqueness.ok;

  if (asJson) {
    console.log(JSON.stringify({ total: rows.length, ...result, uniqueness, ok }, null, 2));
  } else {
    console.log(`Protocol publication audit — ${rows.length} sections`);
    console.log(`  runtime: ${result.counts.runtime}  file: ${result.counts.file}  retired: ${result.counts.retired}`);
    if (result.unclassified.length) {
      console.log(`  ❌ UNCLASSIFIED (${result.unclassified.length}):`);
      result.unclassified.forEach((u) => console.log(`     - id=${u.id} ${escapeForCiLog(u.section_type)}`));
    }
    if (result.invalidStatus.length) {
      console.log(`  ❌ INVALID STATUS (${result.invalidStatus.length}):`);
      result.invalidStatus.forEach((u) => console.log(`     - id=${u.id} status=${escapeForCiLog(u.status)}`));
    }
    if (result.mappingDrift.length) {
      console.log(`  ❌ MAPPING DRIFT — mapped section_types absent from DB (${result.mappingDrift.length}):`);
      result.mappingDrift.forEach((t) => console.log(`     - ${escapeForCiLog(t)}`));
    }
    if (result.darkUnreviewed.length) {
      console.log(`  ⚠️  dark 'file' sections missing a publication_note (${result.darkUnreviewed.length}) — advisory`);
    }
    if (uniqueness.duplicateFamilies.length) {
      console.log(`  ❌ DUPLICATE CONTENT (${uniqueness.duplicateFamilies.length} famil${uniqueness.duplicateFamilies.length === 1 ? 'y' : 'ies'}):`);
      uniqueness.duplicateFamilies.forEach((f) => console.log(`     - ids=[${f.ids.join(',')}] section_types=[${f.section_types.map(escapeForCiLog).join(',')}]`));
    }
    console.log(ok ? '  ✅ all invariants hold' : '  ❌ violations found');
  }
  process.exitCode = ok ? 0 : 1;
}

module.exports = { evaluatePublicationInvariants, evaluateContentUniqueness, VALID_STATUSES, loadMappedTypes, escapeForCiLog };

if (require.main === module) {
  // SD-LEO-INFRA-PROTOCOL-SSOT-DEDUP-001 (FR-3d): this check reads the live DB and is
  // non-hermetic -- a concurrent session's in-flight write, a transient connection error, or a
  // missing section-file-mapping file must never redden a commit the same way a genuine
  // invariant violation does. Mirrors check-claude-md-drift.cjs's existing 0/1/2 contract: 0=ok,
  // 1=genuine violations (evaluatePublicationInvariants ran and found something), 2=could not
  // even complete the evaluation (fail-open).
  main().catch((e) => {
    console.error(`protocol-publication-audit: INTERNAL ERROR (fail-open) — ${e && e.message}`);
    process.exitCode = 2;
  });
}
