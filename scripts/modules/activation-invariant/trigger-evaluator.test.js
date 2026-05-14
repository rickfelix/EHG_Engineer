/**
 * Vitest specs for the activation-invariant trigger evaluator.
 * Anchors:
 *   - DUAL-SCAN trigger rule (EITHER Lane 1 structured OR Lane 2 free-text is sufficient)
 *   - Each lane independently requires schema+consumer pair (no pure UI / pure schema)
 *   - Heterogeneous key_changes shape (the {title, detail} GVOS S17 case)
 *   - Word-boundary regex (anchor "schema" but not "schematic")
 */
import { describe, it, expect } from 'vitest';
import { evaluateTrigger, TRIGGER_INTERNALS } from './trigger-evaluator.js';

describe('evaluateTrigger — structured (Lane 1) matches', () => {
  it('triggers when key_changes has schema+ui types', () => {
    const sd = {
      key_changes: [
        { type: 'schema', change: 'New column for activation' },
        { type: 'ui', change: 'New panel component' },
      ],
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(true);
    expect(result.lane1.passed).toBe(true);
    expect(result.reason).toMatch(/structured|both/);
  });

  it('triggers when key_changes has database+worker types', () => {
    const sd = {
      key_changes: [
        { type: 'database', change: 'Migration adds new table' },
        { type: 'worker', change: 'S11 worker populates the table' },
      ],
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(true);
    expect(result.lane1.passed).toBe(true);
  });

  it('does NOT trigger when only schema type present (no consumer)', () => {
    const sd = {
      key_changes: [{ type: 'schema', change: 'Add migration for new column' }],
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(false);
    expect(result.lane1.passed).toBe(false);
  });

  it('does NOT trigger on pure UI-tweak SD with no schema work', () => {
    const sd = {
      key_changes: [
        { type: 'ui', change: 'Reposition button on settings page' },
        { type: 'feature', change: 'New keyboard shortcut for save' },
      ],
      description: 'Cosmetic UI improvement, no data layer changes.',
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(false);
  });
});

describe('evaluateTrigger — free-text (Lane 2) handles heterogeneous shapes', () => {
  it('triggers on {title, detail}-shape key_changes (GVOS S17 motivating case)', () => {
    const sd = {
      key_changes: [
        { title: 'Schema migration for prompt rubrics', detail: 'Adds gvos_prompt_rubrics table' },
        { title: 'S11 worker integration', detail: 'Worker populates venture_gvos_profile' },
        { title: 'UI panel for chairman view', detail: 'New component renders quality scorer output' },
      ],
      description: 'Ships catalog + worker + UI panel as one chain.',
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(true);
    // Lane 1 cannot match (no `type` field); Lane 2 must carry.
    expect(result.lane1.passed).toBe(false);
    expect(result.lane2.passed).toBe(true);
    expect(result.reason).toBe('free_text_matches_schema_plus_consumer');
  });

  it('does NOT trigger when text mentions schema-only (no consumer surface or worker)', () => {
    const sd = {
      key_changes: [
        { title: 'Migration', detail: 'Add new column to product_requirements_v2' },
      ],
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(false);
    expect(result.lane2.schemaMatch).toBe(true);
    expect(result.lane2.consumerMatch).toBe(false);
  });

  it('does NOT trigger when text mentions UI-only (no schema)', () => {
    const sd = {
      key_changes: [
        { title: 'Tweak component', detail: 'Adjust button styling on admin panel' },
      ],
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(false);
    expect(result.lane2.schemaMatch).toBe(false);
  });
});

describe('evaluateTrigger — both-lane match', () => {
  it('reports both_lanes_match when types AND free-text both detect', () => {
    const sd = {
      key_changes: [
        { type: 'database', title: 'Schema migration', detail: 'Adds new table' },
        { type: 'feature', title: 'UI panel', detail: 'chairman view renders worker output' },
      ],
    };
    const result = evaluateTrigger(sd);
    expect(result.triggered).toBe(true);
    expect(result.lane1.passed).toBe(true);
    expect(result.lane2.passed).toBe(true);
    expect(result.reason).toBe('both_lanes_match');
  });
});

describe('evaluateTrigger — false-positive guards', () => {
  it('word-boundary regex: "schematic" does NOT match "schema"', () => {
    expect(TRIGGER_INTERNALS.SCHEMA_TEXT_REGEX.test('this is a schematic diagram')).toBe(false);
    expect(TRIGGER_INTERNALS.SCHEMA_TEXT_REGEX.test('database schema migration')).toBe(true);
  });

  it('returns triggered=false for null/undefined input', () => {
    expect(evaluateTrigger(null).triggered).toBe(false);
    expect(evaluateTrigger(undefined).triggered).toBe(false);
    expect(evaluateTrigger({}).triggered).toBe(false);
  });

  it('handles missing key_changes gracefully', () => {
    const result = evaluateTrigger({ description: 'just a description' });
    expect(result.triggered).toBe(false);
    expect(result.lane1.types).toEqual([]);
  });
});
