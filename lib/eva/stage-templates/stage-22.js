/**
 * Stage 22 Template — Visual Assets
 * Phase: BUILD & MARKET (Stages 18-22)
 * SD: SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001-A (21<->22 swap: strategy drives creative)
 *
 * Device-framed screenshots, social media graphics, video storyboards. Stage_number 22
 * now executes Visual Assets (it runs AFTER Distribution Setup, which moved to 21).
 * The engine dispatches by stage_number -> fixed stage-NN.js filename, so this file
 * (not component_path) is the load-bearing binding for what stage 22 runs.
 *
 * @module lib/eva/stage-templates/stage-22
 */

import { extractOutputSchema, ensureOutputSchema } from './output-schema-extractor.js';
import { analyzeStage21VisualAssets } from './analysis-steps/stage-21-visual-assets.js';

const TEMPLATE = {
  id: 'stage-22',
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
