#!/usr/bin/env node
/**
 * TS-1 (SD-LEO-INFRA-STAGE-KEYED-DATA-001): asserts the corrected census
 * (scripts/audits/stage-keyed-data-config-census.mjs) returns >= 11 surfaces (the PRD's own
 * acceptance floor: the original 9 corrected surfaces + workflow_executions + compliance_violations),
 * each with a non-blank disposition -- AND cross-checks that a 'shift' disposition actually
 * corresponds to real content in v2.sql, not merely an asserted label.
 *
 * An earlier version of this probe (and the census CLI it wraps) hardcoded disposition: 'shift'
 * for every surface -- caught by adversarial TESTING sub-agent review: it made the non-blank
 * assertion trivially true (a hardcoded literal can never be blank), left stage_executions
 * claiming "shift" here while v2's own banner says "accepted-as-broken, NOT shifted", and gave no
 * signal if a 'shift'-labeled surface's constraint was never actually touched in v2.sql. This
 * version imports the CLI's own per-surface KNOWN_SURFACES (single source, not a second
 * hand-maintained copy) and greps v2.sql for each 'shift'-disposed CHECK constraint's name.
 *
 * Re-run: node scripts/eva/stage-keyed-data-ts1-surface-coverage-probe.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '../lib/supabase-connection.js';
import { countRowsInStageRange, countRowsMatchingStageEnumValues, sweepCheckConstraintsContainingLiteral } from '../../lib/audits/stage-census/db-sweep.mjs';
import { assertCheckConstraintFloor } from '../../lib/audits/stage-census/negative-control.mjs';
import { KNOWN_SURFACES } from '../audits/stage-keyed-data-config-census.mjs';

const ENGINEER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_PATH = path.resolve(ENGINEER_ROOT, 'database/evidence/stage-keyed-data-config/TS-1-surface-coverage.json');
const V2_PATH = path.resolve(ENGINEER_ROOT, 'database/chairman-gated/20260828_stage_keyed_data_config_widen_v2.sql');
const MIN_SURFACES = 11;

async function main() {
  const generatedAt = new Date().toISOString();
  const client = await createDatabaseClient('engineer', { verify: false });
  const v2Sql = fs.readFileSync(V2_PATH, 'utf8');
  const evidence = { generatedAt, sd: 'SD-LEO-INFRA-STAGE-KEYED-DATA-001', scenario: 'TS-1' };
  let pass = false;
  try {
    const checkConstraints = await sweepCheckConstraintsContainingLiteral(client, '26');
    assertCheckConstraintFloor(checkConstraints);

    const dispositions = [];
    for (const s of KNOWN_SURFACES) {
      const liveRowCount = s.table === 'venture_artifacts' && s.column === 'artifact_type'
        ? await countRowsMatchingStageEnumValues(client, s.table, s.column, 'stage_', '_analysis', 23, 26)
        : await countRowsInStageRange(client, s.table, s.column, 23, 26);
      dispositions.push({ surface: `${s.table}.${s.column}`, liveRowCount, disposition: s.disposition });
    }

    evidence.surfaceCount = dispositions.length;
    evidence.dispositionCounts = dispositions.reduce((acc, d) => { acc[d.disposition] = (acc[d.disposition] || 0) + 1; return acc; }, {});
    evidence.blankDispositions = dispositions.filter((d) => !d.disposition).map((d) => d.surface);
    evidence.dispositions = dispositions;

    if (dispositions.length < MIN_SURFACES) {
      throw new Error(`TS-1 FAILED: only ${dispositions.length} surfaces, below the PRD's own floor of ${MIN_SURFACES}`);
    }
    if (evidence.blankDispositions.length > 0) {
      throw new Error(`TS-1 FAILED: ${evidence.blankDispositions.length} surface(s) have a blank disposition: ${evidence.blankDispositions.join(', ')}`);
    }
    const requiredNamed = ['workflow_executions.current_stage', 'compliance_violations.stage_number'];
    const missingNamed = requiredNamed.filter((n) => !dispositions.some((d) => d.surface === n));
    if (missingNamed.length > 0) {
      throw new Error(`TS-1 FAILED: PRD-named surface(s) missing: ${missingNamed.join(', ')}`);
    }

    // Cross-check: every surface disposition:'shift' whose column is genuinely CHECK-bearing (has
    // a live CHECK constraint in the sweep above) must actually appear widened in v2.sql -- not
    // merely labeled 'shift' in the census's own static data. Surfaces with disposition 'no-op' or
    // 'accepted-as-broken' are exempt (they are not claimed to be touched). `ventures` is ALSO
    // exempt: its shift is genuinely v1's own (section 4), not v2's -- v2.sql only NAMES that
    // constraint in an exclusion comment ("EXCLUDING ventures_current_lifecycle_stage_check
    // (already widened by v1...)"), and checking for the bare constraint name there would pass via
    // that comment text alone, not real DDL content -- the same class of vacuous match this SD's
    // own db-sweep.mjs already learned to distrust for a different case.
    const mismatches = [];
    for (const s of KNOWN_SURFACES) {
      if (s.disposition !== 'shift' || s.table === 'ventures') continue;
      const relatedConstraints = checkConstraints.filter((c) => c.table_name === s.table);
      for (const c of relatedConstraints) {
        if (!v2Sql.includes(c.constraint_name)) {
          mismatches.push(`${s.table}.${s.column}: disposition='shift' but v2.sql never references CHECK constraint ${c.constraint_name}`);
        }
      }
    }
    evidence.dispositionVsV2ContentMismatches = mismatches;
    if (mismatches.length > 0) {
      throw new Error(`TS-1 FAILED: ${mismatches.length} 'shift'-disposed surface(s) have no corresponding content in v2.sql: ${mismatches.join('; ')}`);
    }

    pass = true;
  } catch (err) {
    evidence.error = err.message;
    pass = false;
  } finally {
    await client.end();
  }

  evidence.result = pass ? 'PASS' : 'FAIL';
  fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), 'utf8');
  console.log(`Evidence written to ${path.relative(ENGINEER_ROOT, EVIDENCE_PATH)}`);
  console.log(`Result: ${evidence.result} (${evidence.surfaceCount} surfaces, floor ${MIN_SURFACES})`);
  if (!pass) process.exitCode = 1;
}

main();
