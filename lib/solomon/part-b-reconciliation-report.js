// SD-ALTIFYAI-LEO-GEN-EXECUTE-PART-BACKUP-001 (FR-5) -- combined S1/S2/S3 reconciliation report.
// Part B restore ceremony, incident ba330d67. Extends Part A's verified/unverified visual-
// separation convention (scripts/one-off/stage-decision-restore-report.mjs) across the full
// backup-derived scope. No fabricated or guessed values for any row outside what S1/S2/S3
// concretely determine.
//
// PURE MODULE -- takes the already-computed results of extractS1Candidates, buildS2Patch, and
// verifyS3 and reconciles them into one report. Never touches the DB itself.

/**
 * @param {import('./backup-diff-extractor.js').S1Candidate[]} s1Results
 * @param {{applied: object[], skipped: object[], reason: string}} s2Result
 * @param {{noOpConfirmed: string[], clobbered: object[], missing: string[]}} s3Result
 * @returns {{s1: object, s2: object, s3: object, totalRowsAccounted: number, reconciliationOk: boolean}}
 */
export function buildReconciliationReport(s1Results, s2Result, s3Result) {
  const s1Summary = {
    applyReady: s1Results.filter((r) => r.status === 'apply_ready').length,
    noDiff: s1Results.filter((r) => r.status === 'no_diff').length,
    missingInSnapshot: s1Results.filter((r) => r.status === 'missing_in_snapshot').length,
    invalidCandidate: s1Results.filter((r) => r.status === 'invalid_candidate').length,
    total: s1Results.length,
  };
  const s1SumMatches = s1Summary.applyReady + s1Summary.noDiff + s1Summary.missingInSnapshot + s1Summary.invalidCandidate === s1Summary.total;

  // S2 is unconditionally labeled PENDING CLARIFICATION regardless of the runtime enabled flag --
  // the label describes SD-level status, not a runtime value.
  const s2Summary = {
    label: 'PENDING CLARIFICATION',
    patched: s2Result.applied.length,
    skipped: s2Result.skipped.length,
    total: s2Result.applied.length + s2Result.skipped.length,
  };

  const s3Summary = {
    noOpConfirmed: s3Result.noOpConfirmed.length,
    clobbered: s3Result.clobbered.length,
    missing: s3Result.missing.length,
    total: s3Result.noOpConfirmed.length + s3Result.clobbered.length + s3Result.missing.length,
  };

  const totalRowsAccounted = s1Summary.total + s2Summary.total + s3Summary.total;
  const reconciliationOk = s1SumMatches; // s2/s3 summaries are constructed as exact sums by definition; s1 is the only one built from independent filters that could drift.

  return {
    s1: s1Summary,
    s2: s2Summary,
    s3: s3Summary,
    totalRowsAccounted,
    reconciliationOk,
  };
}

/** Render the report as human-readable text, mirroring Part A's visually-distinct-sections convention. */
export function printReconciliationReport(report) {
  const lines = [];
  lines.push('=== Part B S1/S2/S3 Reconciliation Report -- incident ba330d67 ===');
  lines.push('');
  lines.push(`S1 (backup-diff): ${report.s1.total} row(s) evaluated`);
  lines.push(`  apply_ready: ${report.s1.applyReady} | no_diff: ${report.s1.noDiff} | missing_in_snapshot: ${report.s1.missingInSnapshot} | invalid_candidate: ${report.s1.invalidCandidate}`);
  lines.push('');
  lines.push(`S2 (verbatim-source, Adam constant) -- ${report.s2.label}: ${report.s2.total} row(s)`);
  lines.push(`  patched: ${report.s2.patched} | skipped (PENDING CLARIFICATION): ${report.s2.skipped}`);
  lines.push('');
  lines.push(`S3 (pinned in-window no-op check): ${report.s3.total} row(s)`);
  lines.push(`  no_op_confirmed: ${report.s3.noOpConfirmed} | clobbered (ANOMALY): ${report.s3.clobbered} | missing: ${report.s3.missing}`);
  lines.push('');
  lines.push(`Total rows accounted: ${report.totalRowsAccounted}`);
  lines.push(`Reconciliation: ${report.reconciliationOk ? 'OK' : 'MISMATCH -- see summaries above'}`);
  return lines.join('\n');
}
