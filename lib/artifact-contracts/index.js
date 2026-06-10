/**
 * Artifact-contract single source of truth (SD-LEO-INFRA-ARTIFACT-CONTRACT-SINGLE-001).
 *
 * validateArtifact(klass, payload, {mode}) — pure, synchronous, no DB.
 *   mode 'shape'     — gate parity: exactly the checks add-prd's
 *                      validateContentPayloadShape enforces (type/shape of
 *                      keys WHEN PRESENT). This is what the gate imports.
 *   mode 'authoring' — strict: shape + required keys + minItems + exactKeys.
 *                      This is what `npm run contract:check` runs so authors
 *                      see the FULL contract before any gate does.
 *
 * Violations are self-describing: {field, expected, got, hint}.
 */
import { PRD_FIELD_SPECS, scaffoldPrd } from './prd-contract.js';
import { SD_FIELD_SPECS, scaffoldSd, validateSdExtras } from './sd-contract.js';

export { PRD_FIELD_SPECS, SD_FIELD_SPECS };

const SPECS = { prd: PRD_FIELD_SPECS, sd: SD_FIELD_SPECS };
const SCAFFOLDS = { prd: scaffoldPrd, sd: scaffoldSd };

const typeOf = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);

/**
 * Generic shape check for one spec entry. Returns violations ({field, expected, got, hint}).
 * 'shape' mode checks ONLY keys present in the payload (gate parity);
 * 'authoring' mode additionally enforces required/minItems/exactKeys.
 */
function checkField(spec, payload, mode) {
  const violations = [];
  const present = spec.field in payload;

  if (!present) {
    if (mode === 'authoring' && spec.required) {
      violations.push({ field: spec.field, expected: `${spec.shape} (required)`, got: 'missing', hint: spec.hint });
    }
    return violations;
  }

  const v = payload[spec.field];
  switch (spec.shape) {
    case 'array':
      if (!Array.isArray(v)) violations.push({ field: spec.field, expected: 'array', got: typeOf(v), hint: spec.hint });
      break;
    case 'object':
      if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        violations.push({ field: spec.field, expected: 'object', got: typeOf(v), hint: spec.hint });
      }
      break;
    case 'arrayOfObjects':
      if (!Array.isArray(v)) {
        violations.push({ field: spec.field, expected: 'array', got: typeOf(v), hint: spec.hint });
      } else {
        v.forEach((item, idx) => {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) {
            violations.push({ field: `${spec.field}[${idx}]`, expected: 'object', got: typeOf(item), hint: spec.hint });
          }
        });
      }
      break;
    case 'string':
      // Gate parity: add-prd does not type-check string fields — authoring mode only.
      if (mode === 'authoring' && typeof v !== 'string') {
        violations.push({ field: spec.field, expected: 'string', got: typeOf(v), hint: spec.hint });
      }
      break;
    default:
      break;
  }

  // Nested shape checks (e.g. system_architecture.components must be an array)
  // are part of the GATE behavior (add-prd recursion) — both modes.
  if (spec.nested && typeof v === 'object' && v !== null && !Array.isArray(v)) {
    for (const n of spec.nested) {
      if (n.path in v && n.shape === 'array' && !Array.isArray(v[n.path])) {
        violations.push({
          field: `${spec.field}.${n.path}`, expected: 'array', got: typeOf(v[n.path]), hint: spec.hint,
        });
      }
    }
  }

  if (mode === 'authoring') {
    if (spec.minItems && Array.isArray(v) && v.length < spec.minItems) {
      violations.push({ field: spec.field, expected: `>=${spec.minItems} items`, got: `${v.length} items`, hint: spec.hint });
    }
    if (spec.exactKeys && typeof v === 'object' && v !== null && !Array.isArray(v)) {
      const keys = Object.keys(v).sort();
      const want = [...spec.exactKeys].sort();
      if (JSON.stringify(keys) !== JSON.stringify(want)) {
        violations.push({
          field: spec.field,
          expected: `object with exactly the keys: ${spec.exactKeys.join(', ')}`,
          got: `keys: ${keys.join(', ') || '(none)'}`,
          hint: spec.hint,
        });
      }
    }
  }

  return violations;
}

/**
 * Validate a payload against an artifact contract.
 *
 * @param {'sd'|'prd'} klass
 * @param {object} payload
 * @param {{mode?: 'shape'|'authoring'}} [opts]
 * @returns {{valid: boolean, violations: Array, warnings: Array}}
 */
export function validateArtifact(klass, payload, opts = {}) {
  const mode = opts.mode || 'authoring';
  const specs = SPECS[klass];
  if (!specs) throw new Error(`Unknown artifact class: ${klass} (expected 'sd' or 'prd')`);

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      violations: [{ field: '(top-level)', expected: 'object', got: typeOf(payload), hint: 'The artifact payload must be a JSON object.' }],
      warnings: [],
    };
  }

  const violations = [];
  let warnings = [];
  for (const spec of specs) violations.push(...checkField(spec, payload, mode));

  // SD-specific extras (canonical metrics delegation + boilerplate-smoke advisory)
  // run in authoring mode only — shape mode mirrors add-prd's PRD checks and has
  // no SD gate counterpart today.
  if (klass === 'sd' && mode === 'authoring') {
    const extras = validateSdExtras(payload);
    violations.push(...extras.violations);
    warnings = extras.warnings;
  }

  return { valid: violations.length === 0, violations, warnings };
}

/**
 * Render violations as the multi-line, field-level message used in
 * CONTENT_SHAPE_VIOLATION errors and the contract:check CLI.
 */
export function formatViolations(violations) {
  return violations
    .map((v) => `  - .${v.field.replace(/^\./, '')}: expected ${v.expected}, got ${v.got}${v.hint ? `\n      hint: ${v.hint}` : ''}`)
    .join('\n');
}

/** Return a valid authoring skeleton for the class (passes its own validation). */
export function scaffold(klass) {
  const fn = SCAFFOLDS[klass];
  if (!fn) throw new Error(`Unknown artifact class: ${klass} (expected 'sd' or 'prd')`);
  return fn();
}
