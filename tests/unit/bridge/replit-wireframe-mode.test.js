/**
 * QF-20260523-692: formatWireframePrompts must honor build-into mode (follow-on to
 * SD-LEO-FEAT-STAGE-REPLIT-PROMPTS-001 — it previously ignored the threaded {mode}).
 */
import { describe, it, expect } from 'vitest';
import { formatWireframePrompts } from '../../../lib/eva/bridge/replit-format-strategies.js';

const groups = [
  {
    group_key: 'how_to_build_it',
    artifacts: [{ artifact_type: 'blueprint_wireframes', content: JSON.stringify({ screens: [{ name: 'Dashboard', purpose: 'Main view' }] }) }],
  },
];
const venture = { name: 'TestVenture', description: 'A test app', targetPlatform: 'web' };
const summary = {};

describe('formatWireframePrompts — mode-aware', () => {
  it('build-into: instructs extending the existing app', () => {
    const fps = formatWireframePrompts(groups, venture, summary, { mode: 'build-into' });
    expect(fps.length).toBeGreaterThan(0);
    expect(fps[0].content).toMatch(/EXTEND|already exists/);
  });

  it('create-new: byte-identical to default, no extend instruction', () => {
    const createNew = formatWireframePrompts(groups, venture, summary, { mode: 'create-new' });
    const dflt = formatWireframePrompts(groups, venture, summary);
    expect(JSON.stringify(createNew)).toBe(JSON.stringify(dflt));
    expect(createNew[0].content).not.toContain('EXTEND');
  });
});
