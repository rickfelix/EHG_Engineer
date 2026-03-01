/**
 * Tests for validatePreStage enforcement of required upstream data
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (V05: cross_stage_data_contracts)
 */

import { describe, it, expect } from 'vitest';
import { validatePreStage, CONTRACT_ENFORCEMENT } from '../../../lib/eva/contracts/stage-contracts.js';

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

describe('validatePreStage — required upstream enforcement (GAP-012)', () => {
  it('errors when required upstream data is missing', () => {
    // Stage 2 consumes from stage 1 with required fields
    const result = validatePreStage(2, new Map(), { logger: silentLogger });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/stage-01 data missing.*required fields/i);
  });

  it('warns (not errors) when optional upstream data is missing', () => {
    // Stage 4 consumes from stage 3 with competitorEntities (required: false)
    // and from stage 1 with required fields
    // We need to supply stage 1 data but leave stage 3 absent with only optional fields
    const upstream = new Map([
      [1, { description: 'test desc', valueProp: 'test val', targetMarket: 'test market' }],
    ]);
    const result = validatePreStage(4, upstream, { logger: silentLogger });
    // Stage 3 has competitorEntities with required: false, so missing stage 3 is a warning
    expect(result.warnings.some(w => w.includes('stage-03') && w.includes('optional'))).toBe(true);
  });

  it('passes when all required upstream data is present', () => {
    const upstream = new Map([
      [1, {
        description: 'A platform that connects local artisans with global buyers',
        problemStatement: 'Artisans struggle to reach global markets',
        valueProp: 'AI-powered marketplace',
        targetMarket: 'Small artisan businesses',
        archetype: 'marketplace',
      }],
    ]);
    const result = validatePreStage(2, upstream, { logger: silentLogger });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('respects advisory enforcement mode', () => {
    // Stage 2 missing upstream — with advisory mode, errors exist but blocked=false
    const result = validatePreStage(2, new Map(), {
      logger: silentLogger,
      enforcement: CONTRACT_ENFORCEMENT.ADVISORY,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.blocked).toBe(false);
    expect(result.enforcement).toBe('advisory');
  });

  it('blocks in blocking enforcement mode', () => {
    const result = validatePreStage(2, new Map(), {
      logger: silentLogger,
      enforcement: CONTRACT_ENFORCEMENT.BLOCKING,
    });
    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
    expect(result.enforcement).toBe('blocking');
  });
});
