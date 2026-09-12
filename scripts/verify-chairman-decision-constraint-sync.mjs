#!/usr/bin/env node
/**
 * Chairman-decision constraint-sync validator (SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-147, FR-2).
 *
 * Read-only: compares the live chairman_decisions.decision CHECK constraint against the
 * decision-type enum values EVA stage templates declare, reporting drift.
 *
 * SCOPE HONESTLY LIMITED, NOT FABRICATED: the migration that created the current constraint
 * (supabase/migrations/20260215_chairman_decision_taxonomy_enforcement.sql) names ~11 stages as
 * sources, but only a subset of stage-template files declare their decision values under a
 * single, unambiguous `decision: { type: 'enum', values: [...] }` field -- others use different
 * field names (e.g. stage-17's `gate_recommendation`, stage-20's `verdict`) or none at all in
 * their current template (the stage has likely been renumbered since that migration's comment
 * was written -- see stage-23.js/stage-25.js's own "renumbered"/"shifted" header notes). Rather
 * than guess a field-name mapping for those stages, this script checks ONLY the unambiguous
 * `decision:` field shape and explicitly names every other stage as NOT_CHECKED in its output --
 * degrade, don't fabricate, per the same convention lib/venture-acquisition/decision-packet.js
 * already documents for its own quoting logic.
 *
 * Never writes to the database or to any stage-template file.
 *
 * Usage: node scripts/verify-chairman-decision-constraint-sync.mjs [--json]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';
import { discoverConstraintsViaSupabase, parseCheckConstraint } from './discover-schema-constraints.js';
import { isMainModule } from '../lib/utils/is-main-module.js';
import { armCliTeardown } from '../lib/cli-graceful-exit.js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const STAGE_TEMPLATES_DIR = join(__dirname, '..', 'lib', 'eva', 'stage-templates');

// Stages the 20260215 migration's own header comment names as decision-type sources, used only
// to report NOT_CHECKED for any that DECISION_FIELD_PATTERN below does not find a clean match
// for -- never to guess their current field name or file mapping.
const MIGRATION_NAMED_STAGES = [3, 5, 13, 17, 19, 20, 21, 22, 23, 25];

// Matches `decision: { type: 'enum', values: [ ... ], ... }` (whitespace/order-tolerant on the
// surrounding object, but requires this exact key+type+values shape -- the one stage-03/05/13
// actually use). Deliberately narrow: a looser pattern would risk matching an unrelated enum
// field and mis-reporting it as a decision-type declaration.
const DECISION_FIELD_PATTERN = /decision:\s*\{\s*type:\s*'enum',\s*values:\s*\[([^\]]+)\]/;

/** Extract {stageNumber, values} for every stage-NN.js file with the unambiguous decision: field. Pure. */
export function findDeclaredDecisionValues(dirPath) {
  const files = readdirSync(dirPath).filter((f) => /^stage-\d+\.js$/.test(f));
  const found = [];
  for (const file of files) {
    const stageNumber = Number(file.match(/^stage-(\d+)\.js$/)[1]);
    const content = readFileSync(join(dirPath, file), 'utf8');
    const match = content.match(DECISION_FIELD_PATTERN);
    if (!match) continue;
    const values = Array.from(match[1].matchAll(/'([^']+)'/g), (m) => m[1]);
    found.push({ stageNumber, file, values });
  }
  return found.sort((a, b) => a.stageNumber - b.stageNumber);
}

/** Pure: diff declared stage values against the live constraint's allowed set. */
export function diffAgainstConstraint(declaredStages, liveValues) {
  const liveSet = new Set(liveValues);
  const drifted = [];
  for (const stage of declaredStages) {
    const missing = stage.values.filter((v) => !liveSet.has(v));
    if (missing.length > 0) drifted.push({ ...stage, missing });
  }
  return drifted;
}

async function main() {
  const asJson = process.argv.includes('--json');
  const supabase = createSupabaseServiceClient();

  const constraints = await discoverConstraintsViaSupabase(supabase, 'chairman_decisions');
  const decisionConstraint = constraints.find((c) => c.column_name === 'decision');
  if (!decisionConstraint) {
    console.error('No CHECK constraint found on chairman_decisions.decision -- cannot verify sync.');
    await armCliTeardown(1);
    return;
  }
  const liveValues = parseCheckConstraint(decisionConstraint.constraint_definition);

  const declaredStages = findDeclaredDecisionValues(STAGE_TEMPLATES_DIR);
  const drifted = diffAgainstConstraint(declaredStages, liveValues);
  const checkedStageNumbers = new Set(declaredStages.map((s) => s.stageNumber));
  const notChecked = MIGRATION_NAMED_STAGES.filter((n) => !checkedStageNumbers.has(n));

  const result = {
    live_constraint_values: liveValues,
    stages_checked: declaredStages.map((s) => ({ stage: s.stageNumber, file: s.file, values: s.values })),
    stages_drifted: drifted.map((s) => ({ stage: s.stageNumber, file: s.file, missing_from_constraint: s.missing })),
    stages_not_checked: notChecked,
    not_checked_reason: 'These stages use a different field name (e.g. gate_recommendation, verdict) or none in their current template, or have been renumbered since the 20260215 migration comment was written -- not guessed, reported honestly as uncovered.',
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Live chairman_decisions.decision CHECK allows ${liveValues.length} value(s).`);
    console.log(`Checked ${declaredStages.length} stage(s) with an unambiguous decision: field: ${declaredStages.map((s) => s.stageNumber).join(', ')}`);
    if (drifted.length === 0) {
      console.log('✅ No drift: every checked stage\'s declared values are present in the live constraint.');
    } else {
      console.log(`❌ Drift found in ${drifted.length} stage(s):`);
      for (const s of drifted) {
        console.log(`   Stage ${s.stageNumber} (${s.file}): missing from constraint: ${s.missing.join(', ')}`);
      }
    }
    if (notChecked.length > 0) {
      console.log(`⚠️  NOT checked (no uniform field found, not guessed): stage(s) ${notChecked.join(', ')} -- ${result.not_checked_reason}`);
    }
  }

  await armCliTeardown(drifted.length === 0 ? 0 : 1);
}

if (isMainModule(import.meta.url)) {
  main().catch(async (e) => { console.error('FAILED', e); await armCliTeardown(1); });
}
