import { describe, it, expect } from 'vitest';
import {
  EHG_VENTURE_DEFAULT_CAPABILITIES,
  DEFAULT_CAPABILITIES_VERSION,
  DEFAULT_CAPABILITY_IDS,
} from '../../../lib/eva/config/venture-default-capabilities.js';

// SD-LEO-INFRA-VENTURE-DEFAULT-CAPABILITIES-EXPAND-001: the portfolio-default set grew
// from 2 to 7 capabilities (FR-1..FR-5); the budget contract grew from 3 to 9 story points.
const EXPECTED_CAPABILITY_IDS = [
  'feedback-widget',
  'error-capture-middleware',
  'cost-instrumentation',
  'telemetry-analytics',
  'calm-decision-card',
  'health-uptime-probe',
  'operating-model-grounding',
];

describe('EHG_VENTURE_DEFAULT_CAPABILITIES — config well-formedness', () => {
  it('exports an array of exactly 7 capabilities', () => {
    expect(Array.isArray(EHG_VENTURE_DEFAULT_CAPABILITIES)).toBe(true);
    expect(EHG_VENTURE_DEFAULT_CAPABILITIES).toHaveLength(7);
  });

  it('contains all 7 expected capability_ids in order', () => {
    const ids = EHG_VENTURE_DEFAULT_CAPABILITIES.map(c => c.capability_id);
    expect(ids).toEqual(EXPECTED_CAPABILITY_IDS);
  });

  it('preserves the two original capabilities unchanged (feedback=2, error_capture=1)', () => {
    const byId = Object.fromEntries(EHG_VENTURE_DEFAULT_CAPABILITIES.map(c => [c.capability_id, c]));
    expect(byId['feedback-widget'].story_points).toBe(2);
    expect(byId['feedback-widget'].name).toBe('Integrate Feedback Widget');
    expect(byId['error-capture-middleware'].story_points).toBe(1);
    expect(byId['error-capture-middleware'].name).toBe('Wire Error Capture Middleware');
    // The two original entries still cite the quality-lifecycle vision doc.
    expect(byId['feedback-widget'].vision_source_section).toMatch(/quality-lifecycle-system\.md/);
    expect(byId['error-capture-middleware'].vision_source_section).toMatch(/quality-lifecycle-system\.md/);
  });

  it('each entry has all required keys with correct types', () => {
    const required = [
      'capability_id', 'name', 'description', 'story_points',
      'priority', 'acceptance_criteria', 'target_stack_components', 'vision_source_section',
    ];
    for (const cap of EHG_VENTURE_DEFAULT_CAPABILITIES) {
      for (const key of required) {
        expect(cap, `${cap.capability_id} missing ${key}`).toHaveProperty(key);
      }
      expect(typeof cap.capability_id).toBe('string');
      expect(typeof cap.name).toBe('string');
      expect(typeof cap.description).toBe('string');
      expect(typeof cap.story_points).toBe('number');
      expect(cap.story_points).toBeGreaterThan(0);
      expect(['critical', 'high', 'medium', 'low']).toContain(cap.priority);
      expect(typeof cap.acceptance_criteria).toBe('string');
      expect(cap.acceptance_criteria.length).toBeGreaterThan(0);
      expect(Array.isArray(cap.target_stack_components)).toBe(true);
      expect(cap.target_stack_components.length).toBeGreaterThan(0);
      expect(typeof cap.vision_source_section).toBe('string');
      // Every entry must cite a vision/standard source; the 5 new caps cite vision
      // sections or the operating-model SSOT rather than the quality-lifecycle doc.
      expect(cap.vision_source_section.length).toBeGreaterThan(0);
    }
  });

  it('total story_points equals 9 (budget contract — original 3 + five new caps 6)', () => {
    const total = EHG_VENTURE_DEFAULT_CAPABILITIES.reduce((s, c) => s + c.story_points, 0);
    expect(total).toBe(9);
  });

  it('outer array AND each entry are frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(EHG_VENTURE_DEFAULT_CAPABILITIES)).toBe(true);
    for (const cap of EHG_VENTURE_DEFAULT_CAPABILITIES) {
      expect(Object.isFrozen(cap)).toBe(true);
    }
  });

  it('DEFAULT_CAPABILITIES_VERSION matches /^\\d{4}\\.\\d{2}$/', () => {
    expect(typeof DEFAULT_CAPABILITIES_VERSION).toBe('string');
    expect(DEFAULT_CAPABILITIES_VERSION).toMatch(/^\d{4}\.\d{2}$/);
  });

  it('DEFAULT_CAPABILITY_IDS mirrors the capability_id values in order', () => {
    expect(Array.isArray(DEFAULT_CAPABILITY_IDS)).toBe(true);
    expect(DEFAULT_CAPABILITY_IDS).toEqual(EHG_VENTURE_DEFAULT_CAPABILITIES.map(c => c.capability_id));
    expect(Object.isFrozen(DEFAULT_CAPABILITY_IDS)).toBe(true);
  });
});
