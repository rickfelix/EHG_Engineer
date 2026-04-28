/**
 * Tests for lib/eva/config/house-tech-stack.js
 * SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
 */
import { describe, it, expect } from 'vitest';
import {
  EHG_HOUSE_TECH_STACK,
  EHG_HOUSE_AUTH_STRATEGY,
  HOUSE_STACK_LAYER_NAMES,
  HOUSE_STACK_VERSION,
} from '../../../lib/eva/config/house-tech-stack.js';

describe('EHG_HOUSE_TECH_STACK', () => {
  it('has all 5 required layers', () => {
    expect(HOUSE_STACK_LAYER_NAMES).toEqual([
      'presentation', 'api', 'business_logic', 'data', 'infrastructure',
    ]);
    for (const name of HOUSE_STACK_LAYER_NAMES) {
      expect(EHG_HOUSE_TECH_STACK[name]).toBeDefined();
    }
  });

  it('every layer has technology, components_hint, rationale', () => {
    for (const name of HOUSE_STACK_LAYER_NAMES) {
      const layer = EHG_HOUSE_TECH_STACK[name];
      expect(typeof layer.technology).toBe('string');
      expect(layer.technology.length).toBeGreaterThan(0);
      expect(Array.isArray(layer.components_hint)).toBe(true);
      expect(layer.components_hint.length).toBeGreaterThan(0);
      expect(typeof layer.rationale).toBe('string');
      expect(layer.rationale.length).toBeGreaterThan(0);
    }
  });

  it('EHG_HOUSE_AUTH_STRATEGY has technology + rationale', () => {
    expect(typeof EHG_HOUSE_AUTH_STRATEGY.technology).toBe('string');
    expect(EHG_HOUSE_AUTH_STRATEGY.technology.length).toBeGreaterThan(0);
    expect(typeof EHG_HOUSE_AUTH_STRATEGY.rationale).toBe('string');
  });

  it('HOUSE_STACK_VERSION matches YYYY.MM format', () => {
    expect(HOUSE_STACK_VERSION).toMatch(/^\d{4}\.\d{2}$/);
  });

  it('object is frozen (immutable at runtime)', () => {
    expect(Object.isFrozen(EHG_HOUSE_TECH_STACK)).toBe(true);
    expect(Object.isFrozen(EHG_HOUSE_AUTH_STRATEGY)).toBe(true);
    expect(Object.isFrozen(HOUSE_STACK_LAYER_NAMES)).toBe(true);
  });

  it('infrastructure layer reflects Vercel + Replit + Supabase choice (not AWS)', () => {
    expect(EHG_HOUSE_TECH_STACK.infrastructure.technology).toMatch(/Vercel/);
    expect(EHG_HOUSE_TECH_STACK.infrastructure.technology).not.toMatch(/AWS/);
  });
});
