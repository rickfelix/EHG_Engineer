// SD-LEO-GEN-STAGE-DECISION-RESTORE-001 (FR-2, FR-5, FR-6) -- read-only staging report for the
// decision_by restore ceremony, incident ba330d67.
//
// Reads .artifacts/incident-damage-manifest-20260821.json + a session-state log for tick-line
// cross-reference, classifies the 4 recoverable manifest rows by REAL evidentiary tier, and
// honestly reconciles the full 1212-row damage population. NEVER writes to
// solomon_advice_outcome_ledger or solomon_ledger_attestations -- every live DB statement this
// script issues is classified via scripts/dr/restore-rehearsal-core.mjs's classifyStatement
// before execution, and a 'forbidden' classification throws before reaching the DB (the same
// safety contract that module already provides for DR rehearsals, reused verbatim here).
//
// Usage:
//   node scripts/one-off/stage-decision-restore-report.mjs
//   node scripts/one-off/stage-decision-restore-report.mjs --log-path <path>
//   node scripts/one-off/stage-decision-restore-report.mjs --manifest-path <path>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { classifyStatement, makeAuditedExecutor, scratchSchemaName } from '../dr/restore-rehearsal-core.mjs';

export const INCIDENT_ID = 'ba330d67';
export const DEFAULT_MANIFEST_PATH = '.artifacts/incident-damage-manifest-20260821.json';
// scripts/one-off/stage-decision-restore-report.mjs's worktree does not necessarily contain
// .claude/adam-session-state-08049808.md (LEAD-phase stories-agent finding: the file is untracked
// and only exists in the main checkout, not in per-SD worktrees). Default resolves against the
// MAIN tree, not this file's own location, but --log-path always overrides.
export const DEFAULT_LOG_PATH = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..', '..', '.claude', 'adam-session-state-08049808.md');

/**
 * Pure: classify one manifest row's evidentiary tier.
 * @param {object} row - a manifest entry (id, recovery_source, recovery_note, current_decision_by)
 * @param {string|null} logText - the session-state log content, or null if unreadable (fail-closed)
 * @returns {{tier: 'VERIFIED_EXACT'|'VERIFIED_BATCH'|'UNVERIFIED', citation: string}}
 */
export function classifyRow(row, logText) {
  // Both fields checked, not `note || source` -- a truthy recovery_note (present on every row in
  // the real manifest) would short-circuit past recovery_source entirely, and the actual
  // "not independently tick-located" admission for the 2 unverified rows lives in recovery_source,
  // not recovery_note. Caught live by this module's own first test run.
  const admitsNoEvidence = /not independently tick-located/i.test(`${row.recovery_note || ''} ${row.recovery_source || ''}`);
  if (admitsNoEvidence) {
    return {
      tier: 'UNVERIFIED',
      citation: `Coordinator-named only, no located tick-line: ${row.recovery_source}`,
    };
  }
  // The log references rows by their SHORT 8-hex-char prefix ("Ledger row 922f8dfb deferred"),
  // never the full UUID -- an earlier version of this check searched for row.id (the full UUID
  // from the manifest) and never matched anything, live-verified: 922f8dfb DOES appear verbatim
  // at .claude/adam-session-state-08049808.md:294, but only in short form. \b...\b guards against
  // a false match against a DIFFERENT id that merely shares this 8-char prefix as a substring.
  const shortId = row.id.split('-')[0];
  const shortIdPattern = new RegExp(`\\b${shortId}\\b`);
  if (logText != null && shortIdPattern.test(logText)) {
    const lines = logText.split('\n');
    const lineNo = lines.findIndex((l) => shortIdPattern.test(l)) + 1;
    return {
      tier: 'VERIFIED_EXACT',
      citation: `EXPLICIT tick-line match: session-state log line ${lineNo} contains the row id (${shortId}) verbatim -- "${lines[lineNo - 1].trim()}"`,
    };
  }
  // recovery_source cites a real tick/batch but the row's own id was not found verbatim in the
  // log (either the log is unreadable -- fail-closed by NOT promoting to VERIFIED_EXACT -- or the
  // corroboration is genuinely batch-membership-only, matching the manifest's own recovery_note).
  return {
    tier: 'VERIFIED_BATCH',
    citation: `BATCH-MEMBERSHIP corroboration, NOT a literal row-id match: ${row.recovery_source} -- ${row.recovery_note}. ${logText == null ? 'Log file was unreadable this run.' : 'A direct search of this row\'s id against the log text returned zero literal matches.'}`,
  };
}

/**
 * Pure: build the full report from the manifest array + log text.
 * @param {Array<object>} manifest - all 1212 rows
 * @param {string|null} logText
 * @returns {{verified: object[], unverified: object[], unrecovered_count: number, total: number}}
 */
export function buildReport(manifest, logText) {
  const recoverable = manifest.filter((r) => r.recoverable === 'yes');
  const verified = [];
  const unverified = [];
  for (const row of recoverable) {
    const { tier, citation } = classifyRow(row, logText);
    const entry = { id: row.id, current_decision_by: row.current_decision_by, tier, citation };
    if (tier === 'UNVERIFIED') unverified.push(entry);
    else verified.push(entry);
  }
  return {
    verified,
    unverified,
    unrecovered_count: manifest.length - recoverable.length,
    total: manifest.length,
  };
}

async function readOnlyCrossCheck(client, ids) {
  const scratchSchema = scratchSchemaName();
  const auditLog = [];
  const executor = makeAuditedExecutor(client, scratchSchema, auditLog);
  const sql = `SELECT id, decision_by FROM public.solomon_advice_outcome_ledger WHERE id = ANY($1::uuid[])`;
  const classification = classifyStatement(sql, scratchSchema);
  if (classification !== 'read') {
    throw new Error(`SAFETY: cross-check query classified as '${classification}', expected 'read' -- refusing to execute`);
  }
  const { rows } = await executor(sql, [ids]);
  return rows;
}

export async function generateReport({ manifestPath = DEFAULT_MANIFEST_PATH, logPath = DEFAULT_LOG_PATH, client = null } = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).manifest;
  let logText = null;
  try {
    logText = fs.readFileSync(logPath, 'utf8');
  } catch {
    logText = null; // fail-closed: absence of the log demotes every row to its conservative tier
  }
  const report = buildReport(manifest, logText);

  if (client) {
    const ids = [...report.verified, ...report.unverified].map((r) => r.id);
    const liveRows = await readOnlyCrossCheck(client, ids);
    const byId = Object.fromEntries(liveRows.map((r) => [r.id, r.decision_by]));
    for (const entry of [...report.verified, ...report.unverified]) {
      entry.live_decision_by = byId[entry.id] ?? null;
      entry.live_matches_manifest = byId[entry.id] === entry.current_decision_by;
    }
  }

  return report;
}

function printReport(report) {
  console.log(`=== Decision_by Restore Ceremony Report -- incident ${INCIDENT_ID} ===\n`);
  console.log('VERIFIED (apply-ready attestation, decision_by unchanged -- already correct):');
  for (const r of report.verified) {
    console.log(`  [${r.tier}] ${r.id} -- ${r.citation}`);
    if ('live_matches_manifest' in r) console.log(`    live decision_by=${r.live_decision_by} matches manifest: ${r.live_matches_manifest}`);
  }
  console.log('\nUNVERIFIED -- chairman decision required (NOT included in the apply-ready attestation):');
  for (const r of report.unverified) {
    console.log(`  [${r.tier}] ${r.id} -- ${r.citation}`);
  }
  console.log(`\nRECONCILIATION: ${report.total} total damaged rows = ${report.verified.length} verified + ${report.unverified.length} unverified-pending-decision + ${report.unrecovered_count} unrecovered-pending-Part-B`);
  const sum = report.verified.length + report.unverified.length + report.unrecovered_count;
  if (sum !== report.total) {
    console.error(`RECONCILIATION MISMATCH: counts sum to ${sum}, expected ${report.total}`);
    process.exitCode = 1;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const getFlag = (name, fallback) => {
    const i = args.indexOf(name);
    return i !== -1 ? args[i + 1] : fallback;
  };
  const manifestPath = getFlag('--manifest-path', DEFAULT_MANIFEST_PATH);
  const logPath = getFlag('--log-path', DEFAULT_LOG_PATH);

  const client = await createDatabaseClient('engineer', {
    connectionString: process.env.SUPABASE_POOLER_URL || process.env.DATABASE_URL,
  });
  try {
    const report = await generateReport({ manifestPath, logPath, client });
    printReport(report);
  } finally {
    await client.end();
  }
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
