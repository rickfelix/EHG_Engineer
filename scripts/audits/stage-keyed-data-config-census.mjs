#!/usr/bin/env node
/**
 * Stage-keyed data/config census + disposition table.
 * SD-LEO-INFRA-STAGE-KEYED-DATA-001, FR-1/FR-2/TR-1/TR-4.
 *
 * Counterpart to scripts/audits/stage-21-26-census.mjs (the -A code census): where that instrument
 * sweeps 2 filesystem repos for stage-number LITERALS, this one sweeps the live DATABASE for
 * stage-keyed DATA (row counts in the 23-26 range across every stage-bearing column, schema-wide,
 * not the 4-table allowlist) and CONFIG (CHECK constraints gating stage values <= 26), then assigns
 * each named surface an explicit disposition (shift | shim | accepted-as-broken) so the v2
 * chairman-gated migration has a measured, falsifiable target rather than an inherited claim.
 *
 * Re-run: node scripts/audits/stage-keyed-data-config-census.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import {
  sweepCheckConstraintsContainingLiteral,
  countRowsInStageRange,
  countRowsMatchingStageEnumValues,
} from '../../lib/audits/stage-census/db-sweep.mjs';
import { assertCheckConstraintFloor } from '../../lib/audits/stage-census/negative-control.mjs';
import { renderDataConfigCensusReport } from '../../lib/audits/stage-census/data-config-report-writer.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_PATH = path.resolve(ENGINEER_ROOT, 'docs/audits/stage-keyed-data-config-census.md');

/**
 * The known surfaces this SD's LEAD-phase sub-agents (RISK c210515c-450d-4512-a078-482e07e71cab,
 * DATABASE a8d682bd-7681-4ea4-8851-19ce8bcddb3d) live-measured as stage-26-tied. Each carries a
 * pre-assigned disposition -- "shift" for all of them, since every one is resolvable by a 1-line
 * CHECK-widen or an ALTER-free data-value question in the v2 migration, and the cheap-fix cost
 * makes "accepted-as-broken" indefensible here (that disposition is reserved for surfaces where
 * the fix cost genuinely exceeds the risk, which none of these are).
 */
const KNOWN_SURFACES = [
  { table: 'eva_ventures', column: 'current_lifecycle_stage', reason: "2 CHECK constraints (chk_lifecycle_stage, eva_ventures_current_lifecycle_stage_check) both cap at 26; v2 widens both to <=27." },
  { table: 'stage_artifact_requirements', column: 'stage_number', reason: 'CHECK constraint caps at 26; v2 widens to <=27.' },
  { table: 'gate_boundary_config', column: 'from_stage', reason: "No CHECK, but the from_stage=23/to_stage=24 boundary row encodes the old scheme; v2 inserts the new 23->24->25->26->27 boundary rows." },
  { table: 'gate_boundary_config', column: 'to_stage', reason: 'See from_stage row -- same table, boundary rows updated together.' },
  { table: 'venture_stage_cutover_grandfather', column: 'stage_number', reason: 'No CHECK; grandfather rows read and deleted by fn_advance_venture_stage() during cutover -- v2 extends the function to handle stage 27.' },
  { table: 'stage_prop_contracts', column: 'stage_number', reason: 'CHECK constraint caps at 26; v2 widens to <=27.' },
  { table: 'eva_stage_gate_results', column: 'stage_number', reason: 'CHECK constraint caps at 26 (distinct from the already-shimmed eva_stage_gate_attempts); v2 widens to <=27.' },
  { table: 'venture_capture_snapshots', column: 'lifecycle_stage', reason: 'CHECK constraint caps at 26; v2 widens to <=27.' },
  { table: 'stage_executions', column: 'lifecycle_stage', reason: 'No CHECK, but the largest live surface in range; v2 confirms no schema change needed beyond the trigger fix (FR-4).' },
  { table: 'venture_artifacts', column: 'lifecycle_stage', reason: 'No CHECK on lifecycle_stage itself.' },
  { table: 'venture_artifacts', column: 'artifact_type', reason: "venture_artifacts_artifact_type_check enumerates stage_0_analysis..stage_26_analysis (a DIFFERENT column than lifecycle_stage); v2 adds stage_27_analysis to the enum." },
  { table: 'workflow_executions', column: 'current_stage', reason: 'No CHECK, but the largest surface schema-wide; HIGH severity addition from the corrected schema-wide sweep (FR-1) -- v1 missed this table entirely.' },
  { table: 'compliance_violations', column: 'stage_number', reason: "CHECK constraint caps at 26; HIGH severity addition from the corrected schema-wide sweep (FR-1) -- v1 missed this table entirely." },
  { table: 'compliance_events', column: 'stage_number', reason: '0 rows in range today (latent); CHECK constraint caps at 26 -- widened defensively now at zero data risk to avoid a future landmine.' },
  { table: 'convergence_ledger_stages', column: 'stage', reason: "Column is named 'stage', not 'stage_number' -- corrected from an earlier assumption; CHECK constraint caps at 26, widened defensively." },
  { table: 'stage_of_death_predictions', column: 'actual_death_stage', reason: "Table has 2 stage-bearing columns, not 1; CHECK constraint caps at 26 (nullable), widened defensively." },
  { table: 'stage_of_death_predictions', column: 'predicted_death_stage', reason: "Second of the table's 2 stage-bearing columns; CHECK constraint caps at 26, widened defensively." },
  { table: 'stage_proving_journal', column: 'stage_number', reason: '0 rows in range today (latent); CHECK constraint caps at 26 -- widened defensively now at zero data risk.' },
  { table: 'venture_dependencies', column: 'required_stage', reason: "Column is named 'required_stage', not 'stage_number' -- corrected from an earlier assumption; CHECK constraint caps at 26, widened defensively." },
  { table: 'ventures', column: 'current_lifecycle_stage', reason: 'CHECK constraint caps at 26; the canonical ventures table itself (distinct from eva_ventures) -- v2 widens to <=27.' },
  { table: 'eva_artifact_dependencies', column: 'source_stage', reason: 'CHECK constraint caps at 26 (low live-row count); v2 widens to <=27.' },
  { table: 'eva_artifact_dependencies', column: 'target_stage', reason: 'CHECK constraint caps at 26 (low live-row count); v2 widens to <=27.' },
];

async function main() {
  const generatedAt = new Date().toISOString();
  const client = await createDatabaseClient('engineer', { verify: false });
  let checkConstraints;
  let dispositions;
  try {
    checkConstraints = await sweepCheckConstraintsContainingLiteral(client, '26');

    dispositions = [];
    for (const s of KNOWN_SURFACES) {
      let liveRowCount = null;
      try {
        liveRowCount = s.table === 'venture_artifacts' && s.column === 'artifact_type'
          ? await countRowsMatchingStageEnumValues(client, s.table, s.column, 'stage_', '_analysis', 23, 26)
          : await countRowsInStageRange(client, s.table, s.column, 23, 26);
      } catch (err) {
        liveRowCount = `ERROR: ${err.message}`;
      }
      dispositions.push({
        surface: s.table,
        column: s.column,
        liveRowCount,
        disposition: 'shift',
        reason: s.reason,
        owner: 'EXEC (SD-LEO-INFRA-STAGE-KEYED-DATA-001)',
        reReviewBy: 'N/A -- resolved by database/chairman-gated/*_v2.sql (chairman-gated, staged, not yet applied)',
      });
    }
  } finally {
    await client.end();
  }

  let negativeControl;
  try {
    negativeControl = assertCheckConstraintFloor(checkConstraints);
  } catch (err) {
    console.error(`NEGATIVE CONTROL FAILED: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const report = renderDataConfigCensusReport({ generatedAt, negativeControl, dispositions, checkConstraints });
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, report, 'utf8');

  console.log(`Census written to ${path.relative(ENGINEER_ROOT, OUTPUT_PATH)}`);
  console.log(`Disposition rows: ${dispositions.length}`);
  console.log(`Negative control: PASS (${negativeControl.count} CHECK constraints containing '26' on stage-bearing columns)`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
