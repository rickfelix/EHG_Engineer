#!/usr/bin/env node
/**
 * generate-stage-config.js — Reads the venture-workflow.ts SSOT from the EHG app
 * repo and the lifecycle_stage_config DB table, then generates
 * lib/proving-companion/stage-config.js.
 *
 * Usage:
 *   node scripts/generate-stage-config.js           # dry-run (stdout)
 *   node scripts/generate-stage-config.js --write   # write to stage-config.js
 *   node scripts/generate-stage-config.js --check   # compare, exit 1 if different (CI)
 *
 * SSOT sources:
 *   - App:  ehg/src/config/venture-workflow.ts  (stages, components, gates, chunks)
 *   - DB:   lifecycle_stage_config              (requiredArtifacts, workType, archPhases)
 *
 * Idempotent: running twice produces identical output.
 */

'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
// Resolve app repo path: env var > sibling directory > known absolute path
const VENTURE_WORKFLOW_PATH = (() => {
  if (process.env.EHG_APP_PATH) {
    return path.resolve(process.env.EHG_APP_PATH, 'src', 'config', 'venture-workflow.ts');
  }
  // Walk up from script dir to find the _EHG parent containing both repos
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    dir = path.dirname(dir);
    const candidate = path.join(dir, 'ehg', 'src', 'config', 'venture-workflow.ts');
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fallback: known absolute path from applications/registry.json
  return path.resolve('C:', 'Users', 'rickf', 'Projects', '_EHG', 'ehg', 'src', 'config', 'venture-workflow.ts');
})();
const OUTPUT_PATH = path.resolve(
  __dirname, '..', 'lib', 'proving-companion', 'stage-config.js'
);

// ---------------------------------------------------------------------------
// Parse flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const FLAG_WRITE = args.includes('--write');
const FLAG_CHECK = args.includes('--check');

// ---------------------------------------------------------------------------
// venture-workflow.ts parser
// ---------------------------------------------------------------------------

/**
 * Parse VENTURE_STAGES array from the TypeScript source.
 * We use a simple regex approach — the TS file has a predictable format
 * with one object literal per stage.
 *
 * Returns an array of { stageNumber, stageName, stageKey, componentPath, gateType, chunk }.
 */
function parseVentureWorkflow(tsSource) {
  const stages = [];

  // Match each object literal inside the VENTURE_STAGES array.
  // The array starts after "export const VENTURE_STAGES: VentureStage[] = ["
  const arrayMatch = tsSource.match(
    /export\s+const\s+VENTURE_STAGES\s*:\s*VentureStage\[\]\s*=\s*\[([\s\S]*?)\];/
  );
  if (!arrayMatch) {
    throw new Error('Could not find VENTURE_STAGES array in venture-workflow.ts');
  }

  const arrayBody = arrayMatch[1];

  // Match each { ... } block
  const objectRegex = /\{([^{}]+)\}/g;
  let m;
  while ((m = objectRegex.exec(arrayBody)) !== null) {
    const block = m[1];

    const stageNumber = extractNumber(block, 'stageNumber');
    const stageName = extractString(block, 'stageName');
    const stageKey = extractString(block, 'stageKey');
    const componentPath = extractString(block, 'componentPath');
    const gateType = extractString(block, 'gateType');
    const chunk = extractString(block, 'chunk');

    if (stageNumber == null || !stageKey) {
      continue; // skip non-stage objects (shouldn't happen)
    }

    stages.push({ stageNumber, stageName, stageKey, componentPath, gateType, chunk });
  }

  if (stages.length !== 26) {
    throw new Error(
      `Expected 26 stages from venture-workflow.ts, got ${stages.length}`
    );
  }

  return stages;
}

function extractString(block, key) {
  // Matches key: 'value' or key: "value"
  const re = new RegExp(`${key}\\s*:\\s*['"]([^'"]+)['"]`);
  const m = block.match(re);
  return m ? m[1] : null;
}

function extractNumber(block, key) {
  const re = new RegExp(`${key}\\s*:\\s*(\\d+)`);
  const m = block.match(re);
  return m ? parseInt(m[1], 10) : null;
}

// ---------------------------------------------------------------------------
// DB loader — lifecycle_stage_config
// ---------------------------------------------------------------------------

async function loadDBConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY in environment'
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('lifecycle_stage_config')
    .select('stage_number, stage_name, work_type, required_artifacts, phase_name, metadata')
    .order('stage_number', { ascending: true });

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  // Index by stage_number for O(1) lookup
  const byStage = {};
  for (const row of data) {
    byStage[row.stage_number] = row;
  }
  return byStage;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map app gateType ('none' | 'kill' | 'promotion') to stage-config gateType.
 * 'none' -> null
 */
function mapGateType(appGateType) {
  if (appGateType === 'none') return null;
  return appGateType; // 'kill' or 'promotion'
}

/**
 * Build the stage name for stage-config.
 * Uses the app stageName as the canonical name (SSOT).
 * Gate type is separate metadata — NOT embedded in the name.
 */
function buildStageName(appStage, dbRow) {
  return appStage.stageName;
}

/**
 * Derive filePatterns from componentPath.
 * Pattern: 'src/components/stages/<ComponentBase>*'
 */
function deriveFilePatterns(componentPath) {
  const base = componentPath.replace(/\.tsx$/, '');
  return [`src/components/stages/${base}*`];
}

/**
 * Get requiredArtifacts from DB row, falling back to empty array.
 */
function getRequiredArtifacts(dbRow) {
  if (!dbRow) return [];
  if (Array.isArray(dbRow.required_artifacts)) return dbRow.required_artifacts;
  return [];
}

/**
 * Get workType from DB row. Falls back to 'artifact_only'.
 */
function getWorkType(dbRow) {
  if (!dbRow) return 'artifact_only';
  return dbRow.work_type || 'artifact_only';
}

/**
 * Derive visionKeys from stageKey. Uses [stageKey] as the primary array.
 */
function deriveVisionKeys(stageKey) {
  return [stageKey];
}

/**
 * Derive archPhases from DB metadata or phase_name.
 * The DB metadata.arch_phases field is checked first.
 * Falls back to a chunk-to-archPhase mapping.
 */
const CHUNK_TO_ARCH_PHASE = {
  THE_TRUTH: 'validation',
  THE_ENGINE: 'design',
  THE_IDENTITY: 'identity',
  THE_BLUEPRINT: 'build',
  THE_BUILD: 'execution',
  THE_LAUNCH: 'launch'
};

function getArchPhases(dbRow, chunk) {
  // Check DB metadata for explicit arch_phases
  if (dbRow && dbRow.metadata && Array.isArray(dbRow.metadata.arch_phases)) {
    return dbRow.metadata.arch_phases;
  }
  // Fall back to chunk-based mapping
  const phase = CHUNK_TO_ARCH_PHASE[chunk] || 'unknown';
  return [phase];
}

// ---------------------------------------------------------------------------
// Code generator
// ---------------------------------------------------------------------------

/**
 * Serialize a JS value for embedding in generated source.
 * Handles: null, strings, arrays of strings.
 */
function jsLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map(v => jsLiteral(v)).join(', ')}]`;
  }
  return String(value);
}

function generateOutput(appStages, dbConfig) {
  const lines = [];

  lines.push(`/**`);
  lines.push(` * Stage Config — maps stage numbers to file patterns, required artifacts,`);
  lines.push(` * gate types, and vision keys for Plan Agent and Reality Agent consumption.`);
  lines.push(` *`);
  lines.push(` * SSOT sources:`);
  lines.push(` *   - DB: lifecycle_stage_config (stage names, phases, work types, artifacts)`);
  lines.push(` *   - App: venture-workflow.ts (component paths, gate types, chunks)`);
  lines.push(` *`);
  lines.push(` * GENERATED FILE — DO NOT HAND-EDIT.`);
  lines.push(` * Regenerate via: node scripts/generate-stage-config.js --write`);
  lines.push(` */`);
  lines.push('');
  lines.push(`const STAGE_CONFIG = {`);

  for (let i = 0; i < appStages.length; i++) {
    const stage = appStages[i];
    const dbRow = dbConfig[stage.stageNumber] || null;

    const name = buildStageName(stage, dbRow);
    const componentFile = stage.componentPath;
    const filePatterns = deriveFilePatterns(stage.componentPath);
    const requiredArtifacts = getRequiredArtifacts(dbRow);
    const workType = getWorkType(dbRow);
    const gateType = mapGateType(stage.gateType);
    const phase = stage.chunk; // chunk maps directly to phase
    const visionKeys = deriveVisionKeys(stage.stageKey);
    const archPhases = getArchPhases(dbRow, stage.chunk);

    lines.push(`  ${stage.stageNumber}: {`);
    lines.push(`    name: ${jsLiteral(name)},`);
    lines.push(`    componentFile: ${jsLiteral(componentFile)},`);
    lines.push(`    filePatterns: ${jsLiteral(filePatterns)},`);
    lines.push(`    requiredArtifacts: ${jsLiteral(requiredArtifacts)},`);
    lines.push(`    workType: ${jsLiteral(workType)},`);
    lines.push(`    gateType: ${jsLiteral(gateType)},`);
    lines.push(`    phase: ${jsLiteral(phase)},`);
    lines.push(`    visionKeys: ${jsLiteral(visionKeys)},`);
    lines.push(`    archPhases: ${jsLiteral(archPhases)}`);

    if (i < appStages.length - 1) {
      lines.push(`  },`);
    } else {
      lines.push(`  }`);
    }
  }

  lines.push(`};`);
  lines.push('');

  // Helper functions — identical to the existing stage-config.js API surface
  lines.push(`/**`);
  lines.push(` * Get config for a specific stage`);
  lines.push(` * @param {number} stageNumber`);
  lines.push(` * @returns {object} stage config`);
  lines.push(` */`);
  lines.push(`export function getStageConfig(stageNumber) {`);
  lines.push(`  return STAGE_CONFIG[stageNumber] || null;`);
  lines.push(`}`);
  lines.push('');

  lines.push(`/**`);
  lines.push(` * Get configs for a range of stages`);
  lines.push(` * @param {number} from`);
  lines.push(` * @param {number} to`);
  lines.push(` * @returns {object} map of stage number to config`);
  lines.push(` */`);
  lines.push(`export function getStageRange(from, to) {`);
  lines.push(`  const result = {};`);
  lines.push(`  for (let i = from; i <= to; i++) {`);
  lines.push(`    if (STAGE_CONFIG[i]) {`);
  lines.push(`      result[i] = STAGE_CONFIG[i];`);
  lines.push(`    }`);
  lines.push(`  }`);
  lines.push(`  return result;`);
  lines.push(`}`);
  lines.push('');

  lines.push(`/**`);
  lines.push(` * Gate stages — stages requiring chairman decision to advance.`);
  lines.push(` * Kill gates: venture can be terminated.`);
  lines.push(` * Promotion gates: venture elevated from simulation to production.`);
  lines.push(` * @returns {number[]}`);
  lines.push(` */`);
  lines.push(`export function getGateStages() {`);
  lines.push(`  return Object.entries(STAGE_CONFIG)`);
  lines.push(`    .filter(([, c]) => c.gateType !== null)`);
  lines.push(`    .map(([n]) => parseInt(n));`);
  lines.push(`}`);
  lines.push('');

  lines.push(`/**`);
  lines.push(` * Get kill gate stages only`);
  lines.push(` * @returns {number[]}`);
  lines.push(` */`);
  lines.push(`export function getKillGateStages() {`);
  lines.push(`  return Object.entries(STAGE_CONFIG)`);
  lines.push(`    .filter(([, c]) => c.gateType === 'kill')`);
  lines.push(`    .map(([n]) => parseInt(n));`);
  lines.push(`}`);
  lines.push('');

  // Use CJS exports (not ESM)
  lines.push(`export { STAGE_CONFIG };`);
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Read and parse venture-workflow.ts
  if (!fs.existsSync(VENTURE_WORKFLOW_PATH)) {
    console.error(`ERROR: venture-workflow.ts not found at ${VENTURE_WORKFLOW_PATH}`);
    console.error('Ensure the EHG app repo is cloned alongside this repo.');
    process.exit(1);
  }

  const tsSource = fs.readFileSync(VENTURE_WORKFLOW_PATH, 'utf8');
  const appStages = parseVentureWorkflow(tsSource);
  console.error(`Parsed ${appStages.length} stages from venture-workflow.ts`);

  // 2. Load DB config
  let dbConfig;
  try {
    dbConfig = await loadDBConfig();
    const dbCount = Object.keys(dbConfig).length;
    console.error(`Loaded ${dbCount} rows from lifecycle_stage_config`);
  } catch (err) {
    console.error(`WARNING: Could not load DB config: ${err.message}`);
    console.error('Falling back to app-only generation (some fields will use defaults).');
    dbConfig = {};
  }

  // 3. Generate output
  const output = generateOutput(appStages, dbConfig);

  // 4. Handle flags
  if (FLAG_CHECK) {
    if (!fs.existsSync(OUTPUT_PATH)) {
      console.error(`CHECK FAILED: ${OUTPUT_PATH} does not exist`);
      process.exit(1);
    }
    const existing = fs.readFileSync(OUTPUT_PATH, 'utf8');
    if (existing === output) {
      console.error('CHECK PASSED: stage-config.js is up to date');
      process.exit(0);
    } else {
      console.error('CHECK FAILED: stage-config.js is out of date');
      console.error('Run: node scripts/generate-stage-config.js --write');
      process.exit(1);
    }
  }

  if (FLAG_WRITE) {
    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
    console.error(`Wrote ${OUTPUT_PATH}`);
    process.exit(0);
  }

  // Default: dry-run to stdout
  process.stdout.write(output);
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
