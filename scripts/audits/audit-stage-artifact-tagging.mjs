#!/usr/bin/env node
/**
 * SD-LEO-FIX-FIX-S10-WORKER-001 FR-005 — Stage worker artifact-tagging audit.
 *
 * Walks lib/eva/stage-templates/analysis-steps/, statically parses each file
 * via @babel/parser, and extracts every writeArtifact CallExpression's literal
 * (lifecycleStage, artifactType, source, title). Cross-checks against an
 * inline reference map of canonical (worker-stage -> [allowed artifact types
 * with their storage stage]) to surface twin defects of the SD-2a class
 * (worker emits an artifact at the wrong storage stage, OR with the wrong
 * artifactType label).
 *
 * Exits non-zero if any drift is found (CI-gateable for future enforcement).
 *
 * Usage: node scripts/audits/audit-stage-artifact-tagging.mjs
 */

import { readFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..');
const ANALYSIS_STEPS_DIR = join(PROJECT_ROOT, 'lib', 'eva', 'stage-templates', 'analysis-steps');
const REPORT_DIR = join(PROJECT_ROOT, 'reports');
const REPORT_PATH = join(REPORT_DIR, `stage-tagging-audit-${new Date().toISOString().slice(0, 10)}.json`);

// Reference: where each artifact_type SHOULD be stored per
// lifecycle_stage_config.required_artifacts (DB-authoritative consumer view).
// Keep this list small and authoritative; expand only when a new canonical
// type lands in lifecycle_stage_config.
const CANONICAL_STORAGE_STAGE = {
  identity_brand_guidelines: 12,
  identity_persona_brand: 10,
  identity_brand_name: 11,
  identity_logo_image: 11,
  identity_gtm_sales_strategy: 12,
  blueprint_technical_architecture: 14,
  blueprint_data_model: 14,
  blueprint_erd_diagram: 14,
  blueprint_api_contract: 14,
  blueprint_schema_spec: 14,
};

function isStageFile(name) {
  return /^stage-\d+(-[\w-]+)?\.js$/.test(name);
}

function getWorkerStage(filename) {
  const match = filename.match(/^stage-(\d+)/);
  return match ? Number(match[1]) : null;
}

function findWriteArtifactCalls(ast) {
  const calls = [];
  function walk(node, path = []) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'writeArtifact') {
      // The second argument is the options object literal; first is `supabase`.
      const optionsArg = node.arguments[1];
      if (optionsArg?.type === 'ObjectExpression') {
        const literal = {};
        for (const prop of optionsArg.properties) {
          if (prop.type === 'ObjectProperty' && prop.key?.type === 'Identifier') {
            const key = prop.key.name;
            const val = prop.value;
            if (val?.type === 'NumericLiteral') literal[key] = val.value;
            else if (val?.type === 'StringLiteral') literal[key] = val.value;
            // skip non-literal (computed) values — they cannot be statically validated
          }
        }
        calls.push({ literal, line: node.loc?.start?.line });
      }
    }
    for (const key of Object.keys(node)) {
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) walk(c, [...path, key]);
      } else if (child && typeof child === 'object') {
        walk(child, [...path, key]);
      }
    }
  }
  walk(ast);
  return calls;
}

const findings = [];
const drift = [];
const confirmedCorrect = [];

const files = readdirSync(ANALYSIS_STEPS_DIR).filter(isStageFile);
for (const file of files) {
  const fullPath = join(ANALYSIS_STEPS_DIR, file);
  if (!statSync(fullPath).isFile()) continue;
  const workerStage = getWorkerStage(file);
  const source = readFileSync(fullPath, 'utf-8');

  let ast;
  try {
    ast = parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
  } catch (parseErr) {
    findings.push({ file, status: 'parse_error', error: parseErr.message });
    continue;
  }

  const calls = findWriteArtifactCalls(ast);
  if (calls.length === 0) continue;

  for (const call of calls) {
    const { lifecycleStage, artifactType, title, source: src } = call.literal;
    if (typeof lifecycleStage !== 'number' || typeof artifactType !== 'string') {
      findings.push({
        file, line: call.line, status: 'non_literal_args',
        note: 'lifecycleStage or artifactType is not a literal — cannot statically validate',
        captured: call.literal,
      });
      continue;
    }
    const expectedStorageStage = CANONICAL_STORAGE_STAGE[artifactType];
    const record = {
      file, worker_stage: workerStage, line: call.line,
      artifactType, lifecycleStage,
      title: title || null, source: src || null,
      expected_storage_stage: expectedStorageStage ?? null,
    };
    if (expectedStorageStage === undefined) {
      record.status = 'unknown_artifact_type';
      record.note = `artifactType '${artifactType}' is not in CANONICAL_STORAGE_STAGE map — likely safe but please add to the audit reference if canonical`;
      findings.push(record);
    } else if (expectedStorageStage !== lifecycleStage) {
      record.status = 'drift';
      record.note = `lifecycleStage=${lifecycleStage} but canonical storage for ${artifactType} is ${expectedStorageStage}`;
      drift.push(record);
      findings.push(record);
    } else {
      record.status = 'confirmed_correct';
      confirmedCorrect.push(record);
      findings.push(record);
    }
  }
}

const summary = {
  audited_at: new Date().toISOString(),
  files_scanned: files.length,
  writeArtifact_calls_total: findings.length,
  drift_count: drift.length,
  confirmed_correct_count: confirmedCorrect.length,
  unknown_artifact_types: findings.filter(f => f.status === 'unknown_artifact_type').length,
};

mkdirSync(REPORT_DIR, { recursive: true });
const fs = await import('node:fs/promises');
await fs.writeFile(REPORT_PATH, JSON.stringify({ summary, drift, findings }, null, 2));

console.log('SD-LEO-FIX-FIX-S10-WORKER-001 FR-005 — Stage Artifact Tagging Audit');
console.log('====================================================================');
console.log(`Files scanned: ${summary.files_scanned}`);
console.log(`writeArtifact calls: ${summary.writeArtifact_calls_total}`);
console.log(`Drift: ${summary.drift_count}`);
console.log(`Confirmed correct: ${summary.confirmed_correct_count}`);
console.log(`Unknown artifact types: ${summary.unknown_artifact_types}`);
console.log(`Report: ${REPORT_PATH}`);

if (drift.length > 0) {
  console.error('\nDRIFT FOUND:');
  for (const d of drift) {
    console.error(`  ${d.file}:${d.line} — ${d.artifactType} at lifecycleStage=${d.lifecycleStage} (canonical storage: ${d.expected_storage_stage})`);
  }
  process.exit(1);
}

console.log('\nNo drift detected. Audit pass.');
process.exit(0);
