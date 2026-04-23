/**
 * PRD Field Pre-Validator
 * SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-034 / PAT-AUTO-516d5d5e, PAT-AUTO-471ca922
 *
 * Validates a PRD object has all 7 required fields with non-boilerplate content
 * before PLAN-TO-EXEC handoff attempt. Prevents "PRD quality 51/100" gate failures
 * by surfacing missing fields early.
 *
 * Usage:
 *   import { validatePRDFields } from './scripts/prd/validate-prd-fields.js';
 *   const result = validatePRDFields(prdObject);
 *   if (!result.valid) console.warn(result.warnings.join('\n'));
 */

import fs from 'fs';
import path from 'path';

const REQUIRED_FIELDS = [
  'executive_summary',
  'functional_requirements',
  'system_architecture',
  'acceptance_criteria',
  'test_scenarios',
  'implementation_approach',
  'risks',
];

const BOILERPLATE_PATTERNS = [
  /^(to be defined|tbd|to be determined|will be defined|pending|n\/a|not applicable)$/i,
  /^<[^>]+>$/,  // Template placeholders like <description>
  /^\[.*\]$/,   // Brackets-only content like [placeholder]
];

const MIN_ARRAY_LENGTH = 3;
const MIN_STRING_LENGTH = 50;

function isBoilerplate(value) {
  if (typeof value === 'string') {
    return BOILERPLATE_PATTERNS.some(p => p.test(value.trim()));
  }
  return false;
}

function checkField(fieldName, value) {
  if (value === null || value === undefined) {
    return `${fieldName}: MISSING (null/undefined)`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return `${fieldName}: EMPTY array`;
    if (value.length < MIN_ARRAY_LENGTH) return `${fieldName}: only ${value.length} item(s), need ≥${MIN_ARRAY_LENGTH}`;
    return null;
  }
  if (typeof value === 'string') {
    if (value.trim().length === 0) return `${fieldName}: EMPTY string`;
    if (value.trim().length < MIN_STRING_LENGTH) return `${fieldName}: too short (${value.trim().length} chars, need ≥${MIN_STRING_LENGTH})`;
    if (isBoilerplate(value)) return `${fieldName}: boilerplate content detected ("${value.trim().slice(0, 40)}...")`;
    return null;
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return `${fieldName}: EMPTY object`;
    return null;
  }
  return null;
}

/**
 * Validate a PRD object for required fields and content quality.
 * @param {Object} prd - PRD object from product_requirements_v2
 * @returns {{ valid: boolean, warnings: string[], missing: string[], lowQuality: string[] }}
 */
export function validatePRDFields(prd) {
  if (!prd || typeof prd !== 'object') {
    return { valid: false, warnings: ['PRD is null or not an object'], missing: REQUIRED_FIELDS, lowQuality: [] };
  }

  const missing = [];
  const lowQuality = [];
  const warnings = [];

  for (const field of REQUIRED_FIELDS) {
    const issue = checkField(field, prd[field]);
    if (issue) {
      if (prd[field] === null || prd[field] === undefined) {
        missing.push(field);
      } else {
        lowQuality.push(field);
      }
      warnings.push(`⚠️  ${issue}`);
    }
  }

  const valid = missing.length === 0 && lowQuality.length === 0;
  return { valid, warnings, missing, lowQuality };
}

// File extensions that trigger existence checking.
// SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A (US-003).
const CHECKED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sql', '.sh', '.md', '.json', '.yaml', '.yml']);

// Extract path-like tokens from a string. A path token starts with a word char or
// 'src/' / 'scripts/' / 'lib/' / 'database/' / 'tests/' / 'docs/' style prefix and
// ends in a recognized extension.
function extractFilePaths(text) {
  if (typeof text !== 'string') return [];
  const out = [];
  // Longer extensions must precede shorter prefixes (tsx before ts, mjs before js, yaml before yml-free js).
  const rx = /(?:^|[\s`"'(\[])((?:src|scripts|lib|database|tests|docs|public|config)[\/\\][\w.\-\/\\]+\.(?:tsx|ts|mjs|cjs|js|sql|sh|md|json|yaml|yml))\b/gi;
  let m;
  while ((m = rx.exec(text)) !== null) {
    out.push(m[1].replace(/\\/g, '/'));
  }
  return out;
}

// Walk any PRD field value and collect path tokens.
function harvestPaths(value, acc = []) {
  if (value == null) return acc;
  if (typeof value === 'string') {
    acc.push(...extractFilePaths(value));
    return acc;
  }
  if (Array.isArray(value)) {
    value.forEach(v => harvestPaths(v, acc));
    return acc;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(v => harvestPaths(v, acc));
    return acc;
  }
  return acc;
}

// Convert a glob (**/ for 0+ segments, * for chars-in-segment, ? for one char) to RegExp.
// Mirror of scope-completion-gate.globToRegExp (duplicated to avoid cross-module dep).
function globToRegExpLocal(glob) {
  let src = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') { src += '(?:.*/)?'; i += 2; }
      else { src += '.*'; i += 1; }
    } else if (c === '*') src += '[^/]*';
    else if (c === '?') src += '.';
    else if ('.+^${}()|[]\\'.includes(c)) src += '\\' + c;
    else src += c;
  }
  return new RegExp('^' + src + '$');
}

// Find the nearest matching file in the same directory (basename-prefix match).
function findNearestMatch(candidate, projectRoot, fs, path) {
  try {
    const abs = path.resolve(projectRoot, candidate);
    const dir = path.dirname(abs);
    const base = path.basename(candidate, path.extname(candidate));
    if (!fs.existsSync(dir)) return null;
    const siblings = fs.readdirSync(dir);
    const match = siblings.find(f => path.basename(f, path.extname(f)) === base && f !== path.basename(candidate));
    return match ? path.join(path.dirname(candidate), match).replace(/\\/g, '/') : null;
  } catch { return null; }
}

/**
 * Validate that file references inside PRD string fields resolve to actual files.
 * Emits warn-level findings (non-blocking). Synchronous fs checks.
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A (US-003).
 *
 * @param {Object} prd - PRD object
 * @param {Object} [deps] - optional injectable deps for testing ({ fs, path, projectRoot })
 * @returns {{ warnings: string[], checked: number, missing: number }}
 */
export function validateFileExtensions(prd, deps = {}) {
  const fsImpl = deps.fs || fs;
  const pathImpl = deps.path || path;
  const projectRoot = deps.projectRoot || process.env.CLAUDE_PROJECT_DIR || process.cwd();

  const scanFields = ['executive_summary', 'system_architecture', 'implementation_approach', 'functional_requirements', 'acceptance_criteria', 'test_scenarios', 'risks'];
  const candidates = new Set();
  for (const f of scanFields) {
    harvestPaths(prd?.[f], Array.from({ length: 0 })).forEach(p => candidates.add(p));
    const arr = [];
    harvestPaths(prd?.[f], arr);
    arr.forEach(p => candidates.add(p));
  }

  const warnings = [];
  let missing = 0;
  for (const candidate of candidates) {
    const ext = pathImpl.extname(candidate).toLowerCase();
    if (!CHECKED_EXTENSIONS.has(ext)) continue;
    const abs = pathImpl.resolve(projectRoot, candidate);
    if (fsImpl.existsSync(abs)) continue;
    missing += 1;
    const nearest = findNearestMatch(candidate, projectRoot, fsImpl, pathImpl);
    const hint = nearest ? ` (nearest match: ${nearest})` : '';
    warnings.push(`⚠️  File reference not found: ${candidate}${hint}`);
  }

  return { warnings, checked: candidates.size, missing };
}

/**
 * Detect parent-scope leakage: when SD has scope_slice declared but PRD deliverables
 * reference paths/stages outside the declared slice. Warn-only.
 * SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-A (US-004).
 *
 * @param {Object} prd - PRD object
 * @param {Object} sd - SD row (must include scope_slice + parent_sd_id)
 * @returns {{ warnings: string[], leaked: number, total: number, skipped: boolean }}
 */
export function detectParentScopeLeakage(prd, sd) {
  if (!sd?.parent_sd_id || !sd?.scope_slice) {
    return { warnings: [], leaked: 0, total: 0, skipped: true };
  }

  const stages = Array.isArray(sd.scope_slice.stages) ? sd.scope_slice.stages.map(String) : null;
  const globs = Array.isArray(sd.scope_slice.deliverable_globs) ? sd.scope_slice.deliverable_globs : null;
  if ((!stages || stages.length === 0) && (!globs || globs.length === 0)) {
    return { warnings: [], leaked: 0, total: 0, skipped: true };
  }

  const paths = [];
  const scanFields = ['acceptance_criteria', 'functional_requirements', 'test_scenarios', 'system_architecture', 'implementation_approach'];
  for (const f of scanFields) harvestPaths(prd?.[f], paths);

  const unique = Array.from(new Set(paths));
  if (unique.length === 0) {
    return { warnings: [], leaked: 0, total: 0, skipped: true };
  }

  const warnings = [];
  let leaked = 0;
  for (const p of unique) {
    const lp = p.toLowerCase();
    let inSlice = false;

    if (stages && stages.length > 0) {
      inSlice = stages.some(s => [`stage${s}`, `stage_${s}`, `stage-${s}`, `stage ${s}`, `/${s}/`, `s${s}_`, `_s${s}`].some(pat => lp.includes(pat)));
    }

    if (!inSlice && globs && globs.length > 0) {
      inSlice = globs.some(g => globToRegExpLocal(g).test(p));
    }

    if (!inSlice) {
      leaked += 1;
      warnings.push(`⚠️  Deliverable outside scope_slice: ${p}`);
    }
  }

  if (leaked / unique.length > 0.5) {
    warnings.unshift(`⚠️  Parent-scope leakage detected: ${leaked}/${unique.length} deliverables reference paths outside scope_slice (>50% threshold)`);
  } else {
    // Below threshold — suppress warnings but still report for telemetry
    return { warnings: [], leaked, total: unique.length, skipped: false };
  }

  return { warnings, leaked, total: unique.length, skipped: false };
}

/**
 * Print a formatted validation report. Returns exit code (0=pass, 1=fail).
 * @param {Object} prd - PRD object
 * @param {string} sdId - SD identifier for display
 * @returns {number} 0 if valid, 1 if issues found
 */
export function printPRDValidationReport(prd, sdId = 'unknown') {
  const result = validatePRDFields(prd);

  if (result.valid) {
    console.log(`✅ PRD validation passed for ${sdId} — all 7 required fields present and non-boilerplate`);
    return 0;
  }

  console.log(`\n📋 PRD Pre-Validation Report for ${sdId}`);
  console.log('─'.repeat(60));
  if (result.missing.length > 0) {
    console.log(`❌ Missing fields (${result.missing.length}): ${result.missing.join(', ')}`);
  }
  if (result.lowQuality.length > 0) {
    console.log(`⚠️  Low-quality fields (${result.lowQuality.length}): ${result.lowQuality.join(', ')}`);
  }
  console.log('\nDetails:');
  result.warnings.forEach(w => console.log(`  ${w}`));
  console.log('\n💡 Fix these before running PLAN-TO-EXEC to avoid prdQualityValidation gate failure');
  return 1;
}
