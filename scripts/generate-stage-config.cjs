#!/usr/bin/env node
/**
 * generate-stage-config.cjs — venture_stages (DB) is the SINGLE SOURCE OF TRUTH.
 *
 * Reads the unified `venture_stages` table and EMITS two artifacts:
 *   1. lib/proving-companion/stage-config.js          (EHG_Engineer consumers)
 *   2. ehg/src/config/venture-workflow.ts             (generated, do-not-edit)
 *
 * This INVERTS the prior direction (which parsed venture-workflow.ts as SSOT).
 * Children A/B/C made venture_stages the unified table that the backend reads;
 * Child D (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D) makes it authoritative for
 * generation too. The app-only fields (gate_label, app_description,
 * component_path) live on venture_stages as additive columns.
 *
 * Usage:
 *   node scripts/generate-stage-config.cjs           # dry-run (stage-config to stdout)
 *   node scripts/generate-stage-config.cjs --write   # write BOTH artifacts
 *   node scripts/generate-stage-config.cjs --check    # CI drift guard (byte-compare BOTH)
 *
 * BYTE-PARITY: the generated venture-workflow.ts is byte-identical to the
 * committed file except its leading generated banner. CRLF + UTF-8 preserved.
 */

'use strict';

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');
const { resolveRepoPath } = require('../lib/repo-paths.cjs');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const STAGE_CONFIG_PATH = path.resolve(__dirname, '..', 'lib', 'proving-companion', 'stage-config.js');

function resolveVentureWorkflowPath() {
  if (process.env.EHG_APP_PATH) {
    return path.resolve(process.env.EHG_APP_PATH, 'src', 'config', 'venture-workflow.ts');
  }
  const registryEhg = resolveRepoPath('ehg');
  if (registryEhg) {
    return path.join(registryEhg, 'src', 'config', 'venture-workflow.ts');
  }
  // Walk up from script dir to find a sibling ehg repo
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    dir = path.dirname(dir);
    const candidate = path.join(dir, 'ehg', 'src', 'config', 'venture-workflow.ts');
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.resolve(__dirname, '..', '..', 'ehg', 'src', 'config', 'venture-workflow.ts');
}
const VENTURE_WORKFLOW_PATH = resolveVentureWorkflowPath();

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const FLAG_WRITE = args.includes('--write');
const FLAG_CHECK = args.includes('--check');

// ---------------------------------------------------------------------------
// DB loader — venture_stages (unified SSOT)
// ---------------------------------------------------------------------------
function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY in environment');
  }
  return createClient(supabaseUrl, supabaseKey);
}

async function loadVentureStages(supabase) {
  const { data, error } = await supabase
    .from('venture_stages')
    .select('stage_number, stage_name, stage_key, component_path, gate_type, gate_label, review_mode, chunk, description, app_description, work_type, required_artifacts, metadata')
    .order('stage_number', { ascending: true });
  if (error) throw new Error(`venture_stages query failed: ${error.message}`);
  if (!data || data.length !== 26) {
    throw new Error(`Expected 26 rows from venture_stages, got ${data ? data.length : 0}`);
  }
  return data;
}



// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

// stageKey is reproduced from the snake_case DB key by hyphenating.
function deriveStageKey(row) {
  return row.stage_key.replace(/_/g, '-');
}

function mapGateType(gateType) {
  if (gateType === 'none' || gateType == null) return null;
  return gateType; // 'kill' | 'promotion'
}

const CHUNK_TO_ARCH_PHASE = {
  THE_TRUTH: 'validation',
  THE_ENGINE: 'design',
  THE_IDENTITY: 'identity',
  THE_BLUEPRINT: 'build',
  THE_BUILD: 'execution',
  THE_LAUNCH: 'launch',
};

function getArchPhases(row) {
  if (row.metadata && Array.isArray(row.metadata.arch_phases)) return row.metadata.arch_phases;
  return [CHUNK_TO_ARCH_PHASE[row.chunk] || 'unknown'];
}

function getRequiredArtifacts(row) {
  return Array.isArray(row.required_artifacts) ? row.required_artifacts : [];
}

function getWorkType(row) {
  return row.work_type || 'artifact_only';
}

function deriveFilePatterns(componentPath) {
  const base = componentPath.replace(/\.tsx$/, '');
  return [`src/components/stages/${base}*`];
}

// ---------------------------------------------------------------------------
// stage-config.js generator (EHG_Engineer consumers)
// ---------------------------------------------------------------------------
function jsLiteral(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[${value.map((v) => jsLiteral(v)).join(', ')}]`;
  }
  return String(value);
}

function generateStageConfig(rows) {
  const lines = [];
  lines.push('/**');
  lines.push(' * Stage Config — maps stage numbers to file patterns, required artifacts,');
  lines.push(' * gate types, and vision keys for Plan Agent and Reality Agent consumption.');
  lines.push(' *');
  lines.push(' * SSOT: venture_stages (DB). App-only fields (component_path, gate_label,');
  lines.push(' * app_description) live on venture_stages as additive columns.');
  lines.push(' *');
  lines.push(' * GENERATED FILE — DO NOT HAND-EDIT.');
  lines.push(' * Regenerate via: node scripts/generate-stage-config.cjs --write');
  lines.push(' */');
  lines.push('');
  lines.push('const STAGE_CONFIG = {');

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const componentFile = row.component_path;
    lines.push(`  ${row.stage_number}: {`);
    lines.push(`    name: ${jsLiteral(row.stage_name)},`);
    lines.push(`    componentFile: ${jsLiteral(componentFile)},`);
    lines.push(`    filePatterns: ${jsLiteral(deriveFilePatterns(componentFile))},`);
    lines.push(`    requiredArtifacts: ${jsLiteral(getRequiredArtifacts(row))},`);
    lines.push(`    workType: ${jsLiteral(getWorkType(row))},`);
    lines.push(`    gateType: ${jsLiteral(mapGateType(row.gate_type))},`);
    lines.push(`    phase: ${jsLiteral(row.chunk)},`);
    lines.push(`    visionKeys: ${jsLiteral([deriveStageKey(row)])},`);
    lines.push(`    archPhases: ${jsLiteral(getArchPhases(row))}`);
    lines.push(i < rows.length - 1 ? '  },' : '  }');
  }

  lines.push('};');
  lines.push('');
  lines.push('/**');
  lines.push(' * Get config for a specific stage');
  lines.push(' * @param {number} stageNumber');
  lines.push(' * @returns {object} stage config');
  lines.push(' */');
  lines.push('export function getStageConfig(stageNumber) {');
  lines.push('  return STAGE_CONFIG[stageNumber] || null;');
  lines.push('}');
  lines.push('');
  lines.push('/**');
  lines.push(' * Get configs for a range of stages');
  lines.push(' * @param {number} from');
  lines.push(' * @param {number} to');
  lines.push(' * @returns {object} map of stage number to config');
  lines.push(' */');
  lines.push('export function getStageRange(from, to) {');
  lines.push('  const result = {};');
  lines.push('  for (let i = from; i <= to; i++) {');
  lines.push('    if (STAGE_CONFIG[i]) {');
  lines.push('      result[i] = STAGE_CONFIG[i];');
  lines.push('    }');
  lines.push('  }');
  lines.push('  return result;');
  lines.push('}');
  lines.push('');
  lines.push('/**');
  lines.push(' * Gate stages — stages requiring chairman decision to advance.');
  lines.push(' * Kill gates: venture can be terminated.');
  lines.push(' * Promotion gates: venture elevated from simulation to production.');
  lines.push(' * @returns {number[]}');
  lines.push(' */');
  lines.push('export function getGateStages() {');
  lines.push('  return Object.entries(STAGE_CONFIG)');
  lines.push('    .filter(([, c]) => c.gateType !== null)');
  lines.push('    .map(([n]) => parseInt(n));');
  lines.push('}');
  lines.push('');
  lines.push('/**');
  lines.push(' * Get kill gate stages only');
  lines.push(' * @returns {number[]}');
  lines.push(' */');
  lines.push('export function getKillGateStages() {');
  lines.push('  return Object.entries(STAGE_CONFIG)');
  lines.push("    .filter(([, c]) => c.gateType === 'kill')");
  lines.push('    .map(([n]) => parseInt(n));');
  lines.push('}');
  lines.push('');
  lines.push('export { STAGE_CONFIG };');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// venture-workflow.ts generator (ehg app — BYTE-PARITY contract)
// ---------------------------------------------------------------------------

// Byte-exact static scaffold captured from the committed venture-workflow.ts.
// TYPE_BLOCK = GateType + WorkflowChunk + VentureStage interface + the
//   `export const VENTURE_STAGES: VentureStage[] = [` opener (ends with CRLF).
// HELPER_BLOCK = `// ===== HELPER FUNCTIONS =====` through the final helper +
//   TOTAL_STAGES=26 (ends with CRLF). Preserved verbatim (the interface + all
//   10 helper exports are unchanged — gate semantics / helper logic are the
//   scope of Child E, explicitly out of scope here). Stored base64 to keep the
//   CRLF + UTF-8 em-dash byte-exact without source-escaping hazards.
const TYPE_BLOCK_B64 =
  'ZXhwb3J0IHR5cGUgR2F0ZVR5cGUgPSAnbm9uZScgfCAna2lsbCcgfCAncHJvbW90aW9uJzsNCg0KLy8gQ2h1bmsvUGhhc2UgZ3JvdXBpbmdzIC0gVmlzaW9uIFYyIG5hbWluZw0KZXhwb3J0IHR5cGUgV29ya2Zsb3dDaHVuayA9DQogIHwgJ1RIRV9UUlVUSCcgLy8gU3RhZ2VzIDEtNTogVmFsaWRhdGlvbiAmIE1hcmtldCBSZWFsaXR5DQogIHwgJ1RIRV9FTkdJTkUnIC8vIFN0YWdlcyA2LTk6IEJ1c2luZXNzIE1vZGVsIEZvdW5kYXRpb24NCiAgfCAnVEhFX0lERU5USVRZJyAvLyBTdGFnZXMgMTAtMTI6IEJyYW5kICYgR28tdG8tTWFya2V0DQogIHwgJ1RIRV9CTFVFUFJJTlQnIC8vIFN0YWdlcyAxMy0xNzogVGVjaG5pY2FsIEFyY2hpdGVjdHVyZSArIEJsdWVwcmludCBSZXZpZXcNCiAgfCAnVEhFX0JVSUxEJyAvLyBTdGFnZXMgMTgtMjM6IEltcGxlbWVudGF0aW9uDQogIHwgJ1RIRV9MQVVOQ0gnOyAvLyBTdGFnZXMgMjQtMjY6IExhdW5jaCAmIEdvLUxpdmUNCg0KLy8gU3RhZ2UgbWV0YWRhdGEgaW50ZXJmYWNlDQpleHBvcnQgaW50ZXJmYWNlIFZlbnR1cmVTdGFnZSB7DQogIHN0YWdlTnVtYmVyOiBudW1iZXI7DQogIHN0YWdlTmFtZTogc3RyaW5nOw0KICBzdGFnZUtleTogc3RyaW5nOyAvLyBrZWJhYi1jYXNlIGlkZW50aWZpZXINCiAgY29tcG9uZW50UGF0aDogc3RyaW5nOyAvLyByZWxhdGl2ZSB0byAvc3JjL2NvbXBvbmVudHMvc3RhZ2VzLw0KICBnYXRlVHlwZTogR2F0ZVR5cGU7DQogIGdhdGVMYWJlbD86IHN0cmluZzsgLy8gSHVtYW4tcmVhZGFibGUgZ2F0ZSBkZXNjcmlwdGlvbg0KICByZXZpZXdNb2RlPzogJ2F1dG8nIHwgJ3JldmlldycgfCAnbWFudWFsJzsNCiAgY2h1bms6IFdvcmtmbG93Q2h1bms7DQogIGRlc2NyaXB0aW9uOiBzdHJpbmc7DQp9DQoNCi8qKg0KICogVkVOVFVSRV9TVEFHRVMgLSBDYW5vbmljYWwgMjYtc3RhZ2Ugd29ya2Zsb3cgKFZpc2lvbiBWMiArIEJsdWVwcmludCBSZXZpZXcpDQogKg0KICogS2lsbCBHYXRlcyAodmVudHVyZSB0ZXJtaW5hdGlvbiBwb2ludHMpOg0KICogLSBTdGFnZSAzOiBDb21wcmVoZW5zaXZlIFZhbGlkYXRpb24NCiAqIC0gU3RhZ2UgNTogUHJvZml0YWJpbGl0eSBGb3JlY2FzdGluZw0KICogLSBTdGFnZSAxMzogUHJvZHVjdCBSb2FkbWFwDQogKiAtIFN0YWdlIDI0OiBNYXJrZXRpbmcgUHJlcGFyYXRpb24NCiAqDQogKiBQcm9tb3Rpb24gR2F0ZXMgKHBoYXNlIGJvdW5kYXJ5IGNoZWNrcG9pbnRzKToNCiAqIC0gU3RhZ2UgMTA6IEN1c3RvbWVyICYgQnJhbmQgRm91bmRhdGlvbg0KICogLSBTdGFnZSAxNzogQmx1ZXByaW50IFJldmlldyAoTkVXIOKAlCBhZ2dyZWdhdGVzIHN0YWdlcyAxLTE2IHF1YWxpdHkpDQogKiAtIFN0YWdlIDE4OiBCdWlsZCBSZWFkaW5lc3MNCiAqIC0gU3RhZ2UgMjM6IFJlbGVhc2UgUmVhZGluZXNzDQogKiAtIFN0YWdlIDI1OiBMYXVuY2ggUmVhZGluZXNzDQogKi8NCmV4cG9ydCBjb25zdCBWRU5UVVJFX1NUQUdFUzogVmVudHVyZVN0YWdlW10gPSBbDQ==';
const HELPER_BLOCK_B64 =
  'Ly8gPT09PT09PT09PSBIRUxQRVIgRlVOQ1RJT05TID09PT09PT09PT0NCg0KLyoqDQogKiBHZXQgc3RhZ2UgYnkgc3RhZ2UgbnVtYmVyDQogKi8NCmV4cG9ydCBmdW5jdGlvbiBnZXRTdGFnZUJ5TnVtYmVyKHN0YWdlTnVtYmVyOiBudW1iZXIpOiBWZW50dXJlU3RhZ2UgfCB1bmRlZmluZWQgew0KICByZXR1cm4gVkVOVFVSRV9TVEFHRVMuZmluZCgocykgPT4gcy5zdGFnZU51bWJlciA9PT0gc3RhZ2VOdW1iZXIpOw0KfQ0KDQovKioNCiAqIEdldCBzdGFnZSBieSBzdGFnZSBrZXkNCiAqLw0KZXhwb3J0IGZ1bmN0aW9uIGdldFN0YWdlQnlLZXkoc3RhZ2VLZXk6IHN0cmluZyk6IFZlbnR1cmVTdGFnZSB8IHVuZGVmaW5lZCB7DQogIHJldHVybiBWRU5UVVJFX1NUQUdFUy5maW5kKChzKSA9PiBzLnN0YWdlS2V5ID09PSBzdGFnZUtleSk7DQp9DQoNCi8qKg0KICogR2V0IGFsbCBzdGFnZXMgaW4gYSBjaHVuaw0KICovDQpleHBvcnQgZnVuY3Rpb24gZ2V0U3RhZ2VzQnlDaHVuayhjaHVuazogV29ya2Zsb3dDaHVuayk6IFZlbnR1cmVTdGFnZVtdIHsNCiAgcmV0dXJuIFZFTlRVUkVfU1RBR0VTLmZpbHRlcigocykgPT4gcy5jaHVuayA9PT0gY2h1bmspOw0KfQ0KDQovKioNCiAqIEdldCBhbGwga2lsbCBnYXRlcw0KICovDQpleHBvcnQgZnVuY3Rpb24gZ2V0S2lsbEdhdGVzKCk6IFZlbnR1cmVTdGFnZVtdIHsNCiAgcmV0dXJuIFZFTlRVUkVfU1RBR0VTLmZpbHRlcigocykgPT4gcy5nYXRlVHlwZSA9PT0gJ2tpbGwnKTsNCn0NCg0KLyoqDQogKiBHZXQgYWxsIHByb21vdGlvbiBnYXRlcw0KICovDQpleHBvcnQgZnVuY3Rpb24gZ2V0UHJvbW90aW9uR2F0ZXMoKTogVmVudHVyZVN0YWdlW10gew0KICByZXR1cm4gVkVOVFVSRV9TVEFHRVMuZmlsdGVyKChzKSA9PiBzLmdhdGVUeXBlID09PSAncHJvbW90aW9uJyk7DQp9DQoNCi8qKg0KICogQ2hlY2sgaWYgYSBzdGFnZSBpcyBhIGtpbGwgZ2F0ZQ0KICovDQpleHBvcnQgZnVuY3Rpb24gaXNLaWxsR2F0ZShzdGFnZU51bWJlcjogbnVtYmVyKTogYm9vbGVhbiB7DQogIGNvbnN0IHN0YWdlID0gZ2V0U3RhZ2VCeU51bWJlcihzdGFnZU51bWJlcik7DQogIHJldHVybiBzdGFnZT8uZ2F0ZVR5cGUgPT09ICdraWxsJzsNCn0NCg0KLyoqDQogKiBDaGVjayBpZiBhIHN0YWdlIGlzIGEgcHJvbW90aW9uIGdhdGUNCiAqLw0KZXhwb3J0IGZ1bmN0aW9uIGlzUHJvbW90aW9uR2F0ZShzdGFnZU51bWJlcjogbnVtYmVyKTogYm9vbGVhbiB7DQogIGNvbnN0IHN0YWdlID0gZ2V0U3RhZ2VCeU51bWJlcihzdGFnZU51bWJlcik7DQogIHJldHVybiBzdGFnZT8uZ2F0ZVR5cGUgPT09ICdwcm9tb3Rpb24nOw0KfQ0KDQovKioNCiAqIFRvdGFsIG51bWJlciBvZiBzdGFnZXMgKGNvbnN0YW50KQ0KICovDQpleHBvcnQgY29uc3QgVE9UQUxfU1RBR0VTID0gMjY7DQoNCi8qKg0KICogR2V0IGFsbCBzdGFnZXMgd2l0aCByZXZpZXcgbW9kZSBlbmFibGVkLg0KICogVGhlc2Ugc3RhZ2VzIHBhdXNlIGZvciBjaGFpcm1hbiByZXZpZXcgYmVmb3JlIGF1dG8tYWR2YW5jaW5nLg0KICovDQpleHBvcnQgZnVuY3Rpb24gZ2V0UmV2aWV3TW9kZVN0YWdlcygpOiBWZW50dXJlU3RhZ2VbXSB7DQogIHJldHVybiBWRU5UVVJFX1NUQUdFUy5maWx0ZXIoKHMpID0+IHMucmV2aWV3TW9kZSA9PT0gJ3JldmlldycpOw0KfQ0KDQovKioNCiAqIEdldCBodW1hbi1yZWFkYWJsZSBzdGFnZSBuYW1lIGZvciBhIHN0YWdlIG51bWJlci4NCiAqIFRoaXMgaXMgdGhlIE9OTFkgZnVuY3Rpb24gdGhhdCBzaG91bGQgYmUgdXNlZCBmb3Igc3RhZ2UgbmFtZSBsb29rdXBzLg0KICogRG8gTk9UIGNyZWF0ZSBoYXJkY29kZWQgc3RhZ2UgbmFtZSBtYXBwaW5ncyBlbHNld2hlcmUuDQogKi8NCmV4cG9ydCBmdW5jdGlvbiBnZXRTdGFnZU5hbWVGb3JOdW1iZXIoc3RhZ2VOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7DQogIGlmIChzdGFnZU51bWJlciA9PT0gMCkgcmV0dXJuICdJbmNlcHRpb24nOw0KICBjb25zdCBzdGFnZSA9IGdldFN0YWdlQnlOdW1iZXIoc3RhZ2VOdW1iZXIpOw0KICByZXR1cm4gc3RhZ2U/LnN0YWdlTmFtZSB8fCBgU3RhZ2UgJHtzdGFnZU51bWJlcn1gOw0KfQ0K';

const TYPE_BLOCK = Buffer.from(TYPE_BLOCK_B64, 'base64').toString('utf8');
const HELPER_BLOCK = Buffer.from(HELPER_BLOCK_B64, 'base64').toString('utf8');

// Generated banner — the ONE allowed difference from the committed file.
const GENERATED_BANNER = [
  '/**',
  ' * Venture Workflow Configuration - Single Source of Truth (SSOT) MIRROR',
  ' *',
  ' * GENERATED FILE — DO NOT HAND-EDIT.',
  ' *',
  ' * Source of truth: the `venture_stages` table (EHG_Engineer database).',
  ' * Regenerate via (in EHG_Engineer): node scripts/generate-stage-config.cjs --write',
  ' * Drift is enforced in CI by: npm run venture-stages:check',
  ' *',
  ' * Vision V2 defines exactly 26 stages with kill gates and promotion gates.',
  ' * All components, routers, and workflows import from here.',
  ' *',
  ' * @see SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-D',
  ' */',
].join('\r\n');

// Per-stage preamble: exact comment/blank-line text emitted BEFORE the `{` of a
// stage. Captured byte-for-byte from the committed file (section comments are
// irregular and cannot be derived from row data). Each entry is the lines that
// precede the stage object; CRLF is added by the line joiner.
const STAGE_PREAMBLE = {
  1: ['  // ========== THE_TRUTH (Stages 1-5) - Validation & Market Reality =========='],
  6: ['', '  // ========== THE_ENGINE (Stages 6-9) - Business Model Foundation =========='],
  11: ['', '  // ========== THE_IDENTITY (Stages 10-12) - Brand & Go-to-Market =========='],
  13: ['', '  // ========== THE_BLUEPRINT (Stages 13-16) - Technical Architecture =========='],
  16: ['', '  // Stage 16 continues THE_BLUEPRINT phase'],
  17: ['  // Stage 17: Blueprint Review Gate — aggregates stages 1-16 quality'],
  18: ['', '  // ========== THE_BUILD (Stages 18-23) - Implementation =========='],
  24: ['', '  // ========== THE_LAUNCH (Stages 24-26) - Launch & Go-Live =========='],
};

// TS single-quote string literal (escapes backslash then single quote).
function tsStr(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// Render one stage object literal (array of lines, no trailing CRLF).
function renderStageObject(row) {
  const lines = [];
  lines.push('  {');
  lines.push(`    stageNumber: ${row.stage_number},`);
  lines.push(`    stageName: ${tsStr(row.stage_name)},`);
  lines.push(`    stageKey: ${tsStr(deriveStageKey(row))},`);
  lines.push(`    componentPath: ${tsStr(row.component_path)},`);
  lines.push(`    gateType: ${tsStr(row.gate_type)},`);
  if (row.gate_label != null) {
    lines.push(`    gateLabel: ${tsStr(row.gate_label)},`);
  }
  // reviewMode is emitted ONLY when not the 'auto' default (mirrors the app's
  // omission of the default value in the committed file).
  if (row.review_mode && row.review_mode !== 'auto') {
    lines.push(`    reviewMode: ${tsStr(row.review_mode)},`);
  }
  lines.push(`    chunk: ${tsStr(row.chunk)},`);
  lines.push(`    description: ${tsStr(row.app_description)},`);
  lines.push('  },');
  return lines;
}

function generateVentureWorkflow(rows) {
  // Array body: preamble + object per stage.
  const bodyLines = [];
  for (const row of rows) {
    const pre = STAGE_PREAMBLE[row.stage_number];
    if (pre) bodyLines.push(...pre);
    bodyLines.push(...renderStageObject(row));
  }
  const body = bodyLines.join('\r\n');

  // Assemble byte-exact (proven via scaffold-reconstruction in EXEC):
  //   banner \r\n TYPE_BLOCK \r\n body \r\n `];` \r\n (blank) \r\n HELPER_BLOCK
  return (
    GENERATED_BANNER +
    '\r\n' +
    TYPE_BLOCK +
    '\n' +
    body +
    '\r\n' +
    '];\r\n' +
    '\r\n' +
    HELPER_BLOCK
  );
}

// ---------------------------------------------------------------------------
// Byte-parity helper: strip the leading generated banner (the `/** ... */`
// block) from a venture-workflow.ts source, returning everything from the first
// `export type GateType` line onward. Used to compare generated-vs-committed
// while allowing the header to differ (the one sanctioned difference).
// ---------------------------------------------------------------------------
function stripLeadingBanner(src) {
  const marker = 'export type GateType';
  const idx = src.indexOf(marker);
  if (idx === -1) return src; // no recognizable scaffold — compare whole
  return src.slice(idx);
}

// ---------------------------------------------------------------------------
// component_path validations (format + on-disk existence)
// ---------------------------------------------------------------------------
const COMPONENT_PATH_RE = /^Stage\d+.*\.tsx$/;

function validateComponentPaths(rows) {
  const errors = [];
  const stagesDir = path.join(path.dirname(VENTURE_WORKFLOW_PATH), '..', 'components', 'stages');
  for (const row of rows) {
    const cp = row.component_path;
    if (!cp) {
      errors.push(`stage ${row.stage_number}: component_path is null`);
      continue;
    }
    if (!COMPONENT_PATH_RE.test(cp)) {
      errors.push(`stage ${row.stage_number}: component_path '${cp}' does not match ${COMPONENT_PATH_RE}`);
      continue;
    }
    const onDisk = path.join(stagesDir, cp);
    if (!fs.existsSync(onDisk)) {
      errors.push(`stage ${row.stage_number}: component file not found on disk: ${onDisk}`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const supabase = getSupabase();
  const rows = await loadVentureStages(supabase);
  console.error(`Loaded ${rows.length} rows from venture_stages (SSOT)`);

  const stageConfigOut = generateStageConfig(rows);
  const ventureWorkflowOut = generateVentureWorkflow(rows);

  if (FLAG_CHECK) {
    let failed = false;

    // 1. stage-config.js byte-compare
    if (!fs.existsSync(STAGE_CONFIG_PATH)) {
      console.error(`CHECK FAILED: ${STAGE_CONFIG_PATH} does not exist`);
      failed = true;
    } else if (fs.readFileSync(STAGE_CONFIG_PATH, 'utf8') !== stageConfigOut) {
      console.error('CHECK FAILED: stage-config.js is out of date vs venture_stages.');
      console.error('  Run: node scripts/generate-stage-config.cjs --write');
      failed = true;
    } else {
      console.error('CHECK OK: stage-config.js matches venture_stages.');
    }

    // 2. venture-workflow.ts byte-compare (banner-stripped)
    if (!fs.existsSync(VENTURE_WORKFLOW_PATH)) {
      console.error(`CHECK FAILED: ${VENTURE_WORKFLOW_PATH} does not exist`);
      failed = true;
    } else {
      const committed = fs.readFileSync(VENTURE_WORKFLOW_PATH, 'utf8');
      if (stripLeadingBanner(committed) !== stripLeadingBanner(ventureWorkflowOut)) {
        console.error('CHECK FAILED: venture-workflow.ts is out of date vs venture_stages (byte-parity broken).');
        console.error('  Run (in EHG_Engineer): node scripts/generate-stage-config.cjs --write');
        failed = true;
      } else {
        console.error('CHECK OK: venture-workflow.ts byte-parity holds (banner-stripped).');
      }
    }

    // 3. component_path format + on-disk existence
    const cpErrors = validateComponentPaths(rows);
    if (cpErrors.length) {
      console.error('CHECK FAILED: component_path validation:');
      for (const e of cpErrors) console.error('  - ' + e);
      failed = true;
    } else {
      console.error('CHECK OK: all 26 component_path valid + exist on disk.');
    }

    if (failed) { process.exitCode = 1; return; }
    console.error('CHECK PASSED: venture_stages, stage-config.js, and venture-workflow.ts are in sync.');
    process.exitCode = 0;
    return;
  }

  if (FLAG_WRITE) {
    fs.mkdirSync(path.dirname(STAGE_CONFIG_PATH), { recursive: true });
    fs.writeFileSync(STAGE_CONFIG_PATH, stageConfigOut, 'utf8');
    console.error(`Wrote ${STAGE_CONFIG_PATH}`);

    fs.writeFileSync(VENTURE_WORKFLOW_PATH, ventureWorkflowOut, 'utf8');
    console.error(`Wrote ${VENTURE_WORKFLOW_PATH}`);
    process.exitCode = 0;
    return;
  }

  // Default: dry-run stage-config to stdout.
  process.stdout.write(stageConfigOut);
}

// Only run when invoked directly (not when imported as a module).
if (require.main === module) {
  main().catch((err) => {
    console.error(`FATAL: ${err.message}`);
    process.exitCode = 1;
  });
}
