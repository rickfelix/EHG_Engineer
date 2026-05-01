#!/usr/bin/env node
/**
 * One-off capture script: ai-quality-judge V1 prompt fixtures
 * SD: SD-LEO-INFRA-OPUS-HARNESS-PHASE-3-INLINE-SCRIPTS-001
 *
 * Captures (input, V1 prompt string, V1 validator result) tuples for the 3
 * prompt builders in scripts/modules/ai-quality-judge/prompts.js so the
 * replay test can assert V2 imperative rewrites preserve validator parity.
 *
 * Run BEFORE the V1->V2 rephrase. Idempotent: overwrites existing fixtures.
 *
 * Usage: node scripts/one-off/capture-ai-quality-judge-fixtures.mjs
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateEvaluationPrompt,
  generateBatchEvaluationPrompt,
  generateReEvaluationPrompt,
} from '../modules/ai-quality-judge/prompts.js';
import {
  validateEvaluationPromptShape,
  validateBatchEvaluationPromptShape,
  validateReEvaluationPromptShape,
} from '../modules/ai-quality-judge/prompts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = path.resolve(__dirname, '../__tests__/golden/ai-quality-judge');

const CONSTITUTION_RULES = [
  { rule_code: 'CONST-001', rule_text: 'GOVERNED tier requires human approval', rationale: 'Human review for risk-bearing changes' },
  { rule_code: 'CONST-002', rule_text: 'System cannot approve its own proposals', rationale: 'Triangulation principle' },
  { rule_code: 'CONST-003', rule_text: 'All changes must be audit-logged', rationale: 'Reversibility and forensics' },
  { rule_code: 'CONST-004', rule_text: 'Every change must be reversible', rationale: 'Safety net for production' },
  { rule_code: 'CONST-005', rule_text: 'Database-first architecture', rationale: 'Single source of truth' },
];

const IMPROVEMENTS = [
  {
    label: 'eval-001-auto-insert',
    improvement: { id: 'imp-aaaa-1111', improvement_type: 'CRUD_INSERT', target_table: 'pattern_observations', target_operation: 'INSERT', risk_tier: 'AUTO', evidence_count: 7, description: 'Auto-insert pattern observations when retrospective signals exceed threshold', payload: { table: 'pattern_observations', columns: ['pattern_id', 'observed_at', 'confidence'] }, source_retro_id: 'retro-1' },
  },
  {
    label: 'eval-002-governed-update',
    improvement: { id: 'imp-bbbb-2222', improvement_type: 'CRUD_UPDATE', target_table: 'strategic_directives_v2', target_operation: 'UPDATE', risk_tier: 'GOVERNED', evidence_count: 4, description: 'Update SD scope_reduction_percentage when scope amendment recorded', payload: { columns: ['scope_reduction_percentage'] }, source_retro_id: 'retro-2' },
  },
  {
    label: 'eval-003-immutable',
    improvement: { id: 'imp-cccc-3333', improvement_type: 'CONSTITUTION_AMEND', target_table: 'protocol_constitution', target_operation: 'INSERT', risk_tier: 'IMMUTABLE', evidence_count: 12, description: 'Add CONST-015 enforcing scope-lock during EXEC', payload: { rule_code: 'CONST-015' }, source_retro_id: 'retro-3' },
  },
  {
    label: 'eval-004-low-evidence',
    improvement: { id: 'imp-dddd-4444', improvement_type: 'GATE_THRESHOLD', target_table: 'leo_gates', target_operation: 'UPDATE', risk_tier: 'GOVERNED', evidence_count: 1, description: 'Lower BASELINE_DEBT_CHECK threshold from 80 to 70', payload: { gate: 'BASELINE_DEBT_CHECK', new_threshold: 70 }, source_retro_id: 'retro-4' },
  },
  {
    label: 'eval-005-no-target',
    improvement: { id: 'imp-eeee-5555', improvement_type: 'WORKFLOW_TWEAK', evidence_count: 3, description: 'Add a new check at PLAN-TO-EXEC for branch staleness', payload: {}, source_retro_id: 'retro-5' },
  },
  {
    label: 'eval-006-batch-source',
    improvement: { id: 'imp-ffff-6666', improvement_type: 'CRUD_INSERT', target_table: 'feedback', target_operation: 'INSERT', risk_tier: 'AUTO', evidence_count: 9, description: 'Auto-insert feedback rows when harness bug logged via /log-harness-bug', payload: { table: 'feedback', defaults: { category: 'harness_backlog', status: 'new' } }, source_retro_id: 'retro-6' },
  },
];

function buildEvalFixture(item) {
  const v1Output = generateEvaluationPrompt(item.improvement, CONSTITUTION_RULES);
  const validatorResult = validateEvaluationPromptShape(v1Output);
  return {
    input: { improvement: item.improvement, constitutionRules: CONSTITUTION_RULES },
    v1_output: v1Output,
    validator_result: validatorResult,
    captured_at: new Date().toISOString(),
    sanitized: true,
    builder: 'evaluation',
    label: item.label,
  };
}

function buildBatchFixture(label, improvements) {
  const v1Output = generateBatchEvaluationPrompt(improvements, CONSTITUTION_RULES);
  const validatorResult = validateBatchEvaluationPromptShape(v1Output);
  return {
    input: { improvements, constitutionRules: CONSTITUTION_RULES },
    v1_output: v1Output,
    validator_result: validatorResult,
    captured_at: new Date().toISOString(),
    sanitized: true,
    builder: 'batch',
    label,
  };
}

function buildReEvalFixture(label, improvement, previousAssessment) {
  const v1Output = generateReEvaluationPrompt(improvement, previousAssessment, CONSTITUTION_RULES);
  const validatorResult = validateReEvaluationPromptShape(v1Output);
  return {
    input: { improvement, previousAssessment, constitutionRules: CONSTITUTION_RULES },
    v1_output: v1Output,
    validator_result: validatorResult,
    captured_at: new Date().toISOString(),
    sanitized: true,
    builder: 're-evaluation',
    label,
  };
}

const evalFixtures = IMPROVEMENTS.map(buildEvalFixture);
const batchFixtures = [
  buildBatchFixture('batch-001-mixed-tiers', IMPROVEMENTS.slice(0, 4).map(i => i.improvement)),
  buildBatchFixture('batch-002-all-auto', IMPROVEMENTS.filter(i => i.improvement.risk_tier === 'AUTO').map(i => i.improvement)),
];
const reEvalFixtures = [
  buildReEvalFixture('reeval-001-revised', IMPROVEMENTS[1].improvement, { score: 62, recommendation: 'NEEDS_REVISION', reasoning: 'Specificity was 4/10 due to missing column list' }),
  buildReEvalFixture('reeval-002-evidence-grew', IMPROVEMENTS[3].improvement, { score: 48, recommendation: 'REJECT', reasoning: 'Evidence count was 1; needs ≥3 supporting retros' }),
  buildReEvalFixture('reeval-003-safety-clarified', IMPROVEMENTS[5].improvement, { score: 71, recommendation: 'APPROVE', reasoning: 'Safety 7/10 - rollback path was unclear' }),
];

const allFixtures = [...evalFixtures, ...batchFixtures, ...reEvalFixtures];

await fs.mkdir(GOLDEN_DIR, { recursive: true });

let i = 1;
for (const fixture of allFixtures) {
  const fileName = `fixture-${String(i).padStart(3, '0')}.json`;
  const filePath = path.join(GOLDEN_DIR, fileName);
  await fs.writeFile(filePath, JSON.stringify(fixture, null, 2));
  console.log(`  wrote ${fileName}  builder=${fixture.builder}  label=${fixture.label}  v1_passed=${fixture.validator_result.passed}`);
  i += 1;
}

console.log(`\nDONE: ${allFixtures.length} fixtures written to ${GOLDEN_DIR}`);
const failed = allFixtures.filter(f => !f.validator_result.passed);
if (failed.length > 0) {
  console.error(`WARN: ${failed.length} V1 fixtures FAILED validator — fix validator before V2 rewrite.`);
  for (const f of failed) console.error(`  - ${f.label}: ${f.validator_result.details}`);
  process.exit(2);
}
