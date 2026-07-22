#!/usr/bin/env node
// @wire-check-exempt: read-only audit/probe classifier — no permanent runtime entry point by design
// (invoked ad-hoc for SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-A). scripts/audit/ is NOT in
// wire-check-gate.js EXCLUSION_PATTERNS (only tests/, scripts/one-off/, scripts/probes/), so this
// mirrors the marker-comment escape hatch the same way scripts/archive/one-time probes would.
/**
 * Venture data-capture table audit — SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-A (SD-0a, READ-ONLY).
 *
 * Resolves the "wired-vs-ghost + RLS-vs-empty" ambiguity for the venture data-capture tables.
 *
 * WHY A DEDICATED CLASSIFIER: a bare PostgREST `head:true` exact-count request returns
 * `count=null` WITH NO ERROR for a table that does not exist — indistinguishable from an
 * empty table on the count alone. The reliable existence signal is a real data select
 * (`.select('*').limit(1)`), which returns PGRST205 ("Could not find the table ... in the
 * schema cache") for an absent table. This script combines both: the limit-1 probe decides
 * EXISTS vs ABSENT, and the head/exact count supplies the row count for existing tables.
 *
 * CLASSIFICATION (see classifyTable):
 *   - not-exists                                   => GHOST        (table absent)
 *   - exists + rows>0 + production writer          => WIRED        (populated & written by product code)
 *   - exists + 0 rows + production writer           => EMPTY-WIRED  (wired but unpopulated — the interesting ghost-vs-empty case)
 *   - exists + NO production writer (test/archive)  => GHOST        (dead table — exists but nothing real writes it)
 *
 * The writer call-sites are a STATIC embedded map (CANDIDATES) captured from a codebase grep
 * (`.from('<t>').insert|upsert|update` + `INSERT INTO <t>`), each tagged with a `kind`:
 * 'production' (lib/, server/, non-archive scripts/) vs 'test'/'archive'/'docs'/'fixture'.
 * Only 'production' writers count toward WIRED. Keeping the map static keeps the classifier
 * deterministic and dependency-free; re-run the grep in the SD's STEP-1 to refresh it.
 *
 * ZERO WRITES: every DB call is a `.select(...)` (head or limit-1). No insert/update/upsert/delete.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

/** PostgREST error code meaning "relation absent from the schema cache". */
export const ABSENT_TABLE_CODE = 'PGRST205';

export const RLS_NOTE =
  'RLS policy state not directly queryable via PostgREST (no arbitrary-SQL RPC exposed); ' +
  'service-role head-count is authoritative for row-presence and existence is proven by the ' +
  'PGRST205-vs-no-error limit-1 probe.';

/** Writer-kind values that DO NOT count toward "wired". */
export const NON_PRODUCTION_WRITER_KINDS = new Set(['test', 'archive', 'docs', 'fixture']);

/**
 * Static candidate map: STEP-0 seed list ∪ STEP-1 codebase discovery.
 * `writers` are real write call-sites (insert/upsert/update / INSERT INTO) captured 2026-07-22.
 * `kind`: 'production' = lib/ | server/ | non-archive scripts/ ; otherwise test/archive/docs/fixture.
 */
export const CANDIDATES = [
  {
    table: 'stage_executions',
    fact_class: 'stage exec-path record',
    writers: [
      { file: 'lib/eva/stage-execution-worker.js', line: 2080, op: 'insert', kind: 'production' },
      { file: 'lib/eva/stage-execution-worker.js', line: 2112, op: 'update', kind: 'production' }, // heartbeat
      { file: 'lib/eva/stage-execution-worker.js', line: 2130, op: 'update', kind: 'production' }, // finalize
    ],
  },
  {
    table: 'venture_artifacts',
    fact_class: 'analysis artifacts',
    writers: [
      { file: 'server/routes/stage18.js', line: 84, op: 'insert', kind: 'production' },
      { file: 'server/routes/stage18.js', line: 158, op: 'insert', kind: 'production' },
      { file: 'lib/eva/artifact-versioning.js', line: 147, op: 'update', kind: 'production' },
      { file: 'lib/eva/artifact-persistence-service.js', line: 184, op: 'update', kind: 'production' },
      { file: 'lib/eva/qa/stitch-vision-qa.js', line: 377, op: 'update', kind: 'production' },
    ],
  },
  {
    table: 'workflow_executions',
    fact_class: 'workflow orchestration (adjacent to stage exec-path)',
    writers: [
      { file: 'lib/eva/stage-execution-worker.js', line: 4085, op: 'insert', kind: 'production' },
      { file: 'lib/eva/workers/health-monitor-worker.js', line: 118, op: 'insert', kind: 'production' },
      { file: 'lib/eva/workers/stage-advance-worker.js', line: 72, op: 'update', kind: 'production' },
    ],
  },
  {
    table: 'chairman_decisions',
    fact_class: 'venture decisions (chairman)',
    writers: [
      { file: 'lib/eva/chairman-decision-watcher.js', line: 503, op: 'insert', kind: 'production' },
      { file: 'lib/chairman/record-pending-decision.mjs', line: 295, op: 'insert', kind: 'production' },
      { file: 'lib/governance/chairman-escalation.js', line: 80, op: 'insert', kind: 'production' },
      { file: 'lib/venture-acquisition/decision-packet.js', line: 120, op: 'insert', kind: 'production' },
      { file: 'lib/chairman/sms-bridge.js', line: 332, op: 'update', kind: 'production' },
      // ...30+ further production writers across lib/eva, lib/chairman, lib/governance, lib/services.
    ],
  },
  {
    table: 'venture_telemetry',
    fact_class: 'venture metrics (product KPI rollup, per application_id)',
    writers: [
      { file: 'scripts/venture-telemetry-pull.mjs', line: 166, op: 'upsert', kind: 'production' },
      { file: 'scripts/venture-telemetry-pull.mjs', line: 170, op: 'update', kind: 'production' },
      { file: 'scripts/venture-telemetry-pull.mjs', line: 173, op: 'insert', kind: 'production' },
    ],
  },
  {
    table: 'venture_decisions',
    fact_class: 'venture decisions',
    writers: [
      { file: 'archive/scripts/user-story-generators/add-user-stories-sd-hardening-v1-001.js', line: 906, op: 'insert', kind: 'archive' },
    ],
  },
  {
    table: 'recursion_events',
    fact_class: 'recursion/orchestration events',
    writers: [], // no writers found anywhere
  },
  {
    table: 'venture_signals',
    fact_class: 'venture signals',
    writers: [
      { file: 'lib/gates/operator-contract/__tests__/venture-and-self-cadence.test.js', line: 11, op: 'insert', kind: 'fixture' }, // string fixture inside a test
    ],
  },
  {
    table: 'venture_metrics',
    fact_class: 'venture metrics',
    writers: [],
  },
  {
    table: 'venture_events',
    fact_class: 'venture events',
    writers: [],
  },
  {
    table: 'venture_analysis_artifacts',
    fact_class: 'analysis artifacts',
    writers: [
      { file: 'tests/integration/s17-parity.test.js', line: 240, op: 'insert', kind: 'test' },
    ],
  },
  {
    table: 'venture_stage_executions',
    fact_class: 'stage exec-path record',
    writers: [],
  },
  {
    table: 'exec_path_records',
    fact_class: 'stage exec-path record',
    writers: [],
  },
  {
    table: 'venture_exec_paths',
    fact_class: 'stage exec-path record',
    writers: [],
  },
  {
    table: 'venture_kpis',
    fact_class: 'venture metrics',
    writers: [],
  },
  {
    table: 'venture_stage_history',
    fact_class: 'stage exec-path record (history)',
    writers: [
      { file: 'archive/scripts/user-story-generators/add-user-stories-sd-venture-stage0-ui-001.js', line: 1063, op: 'insert', kind: 'archive' },
    ],
  },
  {
    table: 'stage_execution_results',
    fact_class: 'stage exec-path record',
    writers: [],
  },
  {
    table: 'agent_results',
    fact_class: 'agent results',
    writers: [],
  },
  {
    table: 'validation_scores',
    fact_class: 'validation scores',
    writers: [],
  },
];

/**
 * Count the production (real, non-test/archive/docs/fixture) writer call-sites.
 * @param {Array<{kind?: string}>} writerCallSites
 * @returns {number}
 */
export function countProductionWriters(writerCallSites = []) {
  return writerCallSites.filter(
    (w) => w && !NON_PRODUCTION_WRITER_KINDS.has(w.kind)
  ).length;
}

/**
 * PURE classification decision — unit-testable, no I/O.
 *
 * @param {object} input
 * @param {boolean} input.exists           - whether the table exists (PGRST205 => false)
 * @param {number|null} input.row_count    - service-role head/exact count (null when absent)
 * @param {Array<{kind?: string}>} input.writerCallSites - static writer call-sites
 * @returns {'WIRED'|'GHOST'|'EMPTY-WIRED'}
 */
export function classifyTable({ exists, row_count, writerCallSites = [] }) {
  if (!exists) return 'GHOST'; // table absent
  const productionWriters = countProductionWriters(writerCallSites);
  if (productionWriters === 0) return 'GHOST'; // dead table — exists but nothing real writes it
  if ((row_count ?? 0) > 0) return 'WIRED';
  return 'EMPTY-WIRED'; // exists + 0 rows + production writer
}

/**
 * Live, READ-ONLY existence + row-count probe for one table.
 * EXISTS is decided by the limit-1 select (PGRST205 => absent); the row count comes from a
 * head/exact count (which alone cannot distinguish absent from empty — see file header).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {string} table
 * @returns {Promise<{exists: boolean, row_count: number|null, probe_code: string|null}>}
 */
export async function probeTable(client, table) {
  const probe = await client.from(table).select('*').limit(1);
  if (probe.error && probe.error.code === ABSENT_TABLE_CODE) {
    return { exists: false, row_count: null, probe_code: probe.error.code };
  }
  const head = await client.from(table).select('*', { count: 'exact', head: true });
  return {
    exists: true,
    row_count: typeof head.count === 'number' ? head.count : null,
    probe_code: probe.error ? probe.error.code : null,
  };
}

/**
 * Audit every candidate against the live DB and classify. READ-ONLY.
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @returns {Promise<Array<object>>}
 */
export async function auditCaptureTables(client) {
  const results = [];
  for (const cand of CANDIDATES) {
    const { exists, row_count } = await probeTable(client, cand.table);
    const classification = classifyTable({ exists, row_count, writerCallSites: cand.writers });
    results.push({
      table: cand.table,
      exists,
      row_count,
      rls_note: RLS_NOTE,
      fact_class: cand.fact_class,
      production_writers: countProductionWriters(cand.writers),
      writer_call_sites: cand.writers,
      classification,
    });
  }
  return results;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env.');
    process.exit(1);
  }
  const client = createClient(url, key);
  const results = await auditCaptureTables(client);

  // Human-readable table.
  console.log('\nVenture data-capture table audit (READ-ONLY) — SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-A\n');
  console.table(
    results.map((r) => ({
      table: r.table,
      exists: r.exists,
      rows: r.row_count,
      prod_writers: r.production_writers,
      classification: r.classification,
      fact_class: r.fact_class,
    }))
  );

  const summary = results.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1;
    return acc;
  }, {});
  console.log('\nSummary:', JSON.stringify(summary));

  // Structured JSON (machine-readable) between explicit markers for easy scraping.
  console.log('\n===JSON-BEGIN===');
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), summary, results }, null, 2));
  console.log('===JSON-END===');
}

// Only probe the live DB when executed directly (never on import — keeps unit tests pure).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
