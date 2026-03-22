/**
 * Stage 20 Template - Quality Assurance
 * Phase: THE BUILD LOOP (Stages 17-22)
 * Part of SD-LEO-FEAT-TMPL-BUILD-001
 *
 * Quality assurance with test suites, coverage metrics,
 * and overall quality scoring.
 *
 * @module lib/eva/stage-templates/stage-20
 */

import { validateString, validateNumber, validateArray, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage20 } from './analysis-steps/stage-21-quality-assurance.js';

const DEFECT_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DEFECT_STATUSES = ['open', 'investigating', 'resolved', 'deferred', 'wont_fix'];
const MIN_TEST_SUITES = 1;
const MIN_COVERAGE_PCT = 60;
const TEST_SUITE_TYPES = ['unit', 'integration', 'e2e'];
const QUALITY_DECISIONS = ['pass', 'conditional_pass', 'fail'];

const TEMPLATE = {
  id: 'stage-20',
  slug: 'quality-assurance',
  title: 'Quality Assurance',
  version: '2.0.0',
  schema: {
    test_suites: {
      type: 'array',
      minItems: MIN_TEST_SUITES,
      items: {
        name: { type: 'string', required: true },
        type: { type: 'enum', values: TEST_SUITE_TYPES },
        total_tests: { type: 'number', min: 0, required: true },
        passing_tests: { type: 'number', min: 0, required: true },
        coverage_pct: { type: 'number', min: 0, max: 100 },
      },
    },
    known_defects: {
      type: 'array',
      items: {
        description: { type: 'string', required: true },
        severity: { type: 'enum', values: DEFECT_SEVERITIES, required: true },
        status: { type: 'enum', values: DEFECT_STATUSES, required: true },
      },
    },
    // Derived
    overall_pass_rate: { type: 'number', derived: true },
    coverage_pct: { type: 'number', derived: true },
    critical_failures: { type: 'number', derived: true },
    totalFailures: { type: 'number', derived: true },
    total_tests: { type: 'number', derived: true },
    total_passing: { type: 'number', derived: true },
    quality_gate_passed: { type: 'boolean', derived: true },
    qualityDecision: { type: 'object', derived: true },
  },
  defaultData: {
    test_suites: [],
    known_defects: [],
    overall_pass_rate: 0,
    coverage_pct: 0,
    critical_failures: 0,
    totalFailures: 0,
    total_tests: 0,
    total_passing: 0,
    quality_gate_passed: false,
    qualityDecision: null,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];

    const suitesCheck = validateArray(data?.test_suites, 'test_suites', MIN_TEST_SUITES);
    if (!suitesCheck.valid) {
      errors.push(suitesCheck.error);
    } else {
      for (let i = 0; i < data.test_suites.length; i++) {
        const ts = data.test_suites[i];
        const prefix = `test_suites[${i}]`;
        const results = [
          validateString(ts?.name, `${prefix}.name`, 1),
          validateNumber(ts?.total_tests, `${prefix}.total_tests`, 0),
          validateNumber(ts?.passing_tests, `${prefix}.passing_tests`, 0),
        ];
        if (ts?.type != null) {
          results.push(validateEnum(ts.type, `${prefix}.type`, TEST_SUITE_TYPES));
        }
        errors.push(...collectErrors(results));

        if (typeof ts?.passing_tests === 'number' && typeof ts?.total_tests === 'number' && ts.passing_tests > ts.total_tests) {
          errors.push(`${prefix}.passing_tests (${ts.passing_tests}) cannot exceed total_tests (${ts.total_tests})`);
        }
      }
    }

    if (data?.known_defects && Array.isArray(data.known_defects)) {
      for (let i = 0; i < data.known_defects.length; i++) {
        const d = data.known_defects[i];
        const prefix = `known_defects[${i}]`;
        const results = [
          validateString(d?.description, `${prefix}.description`, 1),
          validateEnum(d?.severity, `${prefix}.severity`, DEFECT_SEVERITIES),
          validateEnum(d?.status, `${prefix}.status`, DEFECT_STATUSES),
        ];
        errors.push(...collectErrors(results));
      }
    }

    if (errors.length > 0) { logger.warn('[Stage20] Validation failed', { errorCount: errors.length, errors }); }
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data, { logger: _logger = console } = {}) {
    // Dead code: all derivations handled by analysisStep.
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage20;
ensureOutputSchema(TEMPLATE);

export { DEFECT_SEVERITIES, DEFECT_STATUSES, MIN_TEST_SUITES, MIN_COVERAGE_PCT, TEST_SUITE_TYPES, QUALITY_DECISIONS };
export default TEMPLATE;
