import { describe, it, expect } from 'vitest';
import { validateLLMResponse } from '../../lib/eva/utils/validate-llm-response.js';
import {
  S0_FORECAST_SCHEMA,
  S5_FINANCIAL_SCHEMA,
  S15_WIREFRAME_SCHEMA,
} from '../../lib/eva/utils/stage-response-schemas.js';

describe('validateLLMResponse', () => {
  it('returns valid for conforming input', () => {
    const schema = { name: { type: 'string', required: true } };
    const result = validateLLMResponse({ name: 'test' }, schema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid for null input', () => {
    const result = validateLLMResponse(null, { x: { required: true } });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('null');
  });

  it('returns invalid for undefined input', () => {
    const result = validateLLMResponse(undefined, { x: { required: true } });
    expect(result.valid).toBe(false);
  });

  it('returns valid when schema is null', () => {
    const result = validateLLMResponse({ anything: true }, null);
    expect(result.valid).toBe(true);
  });

  it('catches missing required field', () => {
    const schema = { name: { type: 'string', required: true } };
    const result = validateLLMResponse({}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('name');
  });

  it('catches wrong type (expected array, got object)', () => {
    const schema = { items: { type: 'array', required: true } };
    const result = validateLLMResponse({ items: {} }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('array');
  });

  it('catches wrong type (expected object, got array)', () => {
    const schema = { config: { type: 'object', required: true } };
    const result = validateLLMResponse({ config: [] }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('object');
  });

  it('catches array minLength violation', () => {
    const schema = { items: { type: 'array', required: true, minLength: 3 } };
    const result = validateLLMResponse({ items: [1] }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3');
  });

  it('allows extra fields', () => {
    const schema = { name: { type: 'string', required: true } };
    const result = validateLLMResponse({ name: 'test', bonus: true, extra: 42 }, schema);
    expect(result.valid).toBe(true);
  });

  it('reports all errors, not just first', () => {
    const schema = {
      a: { type: 'string', required: true },
      b: { type: 'number', required: true },
      c: { type: 'array', required: true },
    };
    const result = validateLLMResponse({}, schema);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  it('validates nested items in arrays', () => {
    const schema = {
      screens: {
        type: 'array',
        required: true,
        items: { name: { required: true }, layout: { required: true } },
      },
    };
    const result = validateLLMResponse({
      screens: [{ name: 'Home' }, { name: 'About', layout: 'grid' }],
    }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('screens[0]') && e.includes('layout'))).toBe(true);
  });

  it('skips non-required fields', () => {
    const schema = { opt: { type: 'string', required: false } };
    const result = validateLLMResponse({}, schema);
    expect(result.valid).toBe(true);
  });
});

describe('S15_WIREFRAME_SCHEMA', () => {
  it('validates a complete wireframe response', () => {
    const valid = {
      screens: [
        { name: 'Home', ascii_layout: '+--header--+' },
        { name: 'Dashboard', ascii_layout: '+--sidebar--+' },
        { name: 'Settings', ascii_layout: '+--form--+' },
      ],
    };
    const result = validateLLMResponse(valid, S15_WIREFRAME_SCHEMA);
    expect(result.valid).toBe(true);
  });

  it('rejects response with no screens', () => {
    const result = validateLLMResponse({ wireframes: {} }, S15_WIREFRAME_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('screens');
  });

  it('rejects response with too few screens', () => {
    const result = validateLLMResponse({
      screens: [{ name: 'Home', ascii_layout: 'x' }],
    }, S15_WIREFRAME_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('3');
  });

  it('rejects screen missing ascii_layout', () => {
    const result = validateLLMResponse({
      screens: [
        { name: 'Home' },
        { name: 'About', ascii_layout: 'x' },
        { name: 'Contact', ascii_layout: 'x' },
      ],
    }, S15_WIREFRAME_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ascii_layout'))).toBe(true);
  });
});

describe('S0_FORECAST_SCHEMA', () => {
  it('validates a complete forecast', () => {
    const result = validateLLMResponse({
      revenue_projections: { y1: 100000 },
      cost_breakdown: { dev: 50000 },
      timeline: { launch: 'Q2' },
    }, S0_FORECAST_SCHEMA);
    expect(result.valid).toBe(true);
  });

  it('rejects forecast missing cost_breakdown', () => {
    const result = validateLLMResponse({
      revenue_projections: {},
      timeline: {},
    }, S0_FORECAST_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('cost_breakdown');
  });

  it('rejects forecast with all fields missing', () => {
    const result = validateLLMResponse({}, S0_FORECAST_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });
});

describe('S5_FINANCIAL_SCHEMA', () => {
  it('validates a complete financial model', () => {
    const result = validateLLMResponse({
      metrics: [{ name: 'ARR' }],
      projections: { y1: 100 },
    }, S5_FINANCIAL_SCHEMA);
    expect(result.valid).toBe(true);
  });

  it('rejects model missing metrics', () => {
    const result = validateLLMResponse({
      projections: {},
    }, S5_FINANCIAL_SCHEMA);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('metrics');
  });
});
