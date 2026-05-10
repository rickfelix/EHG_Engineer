/**
 * SD-FDBK-ENH-SCRIPTS-ADD-PRD-001 FR-2
 *
 * Pre-INSERT schema validator for product_requirements_v2. Reads the committed
 * lib/db-schema/product-requirements-v2.json snapshot and surfaces ALL constraint
 * violations together — closes 16th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001.
 *
 * Hard violations (throw):
 *   NOT_NULL_NO_DEFAULT | VARCHAR_OVERFLOW | ENUM_CHECK | RANGE_CHECK
 *   JSONB_MIN_ELEMENTS | CONDITIONAL_TRIGGER_PAIR
 * Soft warnings (log, do not throw):
 *   NOT_NULL_WITH_DEFAULT | INTROSPECTION_UNSUPPORTED_CHECK | SNAPSHOT_MISSING_GRACEFUL_DEGRADE
 *
 * 3-layer validation order in scripts/prd/prd-creator.js:
 *   validatePRDFields (content quality) → validatePrdRow (schema) → DB-side CHECK
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.resolve(__dirname, '..', '..', 'lib', 'db-schema', 'product-requirements-v2.json');

export const CONSTRAINT_CLASSIFICATION = Object.freeze({
  HARD: ['NOT_NULL_NO_DEFAULT', 'VARCHAR_OVERFLOW', 'ENUM_CHECK', 'RANGE_CHECK', 'JSONB_MIN_ELEMENTS', 'CONDITIONAL_TRIGGER_PAIR'],
  SOFT: ['NOT_NULL_WITH_DEFAULT', 'INTROSPECTION_UNSUPPORTED_CHECK', 'SNAPSHOT_MISSING_GRACEFUL_DEGRADE'],
});

export class PRDValidationError extends Error {
  constructor(violations, schema_version) {
    const lines = violations.map((v) => `  • [${v.kind}] ${v.column}: ${v.message}`);
    super(
      `PRD schema validation failed (${violations.length} violation(s) against schema_version=${schema_version}):\n${lines.join('\n')}`
    );
    this.name = 'PRDValidationError';
    this.code = 'PRD_SCHEMA_VALIDATION_FAILED';
    this.violations = violations;
    this.schema_version = schema_version;
  }
}

let _cachedSnapshot = null;
let _snapshotMissingWarned = false;

function loadSnapshot() {
  if (_cachedSnapshot !== null) return _cachedSnapshot;
  if (!fs.existsSync(SNAPSHOT_PATH)) {
    if (!_snapshotMissingWarned) {
      console.warn(`[schema-validator] snapshot missing at ${SNAPSHOT_PATH}; skip-validate (run npm run schema:snapshot:prd)`);
      _snapshotMissingWarned = true;
    }
    _cachedSnapshot = false;
    return false;
  }
  _cachedSnapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
  return _cachedSnapshot;
}

function _resetCacheForTests() {
  _cachedSnapshot = null;
  _snapshotMissingWarned = false;
}

/**
 * Validate a candidate PRD row against the committed schema snapshot.
 * Pure function — no DB round-trip. Collects ALL violations (no short-circuit).
 *
 * @param {Object} prdRow - Candidate row for product_requirements_v2.insert()
 * @param {Object} [snapshot] - Optional snapshot override (for tests). Defaults to committed JSON.
 * @returns {{ ok: boolean, violations: Array, warnings: Array, schema_version: string|null }}
 */
export function validatePrdRow(prdRow, snapshot) {
  if (!snapshot) snapshot = loadSnapshot();
  if (snapshot === false) {
    return {
      ok: true,
      violations: [],
      warnings: [{ kind: 'SNAPSHOT_MISSING_GRACEFUL_DEGRADE', column: '*', message: 'snapshot file missing; skip-validate' }],
      schema_version: null,
    };
  }

  const violations = [];
  const warnings = [];
  const triggerExempt = new Set(snapshot.trigger_controlled_columns || []);

  // 1. NOT NULL no-default — must be supplied. Trigger-controlled exempt.
  for (const col of snapshot.not_null_no_default || []) {
    if (triggerExempt.has(col)) continue;
    if (prdRow[col] === undefined || prdRow[col] === null) {
      violations.push({ kind: 'NOT_NULL_NO_DEFAULT', column: col, expected: 'non-null', actual: prdRow[col], message: `column ${col} is NOT NULL with no default; supply a value` });
    }
  }

  // 2. Conditional trigger pairs (e.g. directive_id<->sd_id) — at least one must be filled.
  for (const pair of snapshot.conditional_trigger_pairs || []) {
    const allMissing = pair.every((c) => prdRow[c] === undefined || prdRow[c] === null);
    if (allMissing) {
      violations.push({ kind: 'CONDITIONAL_TRIGGER_PAIR', column: pair.join('+'), expected: `at least one of [${pair.join(', ')}] non-null`, actual: 'all-null', message: `conditional trigger pair [${pair.join(', ')}] requires at least one column to be supplied (sync_prd_sd_linking trigger fills the other)` });
    }
  }

  // 3. Varchar overflow
  for (const v of snapshot.varchar_columns || []) {
    if (triggerExempt.has(v.name)) continue;
    const val = prdRow[v.name];
    if (typeof val === 'string' && val.length > v.max_length) {
      violations.push({ kind: 'VARCHAR_OVERFLOW', column: v.name, expected: `≤${v.max_length} chars`, actual: `${val.length} chars`, message: `column ${v.name} exceeds varchar(${v.max_length}) — got ${val.length} chars` });
    }
  }

  // 4. CHECK constraints — dispatch by kind
  for (const cc of snapshot.check_constraints || []) {
    const col = (cc.columns_referenced || [])[0];
    if (!col || triggerExempt.has(col)) continue;
    const val = prdRow[col];
    if (val === undefined || val === null) continue; // NULL handled by NOT NULL pass

    if (cc.kind === 'enum' && cc.parsed_rule?.allowed_values) {
      if (!cc.parsed_rule.allowed_values.includes(String(val))) {
        violations.push({ kind: 'ENUM_CHECK', column: col, expected: cc.parsed_rule.allowed_values, actual: val, message: `column ${col} must be one of [${cc.parsed_rule.allowed_values.join(', ')}] — got "${val}"` });
      }
    } else if (cc.kind === 'range' && cc.parsed_rule) {
      const num = Number(val);
      if (Number.isNaN(num) || num < cc.parsed_rule.min || num > cc.parsed_rule.max) {
        violations.push({ kind: 'RANGE_CHECK', column: col, expected: `${cc.parsed_rule.min}..${cc.parsed_rule.max}`, actual: val, message: `column ${col} must be in [${cc.parsed_rule.min}, ${cc.parsed_rule.max}] — got ${val}` });
      }
    } else if (cc.kind === 'other') {
      warnings.push({ kind: 'INTROSPECTION_UNSUPPORTED_CHECK', column: col, message: `CHECK constraint ${cc.name} not classified — skipped (definition: ${cc.definition.slice(0, 100)})` });
    }
    // jsonb_element_presence is handled below via hand_coded_jsonb_shape_rules
  }

  // 5. JSONB element-presence (hand-coded rules — DB CHECK is not regex-parseable)
  const jsonbRules = snapshot.hand_coded_jsonb_shape_rules || {};
  for (const [col, rule] of Object.entries(jsonbRules)) {
    if (triggerExempt.has(col)) continue;
    const val = prdRow[col];
    if (val === undefined || val === null) continue; // NULL handled by NOT NULL
    if (rule.min_elements !== undefined) {
      const len = Array.isArray(val) ? val.length : (val && typeof val === 'object' ? Object.keys(val).length : 0);
      if (len < rule.min_elements) {
        violations.push({ kind: 'JSONB_MIN_ELEMENTS', column: col, expected: `≥${rule.min_elements} elements`, actual: `${len} elements`, message: `column ${col} requires ≥${rule.min_elements} elements — got ${len}` });
      }
    }
  }

  return { ok: violations.length === 0, violations, warnings, schema_version: snapshot.schema_version };
}

// Internal export for tests only
export const __test__ = { _resetCacheForTests, loadSnapshot, SNAPSHOT_PATH };
