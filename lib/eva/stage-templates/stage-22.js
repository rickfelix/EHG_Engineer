/**
 * Stage 22 Template — Distribution Setup
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-D
 *
 * Channel configuration, ad copy, targeting, email sequences.
 *
 * @module lib/eva/stage-templates/stage-22
 */

import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage22Distribution } from './analysis-steps/stage-22-distribution-setup.js';

const TEMPLATE = {
  id: 'stage-22',
  slug: 'distribution-setup',
  title: 'Distribution Setup',
  version: '3.0.0',
  schema: {
    channels: { type: 'array', items: { channel: { type: 'string' }, status: { type: 'string' }, ad_copy: { type: 'object' } } },
    email_sequences: { type: 'array', items: { sequence_name: { type: 'string' }, emails_count: { type: 'number' } } },
    budget_allocation: { type: 'object' },
    total_channels: { type: 'number', derived: true },
    active_channels: { type: 'number', derived: true },
    channels_with_copy: { type: 'number', derived: true },
  },
  defaultData: { channels: [], email_sequences: [], budget_allocation: {}, total_channels: 0, active_channels: 0 },
  validate(data) { return { valid: true, errors: [] }; },
  computeDerived(data) { return { ...data }; },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage22Distribution;
ensureOutputSchema(TEMPLATE);

export default TEMPLATE;
