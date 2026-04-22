/**
 * Stage 20 Template — Code Quality Gate
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-C
 *
 * Automated code quality validation: clones GitHub repo, runs npm audit,
 * secret detection, lint, and test suite. Returns pass/fail verdict.
 *
 * @module lib/eva/stage-templates/stage-20
 */

import { validateString, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage20CodeQuality, VERDICT_OPTIONS } from './analysis-steps/stage-20-code-quality.js';

const TEMPLATE = {
  id: 'stage-20',
  slug: 'code-quality-gate',
  title: 'Code Quality Gate',
  version: '3.0.0',
  schema: {
    verdict: { type: 'enum', values: VERDICT_OPTIONS, required: true },
    repo_url: { type: 'string' },
    venture_name: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        check: { type: 'string', required: true },
        title: { type: 'string', required: true },
        severity: { type: 'string', required: true },
        detail: { type: 'string' },
      },
    },
    summary: {
      type: 'object',
      properties: {
        total_findings: { type: 'number' },
        by_severity: { type: 'object' },
        by_check: { type: 'object' },
      },
    },
    checks_run: { type: 'number', derived: true },
  },
  defaultData: {
    verdict: null,
    repo_url: null,
    findings: [],
    summary: { total_findings: 0, by_severity: {}, by_check: {} },
    checks_run: 0,
  },

  validate(data, { logger = console } = {}) {
    const errors = [];
    if (!data?.verdict) errors.push('verdict is required');
    else {
      const verdictCheck = validateEnum(data.verdict, 'verdict', VERDICT_OPTIONS);
      if (!verdictCheck.valid) errors.push(verdictCheck.error);
    }
    if (errors.length > 0) logger.warn('[Stage20-CodeQuality] Validation failed', { errors });
    return { valid: errors.length === 0, errors };
  },

  computeDerived(data) {
    return { ...data };
  },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage20CodeQuality;
ensureOutputSchema(TEMPLATE);

export default TEMPLATE;
