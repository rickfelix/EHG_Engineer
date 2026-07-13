/**
 * QF-20260712-917 (D6): pure formatting logic for the runbook §7 "Latest live
 * run" witness block, split out of stamp-rehearsal-result.mjs for unit testing.
 */
const fmt = (n) => Number(n).toLocaleString('en-US');

/** Matches runbook §7's "Latest live run" block, from its bold header through the Cleanup row. */
export const RUNBOOK_BLOCK_REGEX = /\*\*Latest live run[\s\S]*?\| Cleanup \|[^\n]*\|/;

/** @param {object} report - restore-rehearsal.mjs's buildReport() output */
export function buildWitnessBlock(report) {
  const { A, B } = report.drills;
  const rowA = `| A — retention_archive → workflow_trace_log | ${A.status}${A.status === 'PASS' ? ` — ${fmt(A.restored)} rows restored, **${fmt(A.fieldChecks)} field checks, ${fmt(A.mismatchCount ?? 0)} mismatches**, ${(A.schemaDriftKeys || []).length} schema-drift keys, ${(A.missingRestored || []).length} missing rows` : A.error ? ` — ${A.error}` : ''} |`;
  const rowB = `| B — quarantine copy md5 identity | ${B.status}${B.status === 'PASS' ? ` — ${B.copied}/${B.sampled} rows, md5 sets identical` : B.error ? ` — ${B.error}` : ''} |`;
  const durationMs = report.startedAt ? new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime() : null;

  return `**Latest live run — ${report.finishedAt}: \`${report.overall}\`** (scratch schema
\`${report.scratchSchema}\`${durationMs != null ? `, ${(durationMs / 1000).toFixed(1)} s` : ''}):

| Drill | Result |
|---|---|
${rowA}
${rowB}
| Statement audit | ${report.statementAudit.total} statements: ${report.statementAudit.reads} reads, ${report.statementAudit.scratchWrites} scratch-writes, **${report.statementAudit.forbidden} forbidden** |
| Cleanup | scratch schema ${report.cleanup.schemaDropped ? 'dropped' : 'NOT CONFIRMED DROPPED — manual check needed'} |`;
}
