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
import { analyzeStage20 } from './analysis-steps/stage-20-quality-assurance.js';

const DEFECT_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DEFECT_STATUSES = ['open', 'in_progress', 'resolved', 'wont_fix', 'deferred'];
const MIN_TEST_SUITES = 1;
const MIN_COVERAGE_PCT = 60;

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
    total_tests: { type: 'number', derived: true },
    total_passing: { type: 'number', derived: true },
    quality_gate_passed: { type: 'boolean', derived: true },
  },
  defaultData: {
    test_suites: [],
    known_defects: [],
    overall_pass_rate: 0,
    coverage_pct: 0,
    critical_failures: 0,
    total_tests: 0,
    total_passing: 0,
    quality_gate_passed: false,
  },

  validate(data) {
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

    return { valid: errors.length === 0, errors };
  },

  computeDerived(data) {
    const total_tests = data.test_suites.reduce((sum, ts) => sum + ts.total_tests, 0);
    const total_passing = data.test_suites.reduce((sum, ts) => sum + ts.passing_tests, 0);
    const overall_pass_rate = total_tests > 0
      ? Math.round((total_passing / total_tests) * 10000) / 100
      : 0;

    const coverages = data.test_suites
      .filter(ts => ts.coverage_pct !== undefined && ts.coverage_pct !== null)
      .map(ts => ts.coverage_pct);
    const coverage_pct = coverages.length > 0
      ? Math.round(coverages.reduce((sum, c) => sum + c, 0) / coverages.length * 100) / 100
      : 0;

    const critical_failures = total_tests - total_passing;
    const quality_gate_passed = overall_pass_rate === 100 && coverage_pct >= MIN_COVERAGE_PCT;

    return {
      ...data,
      overall_pass_rate,
      coverage_pct,
      critical_failures,
      total_tests,
      total_passing,
      quality_gate_passed,
    };
  },
};

TEMPLATE.analysisStep = analyzeStage20;

export { DEFECT_SEVERITIES, DEFECT_STATUSES, MIN_TEST_SUITES, MIN_COVERAGE_PCT };
export default TEMPLATE;
