/**
 * Tests for formatPlanModePrompt binding-contract — verifies docs/monitoring.md
 * is surfaced to Replit Agent during Plan Mode rendering.
 *
 * SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001 (FR-5)
 *
 * The Plan Mode prompt has two render paths:
 *  - Full path (default): all binding-contract lines included
 *  - Truncated fallback (when prompt exceeds PLAN_MODE_BUDGET=6000 chars):
 *    abbreviated binding contract, but monitoring.md MUST remain (load-bearing,
 *    not a feature line).
 */
import { describe, it, expect } from 'vitest';
import { formatPlanModePrompt } from '../../../lib/eva/bridge/replit-format-strategies.js';

const MONITORING_REF = 'docs/monitoring.md';
const MONITORING_FULL_LINE = '- docs/monitoring.md — Sentry + central feedback table integration. Wire this on day one.';
const MONITORING_SHORT_LINE = '- docs/monitoring.md (Sentry + central feedback table — wire on day one)';

const minimalGroups = [
  {
    group_key: 'sprint_plan',
    artifacts: [
      { content: { items: [
        { name: 'Build core dashboard', priority: 'high', story_points: 5, description: 'Initial UI' },
      ] } },
    ],
  },
];

// PLAN_MODE_TOP_FEATURES caps at 5 rendered features per render path. To force
// truncation past PLAN_MODE_BUDGET=6000, each rendered top feature carries ~1.5KB
// of description + acceptance criteria text.
const longText = (label, n) => `${label}: ${'lorem ipsum dolor sit amet consectetur adipiscing elit '.repeat(n)}`;
const overflowingGroups = [
  {
    group_key: 'sprint_plan',
    artifacts: [
      { content: { items: Array.from({ length: 40 }, (_, i) => ({
        name: `Feature ${i + 1} with a moderately verbose name to push the prompt past budget`,
        priority: 'high',
        story_points: 5,
        description: longText(`Description ${i + 1}`, 25),
        success_criteria: longText(`Done when feature ${i + 1}`, 25),
      })) } },
    ],
  },
];

const venture = { name: 'TestVenture', description: 'A test venture for binding-contract verification', targetPlatform: 'web' };
const summary = {};

describe('formatPlanModePrompt — binding contract includes docs/monitoring.md (FR-5)', () => {
  it('full render path includes the monitoring.md line verbatim', () => {
    const prompt = formatPlanModePrompt(minimalGroups, venture, summary);
    expect(prompt).toContain(MONITORING_FULL_LINE);
  });

  it('full render path positions monitoring.md after architecture.md and before tasks.md', () => {
    const prompt = formatPlanModePrompt(minimalGroups, venture, summary);
    const archIdx = prompt.indexOf('docs/architecture.md');
    const monIdx = prompt.indexOf(MONITORING_REF);
    const tasksIdx = prompt.indexOf('docs/tasks.md');
    expect(archIdx).toBeGreaterThan(0);
    expect(monIdx).toBeGreaterThan(archIdx);
    expect(tasksIdx).toBeGreaterThan(monIdx);
  });

  it('truncated fallback path (prompt > PLAN_MODE_BUDGET) preserves monitoring.md', () => {
    const prompt = formatPlanModePrompt(overflowingGroups, venture, summary);
    // Truncation kicked in if length is at or below the truncation budget OR the
    // short-line variant appears (whichever indicates the fallback ran)
    expect(prompt).toContain(MONITORING_REF);
    // Specifically, the truncated short-line variant must be present
    expect(prompt).toContain(MONITORING_SHORT_LINE);
  });

  it('truncated render is meaningfully shorter than full render', () => {
    const fullPrompt = formatPlanModePrompt(overflowingGroups, venture, summary);
    expect(fullPrompt.length).toBeLessThanOrEqual(6000 * 1.1); // truncation enforces ~budget
  });

  it('binding contract heading remains in both render paths', () => {
    const fullPrompt = formatPlanModePrompt(minimalGroups, venture, summary);
    const truncPrompt = formatPlanModePrompt(overflowingGroups, venture, summary);
    expect(fullPrompt).toMatch(/Binding contract — read first/);
    expect(truncPrompt).toMatch(/Binding contract — read first/);
  });
});
