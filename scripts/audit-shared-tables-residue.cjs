#!/usr/bin/env node
/**
 * scripts/audit-shared-tables-residue.cjs
 *
 * Read-only audit of 6 shared tables for residual PrivacyPatrol AI / CommitCraft AI
 * data after the 4-SD portfolio-isolation campaign closed 2026-05-05.
 *
 * SD-LEO-INFRA-AUDIT-SHARED-TABLES-001 (FR-1, FR-5, FR-6)
 *
 * Two-pass design:
 *   Pass 1 (FK-authoritative): eva_events, eva_orchestration_events, ventures, eva_ventures
 *   Pass 2 (free-text/jsonb opportunistic): feedback, client_error_events
 *
 * Output: .claude/tmp/audit-shared-tables-residue-{ISO}.json with per-table
 * disposition matrix. Default disposition = RETAIN (audit-only; no DELETE/UPDATE).
 *
 * Exit codes:
 *   0 = audit completed (informational; presence of residue does NOT cause non-zero exit)
 *   1 = environmental error (missing env vars, DB unreachable)
 *
 * Usage:
 *   node scripts/audit-shared-tables-residue.cjs
 *   node scripts/audit-shared-tables-residue.cjs --format json
 *   node scripts/audit-shared-tables-residue.cjs --output /path/to/out.json
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const {
  KILLED_PATTERNS,
  isKilledVentureId,
} = require('./lib/killed-initiatives.cjs');
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 9: pass-2's free-text .or(ilike) match
// has no row-count bound (unlike pass-1's small hardcoded .in() lists) over growing tables
// (feedback, client_error_events) — a silently-truncated read would UNDER-REPORT the exact
// cross-portfolio residue this audit exists to find. Bridge for the CJS call sites below.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}

const SCHEMA_VERSION = '1.0';
const SD_UUID = 'f05587df-f924-4e7c-8e9f-8cba628af50e';
const SD_KEY = 'SD-LEO-INFRA-AUDIT-SHARED-TABLES-001';

const FK_TABLES = [
  'eva_events',
  'eva_orchestration_events',
  'ventures',
  'eva_ventures',
];
const TEXT_TABLES = ['feedback', 'client_error_events'];
const ALL_TABLES = [...FK_TABLES, ...TEXT_TABLES];

/**
 * Default disposition for an audited row.
 * Pure function — exported for testability.
 *
 * @param {string} table
 * @param {object} row
 * @returns {{disposition: 'retain'|'delete'|'rename', surfaced_for_review: boolean, reason: string}}
 */
function classifyDisposition(table, row) {
  // Audit-only SD: ALL rows default to RETAIN. EXEC scope explicitly excludes
  // DELETE/RENAME actions; those decisions deferred to follow-up disposition SD.
  // Free-text matches in feedback/client_error_events are surfaced for human review.
  if (table === 'feedback' || table === 'client_error_events') {
    return {
      disposition: 'retain',
      surfaced_for_review: true,
      reason:
        table === 'feedback'
          ? 'harness_backlog audit history — RETAIN by default per key_principle #2'
          : 'PP runtime errors (if any) preserved as audit trail',
    };
  }
  // FK-authoritative tables — retain (immutable lifecycle log / killed venture record)
  if (table === 'eva_events' || table === 'eva_orchestration_events') {
    return {
      disposition: 'retain',
      surfaced_for_review: false,
      reason: 'Immutable lifecycle event log',
    };
  }
  if (table === 'ventures' || table === 'eva_ventures') {
    return {
      disposition: 'retain',
      surfaced_for_review: false,
      reason:
        'Killed venture record (workflow_status=killed); retain for audit trail',
    };
  }
  return {
    disposition: 'retain',
    surfaced_for_review: false,
    reason: 'Default RETAIN',
  };
}

/**
 * Aggregate per-row dispositions into per-table summary.
 * Pure function — exported for testability.
 *
 * @param {string} table
 * @param {Array<object>} rows
 * @returns {object} per-table summary
 */
function summarizePerTable(table, rows) {
  const counts = { total_rows: rows.length, retain: 0, delete: 0, rename: 0, surfaced_for_review: 0 };
  const warnings = [];
  for (const r of rows) {
    const c = classifyDisposition(table, r);
    counts[c.disposition] += 1;
    if (c.surfaced_for_review) counts.surfaced_for_review += 1;
  }
  // Inject warnings for known drifts surfaced by database-agent
  if (table === 'eva_ventures' && rows.length > 0) {
    warnings.push(
      'eva_ventures lifecycle may lag ventures lifecycle — mirror-sync drift (RISK-5; not auto-fixed)'
    );
  }
  return { table, ...counts, warnings };
}

async function passOne_FKAuthoritative(supabase, ventureUuids) {
  const result = {};
  if (ventureUuids.length === 0) {
    for (const t of FK_TABLES) result[t] = [];
    return result;
  }

  // SELECT * everywhere — audit only needs row presence and per-row classification;
  // explicit column lists are brittle against schema drift. The audit is read-only
  // and informational; payload size is not a concern.

  // eva_events: FK eva_venture_id → eva_ventures.id (PP venture mirror)
  {
    const { data, error } = await supabase
      .from('eva_events')
      .select('*')
      .in('eva_venture_id', ventureUuids);
    if (error) throw new Error(`eva_events query: ${error.message}`);
    result.eva_events = data || [];
  }

  // eva_orchestration_events: FK venture_id → ventures.id
  {
    const { data, error } = await supabase
      .from('eva_orchestration_events')
      .select('*')
      .in('venture_id', ventureUuids);
    if (error) throw new Error(`eva_orchestration_events query: ${error.message}`);
    result.eva_orchestration_events = data || [];
  }

  // ventures: PK id matches venture_uuid
  {
    const { data, error } = await supabase
      .from('ventures')
      .select('*')
      .in('id', ventureUuids);
    if (error) throw new Error(`ventures query: ${error.message}`);
    result.ventures = data || [];
  }

  // eva_ventures: id matches the same UUID (mirror)
  {
    const { data, error } = await supabase
      .from('eva_ventures')
      .select('*')
      .in('id', ventureUuids);
    if (error) throw new Error(`eva_ventures query: ${error.message}`);
    result.eva_ventures = data || [];
  }

  return result;
}

async function passTwo_TextOpportunistic(supabase, namePatterns) {
  const result = {};
  if (namePatterns.length === 0) {
    for (const t of TEXT_TABLES) result[t] = [];
    return result;
  }

  // Build OR filter for case-insensitive substring match across columns
  const buildOr = (columns) =>
    namePatterns
      .flatMap((p) => columns.map((c) => `${c}.ilike.%${p}%`))
      .join(',');

  // feedback: title, description, resolution_notes (free-text)
  {
    const orFilter = buildOr(['title', 'description', 'resolution_notes']);
    try {
      result.feedback = await fapPaginate(() => supabase
        .from('feedback')
        .select('*')
        .or(orFilter)
        .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    } catch (e) {
      throw new Error(`feedback query: ${e.message}`);
    }
  }

  // client_error_events: message + route
  {
    const orFilter = buildOr(['message', 'route']);
    try {
      result.client_error_events = await fapPaginate(() => supabase
        .from('client_error_events')
        .select('*')
        .or(orFilter)
        .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    } catch (e) {
      throw new Error(`client_error_events query: ${e.message}`);
    }
  }

  return result;
}

function parseArgs(argv) {
  const opts = { format: 'human', output: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--format') opts.format = argv[++i] || 'human';
    else if (a === '--output') opts.output = argv[++i] || null;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const startedAt = new Date();
  console.log(`[audit-shared-tables-residue] start: ${startedAt.toISOString()}`);
  console.log(`[audit-shared-tables-residue] sd: ${SD_KEY} (${SD_UUID})`);
  console.log(
    `[audit-shared-tables-residue] tracked killed ventures: ${KILLED_PATTERNS.venture_uuids.length}`
  );

  const fkResults = await passOne_FKAuthoritative(supabase, KILLED_PATTERNS.venture_uuids);
  const textResults = await passTwo_TextOpportunistic(supabase, KILLED_PATTERNS.name_patterns);

  const perTable = ALL_TABLES.map((t) => {
    const rows = (fkResults[t] || textResults[t]) || [];
    return summarizePerTable(t, rows);
  });
  const summary = perTable.reduce(
    (acc, p) => {
      acc.total_rows += p.total_rows;
      acc.total_retain += p.retain;
      acc.total_delete += p.delete;
      acc.total_rename += p.rename;
      acc.total_surfaced_for_review += p.surfaced_for_review;
      acc.warnings.push(...p.warnings);
      return acc;
    },
    { total_rows: 0, total_retain: 0, total_delete: 0, total_rename: 0, total_surfaced_for_review: 0, warnings: [] }
  );

  const artifact = {
    schema_version: SCHEMA_VERSION,
    generated_at: startedAt.toISOString(),
    sd_id: SD_UUID,
    sd_key: SD_KEY,
    killed_ventures_tracked: KILLED_PATTERNS.entries.map((e) => ({
      name: e.name,
      venture_uuid: e.venture_uuid,
      killed_at_isodate: e.killed_at_isodate,
    })),
    residue_baseline: {
      // Database-agent baseline at LEAD (evidence 459c01f2-9bc1-4771-9eef-364a35f1b6dd):
      feedback: 18,
      client_error_events: 0,
      eva_events: 21,
      eva_orchestration_events: 0,
      ventures: 1,
      eva_ventures: 1,
      total: 41,
    },
    per_table: perTable,
    disposition_summary: summary,
    sample_rows: {
      // Include sample for human review of free-text matches; FK-authoritative tables
      // are deterministic and don't need samples. Defensively pick the most likely
      // identifying fields; tolerate schema drift.
      feedback: (textResults.feedback || []).slice(0, 5).map((r) => ({
        id: r.id ?? null,
        title: r.title ?? null,
        category: r.category ?? null,
      })),
    },
  };

  const outputPath =
    opts.output ||
    path.join(
      __dirname,
      '..',
      '.claude',
      'tmp',
      `audit-shared-tables-residue-${startedAt.toISOString().replace(/[:.]/g, '-')}.json`
    );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`[audit-shared-tables-residue] artifact written: ${outputPath}`);

  if (opts.format === 'json') {
    console.log(JSON.stringify(artifact, null, 2));
  } else {
    console.log(`[audit-shared-tables-residue] === Disposition Summary ===`);
    console.log(`  total_rows:           ${summary.total_rows}`);
    console.log(`  total_retain:         ${summary.total_retain}`);
    console.log(`  total_delete:         ${summary.total_delete}`);
    console.log(`  total_rename:         ${summary.total_rename}`);
    console.log(`  total_surfaced:       ${summary.total_surfaced_for_review}`);
    console.log(`  warnings:             ${summary.warnings.length}`);
    for (const p of perTable) {
      console.log(
        `  - ${p.table.padEnd(28)} rows=${p.total_rows} retain=${p.retain} delete=${p.delete} rename=${p.rename}`
      );
    }
  }

  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[audit-shared-tables-residue] FATAL:', err.message);
      process.exit(1);
    });
}

module.exports = {
  classifyDisposition,
  summarizePerTable,
  passOne_FKAuthoritative,
  passTwo_TextOpportunistic,
  FK_TABLES,
  TEXT_TABLES,
  ALL_TABLES,
  SCHEMA_VERSION,
  SD_UUID,
};
