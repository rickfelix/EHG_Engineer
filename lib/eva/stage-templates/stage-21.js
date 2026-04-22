/**
 * Stage 21 Template — Visual Assets
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-REDESIGN-S18S26-MARKETINGFIRST-POSTBUILD-ORCH-001-D
 *
 * Device-framed screenshots, social media graphics, video storyboards.
 *
 * @module lib/eva/stage-templates/stage-21
 */

import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage21VisualAssets } from './analysis-steps/stage-21-visual-assets.js';

const TEMPLATE = {
  id: 'stage-21',
  slug: 'visual-assets',
  title: 'Visual Assets',
  version: '3.0.0',
  schema: {
    device_screenshots: { type: 'array', items: { device: { type: 'string' }, scene: { type: 'string' }, alt_text: { type: 'string' } } },
    social_graphics: { type: 'array', items: { platform: { type: 'string' }, format: { type: 'string' }, headline: { type: 'string' } } },
    video_storyboard: { type: 'array', items: { scene_number: { type: 'number' }, description: { type: 'string' } } },
    total_assets: { type: 'number', derived: true },
    screenshot_count: { type: 'number', derived: true },
    social_count: { type: 'number', derived: true },
    storyboard_count: { type: 'number', derived: true },
  },
  defaultData: { device_screenshots: [], social_graphics: [], video_storyboard: [], total_assets: 0 },
  validate(data) { return { valid: true, errors: [] }; },
  computeDerived(data) { return { ...data }; },
};

TEMPLATE.outputSchema = extractOutputSchema(TEMPLATE.schema);
TEMPLATE.analysisStep = analyzeStage21VisualAssets;
ensureOutputSchema(TEMPLATE);

export default TEMPLATE;
