/**
 * Stage 20 Template — Unified Quality Gate (Code Review + QA + UAT)
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD-LEO-ORCH-QUALITY-LIFECYCLE-LOOP-001-A reconciled the Stage 20 definition
 * across three divergent sources (canonical templates / legacy dispatcher /
 * DB stage_config) into one canonical spec covering 10 finding categories.
 *
 * Original SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-C
 *
 * Canonical finding categories (see lib/eva/quality-findings/finding-shape.js):
 *   Code Review:  npm_audit, secrets, lint, test_suite, capability
 *   QA:           unit_test, e2e_test
 *   UAT:          uat_test, bug_report, uat_signoff
 *
 * @module lib/eva/stage-templates/stage-20
 */

import { validateString, validateEnum, collectErrors } from './validation.js';
import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage20CodeQuality, VERDICT_OPTIONS } from './analysis-steps/stage-20-code-quality.js';
import { FINDING_CATEGORIES } from '../../quality-findings/finding-shape.js';

const TEMPLATE = {
  id: 'stage-20',
  slug: 'quality-gate',
  title: 'Stage 20 Quality Gate',
  version: '3.1.0',
  finding_categories: FINDING_CATEGORIES,
  schema: {
    verdict: { type: 'enum', values: VERDICT_OPTIONS, required: true },
    repo_url: { type: 'string' },
    venture_name: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        check: { type: 'string', required: true, enum: FINDING_CATEGORIES },
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
