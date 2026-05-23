/**
 * Unit tests for mode-aware Stage-19 Replit prompt generation.
 * SD-LEO-FEAT-STAGE-REPLIT-PROMPTS-001: build-into prompts continue the existing
 * app (no "scaffold a new app", no docs/designs/ reference); create-new is
 * byte-identical to the prior behavior (FR-5). Pure functions — no DB.
 */
import { describe, it, expect } from 'vitest';
import {
  formatReplitMd,
  formatPlanModePrompt,
  formatFeaturePrompts,
} from '../../../lib/eva/bridge/replit-format-strategies.js';

const groups = [
  { group_key: 'what_to_build', artifacts: [{ content: 'A test app for users', artifact_type: 'overview' }] },
  { group_key: 'how_to_build_it', artifacts: [] },
  {
    group_key: 'sprint_plan',
    artifacts: [{
      content: JSON.stringify({
        items: [{ name: 'User Login', description: 'Login feature', story_points: 3, priority: 'high', success_criteria: 'User can log in' }],
      }),
    }],
  },
];
const venture = { name: 'TestVenture', description: 'A test venture app', targetPlatform: 'web' };
const summary = {};

describe('formatPlanModePrompt — mode-aware (FR-2/FR-3)', () => {
  it('create-new: scaffolds a new app + references docs/designs/', () => {
    const p = formatPlanModePrompt(groups, venture, summary); // default create-new
    expect(p).toMatch(/Build a .* application/);
    expect(p).toContain('docs/designs/');
    expect(p).not.toContain('Continue building the existing');
  });

  it('build-into: continues the existing app, drops docs/designs/', () => {
    const p = formatPlanModePrompt(groups, venture, summary, { mode: 'build-into' });
    expect(p).toContain('Continue building the existing');
    expect(p).not.toContain('docs/designs/');
    expect(p).toMatch(/existing app|EHG-BUILD-CONTEXT/);
  });
});

describe('formatFeaturePrompts — mode-aware (FR-2/FR-3)', () => {
  it('create-new: feature prompt references docs/designs/', () => {
    const fps = formatFeaturePrompts(groups, venture, summary);
    expect(fps.length).toBeGreaterThan(0);
    expect(fps[0].content).toContain('docs/designs/');
  });

  it('build-into: feature prompt extends the existing app, no docs/designs/', () => {
    const fps = formatFeaturePrompts(groups, venture, summary, { mode: 'build-into' });
    expect(fps.length).toBeGreaterThan(0);
    expect(fps[0].content).not.toContain('docs/designs/');
    expect(fps[0].content).toMatch(/EXTEND|existing app/);
  });
});

describe('formatReplitMd — mode-aware (FR-2)', () => {
  it('build-into adds a Build Context (build on the existing app); create-new does not', () => {
    const buildInto = formatReplitMd(groups, venture, summary, { mode: 'build-into' });
    const createNew = formatReplitMd(groups, venture, summary);
    expect(buildInto).toContain('## Build Context');
    expect(buildInto).toMatch(/already contains the working app|build on the existing app/i);
    expect(createNew).not.toContain('## Build Context');
  });
});

describe('FR-5: create-new byte-identical to prior behavior', () => {
  it('formatPlanModePrompt create-new === default (no mode)', () => {
    expect(formatPlanModePrompt(groups, venture, summary, { mode: 'create-new' }))
      .toBe(formatPlanModePrompt(groups, venture, summary));
  });
  it('formatReplitMd create-new === default (no mode)', () => {
    expect(formatReplitMd(groups, venture, summary, { mode: 'create-new' }))
      .toBe(formatReplitMd(groups, venture, summary));
  });
  it('formatFeaturePrompts create-new === default (no mode)', () => {
    expect(JSON.stringify(formatFeaturePrompts(groups, venture, summary, { mode: 'create-new' })))
      .toBe(JSON.stringify(formatFeaturePrompts(groups, venture, summary)));
  });
});
