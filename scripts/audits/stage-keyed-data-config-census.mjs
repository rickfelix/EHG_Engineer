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
import { isMainModule } from '../../lib/utils/is-main-module.js';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_PATH = path.resolve(ENGINEER_ROOT, 'docs/audits/stage-keyed-data-config-census.md');

/**
 * The known surfaces this SD's LEAD-phase sub-agents (RISK c210515c-450d-4512-a078-482e07e71cab,
 * DATABASE a8d682bd-7681-4ea4-8851-19ce8bcddb3d) live-measured as stage-26-tied. Each carries an
 * EXPLICIT, PER-SURFACE disposition matching what database/chairman-gated/20260828_stage_keyed_
 * data_config_widen_v2.sql actually does for it -- 'shift' only where v2 genuinely widens a CHECK
 * or moves data, 'no-op' where the surface has no blocking CHECK and needed no action, and
 * 'accepted-as-broken' where a deliberate decision was made not to touch it. An earlier draft
 * hardcoded 'shift' for every surface regardless of what v2 actually contained -- caught by
 * adversarial TESTING sub-agent review: it made TS-1's non-blank-disposition assertion trivially
 * true (a hardcoded literal can never be blank) and put 2 surfaces in direct contradiction with
 * v2's own banner (stage_executions: "shift" here vs. "accepted-as-broken, NOT shifted" there).
 */
export const KNOWN_SURFACES = [
  { table: 'eva_ventures', column: 'current_lifecycle_stage', disposition: 'shift', reason: "2 CHECK constraints (chk_lifecycle_stage, eva_ventures_current_lifecycle_stage_check) both cap at 26; v2 widens both to <=27, plus a section 5b data backfill for stale mirror rows (see TS-7)." },
  { table: 'stage_artifact_requirements', column: 'stage_number', disposition: 'shift', reason: 'CHECK constraint caps at 26; v2 widens to <=27 and shifts the 6 rows in range.' },
  { table: 'gate_boundary_config', column: 'from_stage', disposition: 'shift', reason: "No CHECK, but the from_stage=23/to_stage=24 boundary row encodes the old scheme; v2 UPDATEs that single row to (24,25) -- not an insert." },
  { table: 'gate_boundary_config', column: 'to_stage', disposition: 'shift', reason: 'See from_stage row -- same table, same UPDATE.' },
  { table: 'venture_stage_cutover_grandfather', column: 'stage_number', disposition: 'shift', reason: 'No CHECK; v2 UPDATEs the 7 rows currently at stage_number=24 to 25 (a plain +1, not a function change -- fn_advance_venture_stage() itself is not modified by this SD).' },
  { table: 'stage_prop_contracts', column: 'stage_number', disposition: 'shift', reason: 'CHECK constraint caps at 26; v2 widens to <=27.' },
  { table: 'eva_stage_gate_results', column: 'stage_number', disposition: 'shift', reason: 'CHECK constraint caps at 26 (distinct from the already-shimmed eva_stage_gate_attempts); v2 widens to <=27.' },
  { table: 'venture_capture_snapshots', column: 'lifecycle_stage', disposition: 'shift', reason: 'CHECK constraint caps at 26; v2 widens to <=27.' },
  { table: 'stage_executions', column: 'lifecycle_stage', disposition: 'accepted-as-broken', reason: 'No CHECK; the largest live surface in range, but a worker-execution LOG table (historical record, not live state) -- v2 deliberately does NOT shift it, matching v1\'s own rationale for shimming rather than shifting venture_stage_transitions/eva_stage_gate_attempts. See v2 banner note (a).' },
  { table: 'venture_artifacts', column: 'lifecycle_stage', disposition: 'no-op', reason: 'No CHECK on lifecycle_stage itself; no action needed or taken by v2.' },
  { table: 'venture_artifacts', column: 'artifact_type', disposition: 'shift', reason: "venture_artifacts_artifact_type_check enumerates stage_0_analysis..stage_26_analysis (a DIFFERENT column than lifecycle_stage); v2 adds stage_27_analysis to the enum." },
  { table: 'workflow_executions', column: 'current_stage', disposition: 'no-op', reason: 'No CHECK constraint; HIGH severity addition from the corrected schema-wide sweep (FR-1) -- v1 missed this table entirely -- but a stage-27 write already succeeds unobstructed, so v2 takes no action on it.' },
  { table: 'compliance_violations', column: 'stage_number', disposition: 'shift', reason: "CHECK constraint caps at 26; HIGH severity addition from the corrected schema-wide sweep (FR-1) -- v1 missed this table entirely; v2 widens to <=27." },
  { table: 'compliance_events', column: 'stage_number', disposition: 'shift', reason: '0 rows in range today (latent); CHECK constraint caps at 26 -- v2 widens defensively at zero data risk to avoid a future landmine.' },
  { table: 'convergence_ledger_stages', column: 'stage', disposition: 'shift', reason: "Column is named 'stage', not 'stage_number' -- corrected from an earlier assumption; CHECK constraint caps at 26, v2 widens defensively." },
  { table: 'stage_of_death_predictions', column: 'actual_death_stage', disposition: 'shift', reason: "Table has 2 stage-bearing columns, not 1; CHECK constraint caps at 26 (nullable), v2 widens defensively." },
  { table: 'stage_of_death_predictions', column: 'predicted_death_stage', disposition: 'shift', reason: "Second of the table's 2 stage-bearing columns; CHECK constraint caps at 26, v2 widens defensively." },
  { table: 'stage_proving_journal', column: 'stage_number', disposition: 'shift', reason: '0 rows in range today (latent); CHECK constraint caps at 26 -- v2 widens defensively at zero data risk.' },
  { table: 'venture_dependencies', column: 'required_stage', disposition: 'shift', reason: "Column is named 'required_stage', not 'stage_number' -- corrected from an earlier assumption; CHECK constraint caps at 26, v2 widens defensively." },
  { table: 'ventures', column: 'current_lifecycle_stage', disposition: 'shift', reason: 'CHECK constraint caps at 26; the canonical ventures table itself (distinct from eva_ventures) -- already widened to <=27 by v1 (section 4), not by v2.' },
  { table: 'eva_artifact_dependencies', column: 'source_stage', disposition: 'shift', reason: 'CHECK constraint caps at 26 (low live-row count); v2 widens to <=27.' },
  { table: 'eva_artifact_dependencies', column: 'target_stage', disposition: 'shift', reason: 'CHECK constraint caps at 26 (low live-row count); v2 widens to <=27.' },
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
        disposition: s.disposition,
        reason: s.reason,
        owner: 'EXEC (SD-LEO-INFRA-STAGE-KEYED-DATA-001)',
        reReviewBy: s.disposition === 'accepted-as-broken'
          ? 'When a stage_executions reader is added that compares its lifecycle_stage against current venture_stages.stage_number (see v2 banner note (a)).'
          : 'N/A -- resolved by database/chairman-gated/*_v2.sql (chairman-gated, staged, not yet applied)',
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

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
