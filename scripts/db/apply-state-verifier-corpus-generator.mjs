#!/usr/bin/env node
/**
 * SD-LEO-INFRA-APPLY-STATE-VERIFIER-002 -- corpus generator.
 *
 * ⚠️  NOT INVOKED BY CI. Manual/on-demand regeneration tool only.
 *
 * Captures a frozen, DB-free regression corpus for scripts/verify-migration-apply-state.mjs's
 * normalizer (normalizeSqlBody / normalizeTriggerWhenClause): one entry per function/trigger
 * object currently owned by a known-applied migration (schema_migrations_applied success rows),
 * pairing each object's migration-file text with its live-captured definition text.
 *
 * Reuses the verifier's OWN pipeline end to end -- extractDdlFacts(), foldLifecycle(),
 * resolveLive() -- rather than a bespoke query shape, so the corpus reflects exactly what the
 * real verifier would compare in production (PLAN-phase TESTING finding TR-4).
 *
 * Usage: node scripts/db/apply-state-verifier-corpus-generator.mjs
 * Output: tests/fixtures/apply-state-verifier-corpus/corpus.json
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listApplied, normalizeMigrationPath } from '../../lib/migration-audit-reader.js';
import {
  extractDdlFacts,
  foldLifecycle,
  resolveLive,
  orderMigrations,
  normalizeSqlBody,
  normalizeTriggerWhenClause,
  extractTriggerWhenClause,
} from '../verify-migration-apply-state.mjs';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts/db/ -> repo root is two levels up (REPO_ROOT is not exported by verify-migration-apply-state.mjs).
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_PATH = path.join(REPO_ROOT, 'tests', 'fixtures', 'apply-state-verifier-corpus', 'corpus.json');
const CONFIRMED_FALSE_POSITIVE = {
  file: 'database/chairman-gated/20260912_sd_mutation_audit_actor_threading.sql',
  name: 'trg_sd_mutation_audit',
  note: 'Confirmed live false positive (SD-LEO-INFRA-AUDIT-ACTOR-THREADING-001, Alpha-3): pre-fix, this identical live trigger read BODY_MISMATCH due to case-folding + implicit-cast reconstruction gaps closed by SD-LEO-INFRA-APPLY-STATE-VERIFIER-001 (PR #8973).',
};

async function main() {
  const rows = await listApplied({ success: true, limit: 1000 });
  const distinctPaths = new Set(rows.map((r) => normalizeMigrationPath(r.migration_path)));

  const resolvedFiles = [];
  const unresolved = [];
  for (const p of distinctPaths) {
    const full = path.join(REPO_ROOT, p);
    try {
      readFileSync(full, 'utf8');
      resolvedFiles.push(p);
    } catch {
      unresolved.push(p);
    }
  }
  console.log(`Known-applied ledger: ${rows.length} success rows / ${distinctPaths.size} distinct paths.`);
  console.log(`Resolved on disk: ${resolvedFiles.length}. Unresolved (${unresolved.length}):`);
  for (const p of unresolved) console.log(`  UNRESOLVED: ${p}`);

  const ordered = orderMigrations(resolvedFiles);
  const fileFacts = ordered.map((file) => ({ file, ...extractDdlFacts(readFileSync(path.join(REPO_ROOT, file), 'utf8')) }));
  const { expected } = foldLifecycle(fileFacts);

  const funcOrTrig = [...expected.values()].filter((o) => o.cls === 'function' || o.cls === 'trigger');
  console.log(`Surviving function/trigger objects owned by a known-applied file: ${funcOrTrig.length}.`);

  const { createDatabaseClient } = await import('../lib/supabase-connection.js');
  const connectionString = process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL || undefined;
  const client = await createDatabaseClient('ehg', connectionString ? { connectionString } : {});
  let live, liveFunctionBodies, liveTriggerDefs;
  try {
    ({ live, liveFunctionBodies, liveTriggerDefs } = await resolveLive(client, expected));
  } finally {
    await client.end();
  }

  function compare(cls, fileText, liveText) {
    if (cls === 'function') return normalizeSqlBody(fileText) === normalizeSqlBody(liveText);
    return (
      normalizeTriggerWhenClause(extractTriggerWhenClause(fileText) ?? '') ===
      normalizeTriggerWhenClause(extractTriggerWhenClause(liveText) ?? '')
    );
  }

  const capturedAt = new Date().toISOString();
  const entries = [];
  const excludedCurrentMismatches = [];
  for (const o of funcOrTrig) {
    if (!live.has(`${o.cls}:${o.name}`)) continue; // not live -- not "known-applied and currently correct", skip
    const liveText = o.cls === 'function' ? liveFunctionBodies.get(o.name) : liveTriggerDefs.get(o.name);
    if (liveText == null || o.body == null) continue; // defensive: no body captured either side
    const isConfirmedFP = o.cls === 'trigger' && o.name === CONFIRMED_FALSE_POSITIVE.name && o.file === CONFIRMED_FALSE_POSITIVE.file;

    // PLAN-phase TESTING (post-generation finding, see scratchpad root-cause investigation):
    // "in the known-applied ledger" does NOT guarantee the file's own text still matches the
    // CURRENT live definition -- a later migration/hotfix outside this SD's known-applied fold
    // can legitimately replace an object's body, and the normalizer itself still has un-fixed
    // gaps (redundant-parenthesis removal, and a quote/dollar-quote scanner state issue on at
    // least one large body) beyond what SD-001 closed. Asserting "must match" on a currently-
    // mismatching pair would pin a FALSE invariant. Exclude and log by name instead of asserting
    // it -- these are real findings routed to harness_backlog, not silently dropped.
    if (!compare(o.cls, o.body, liveText) && !isConfirmedFP) {
      excludedCurrentMismatches.push({ id: `${o.cls}:${o.name}`, source_migration_path: o.file });
      continue;
    }

    entries.push({
      id: `${o.cls}:${o.name}`,
      class: o.cls,
      name: o.name,
      source_migration_path: o.file,
      file_text: o.body,
      live_text: liveText,
      captured_at: capturedAt,
      ...(isConfirmedFP ? { confirmed_false_positive: true, note: CONFIRMED_FALSE_POSITIVE.note } : {}),
    });
  }

  console.log(`Excluded ${excludedCurrentMismatches.length} currently-mismatching entries (real findings, not corpus material):`);
  for (const e of excludedCurrentMismatches) console.log(`  EXCLUDED: ${e.id} (${e.source_migration_path})`);

  const confirmedCount = entries.filter((e) => e.confirmed_false_positive).length;
  if (confirmedCount !== 1) {
    console.error(`WARNING: expected exactly 1 confirmed_false_positive entry, found ${confirmedCount}.`);
  }

  const fixture = {
    generator: 'scripts/db/apply-state-verifier-corpus-generator.mjs',
    generated_at: capturedAt,
    ledger_success_rows: rows.length,
    ledger_distinct_paths: distinctPaths.size,
    resolved_on_disk: resolvedFiles.length,
    unresolved_paths: unresolved,
    excluded_current_mismatches: excludedCurrentMismatches,
    entry_count: entries.length,
    entries,
  };

  mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(fixture, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${entries.length} entries to ${OUT_PATH}`);
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
