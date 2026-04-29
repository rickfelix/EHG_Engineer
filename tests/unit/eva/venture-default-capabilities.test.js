import { describe, it, expect } from 'vitest';
import {
  EHG_VENTURE_DEFAULT_CAPABILITIES,
  DEFAULT_CAPABILITIES_VERSION,
  DEFAULT_CAPABILITY_IDS,
} from '../../../lib/eva/config/venture-default-capabilities.js';

describe('EHG_VENTURE_DEFAULT_CAPABILITIES — config well-formedness', () => {
  it('exports an array of exactly 2 capabilities', () => {
    expect(Array.isArray(EHG_VENTURE_DEFAULT_CAPABILITIES)).toBe(true);
    expect(EHG_VENTURE_DEFAULT_CAPABILITIES).toHaveLength(2);
  });

  it('contains feedback-widget and error-capture-middleware capability_ids', () => {
    const ids = EHG_VENTURE_DEFAULT_CAPABILITIES.map(c => c.capability_id);
    expect(ids).toEqual(['feedback-widget', 'error-capture-middleware']);
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
      expect(['critical', 'high', 'medium', 'low']).toContain(cap.priority);
      expect(typeof cap.acceptance_criteria).toBe('string');
      expect(Array.isArray(cap.target_stack_components)).toBe(true);
      expect(cap.target_stack_components.length).toBeGreaterThan(0);
      expect(typeof cap.vision_source_section).toBe('string');
      expect(cap.vision_source_section).toMatch(/quality-lifecycle-system\.md/);
    }
  });

  it('total story_points equals 3 (budget contract — feedback=2, error_capture=1)', () => {
    const total = EHG_VENTURE_DEFAULT_CAPABILITIES.reduce((s, c) => s + c.story_points, 0);
    expect(total).toBe(3);
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
