/**
 * Tests for Cross-Stage Data Contracts Registry
 * SD-MAN-ORCH-EVA-GOVERNANCE-POLISH-001-B
 */

import { describe, it, expect } from 'vitest';
import { getContract, validatePreStage, validatePostStage, STAGE_CONTRACTS } from '../../../lib/eva/contracts/stage-contracts.js';

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

describe('stage-contracts', () => {

  describe('STAGE_CONTRACTS', () => {
    it('covers all 25 stages', () => {
      for (let i = 1; i <= 25; i++) {
        expect(STAGE_CONTRACTS.has(i), `stage ${i} missing`).toBe(true);
      }
    });

    it('each contract has consumes and produces', () => {
      for (const [_num, contract] of STAGE_CONTRACTS) {
        expect(contract).toHaveProperty('consumes');
        expect(contract).toHaveProperty('produces');
        expect(Array.isArray(contract.consumes)).toBe(true);
      }
    });
  });

  describe('getContract', () => {
    it('returns contract for valid stage', () => {
      const c = getContract(1);
      expect(c).not.toBeNull();
      expect(c.consumes).toEqual([]);
      expect(c.produces).toHaveProperty('description');
    });

    it('returns null for invalid stage', () => {
      expect(getContract(0)).toBeNull();
      expect(getContract(26)).toBeNull();
      expect(getContract(99)).toBeNull();
    });
  });

  describe('validatePreStage', () => {
    it('passes for stage 1 (no consumes)', () => {
      const result = validatePreStage(1, new Map(), { logger: silentLogger });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes when upstream data satisfies stage 2 contract', () => {
      const upstreamMap = new Map([
        [1, {
          description: 'A platform that connects local artisans with global buyers through AI matching',
          problemStatement: 'Artisans struggle to reach global markets',
          valueProp: 'AI-powered marketplace reducing costs',
          targetMarket: 'Small artisan businesses',
          archetype: 'marketplace',
        }],
      ]);
      const result = validatePreStage(2, upstreamMap, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('fails when required upstream field is missing', () => {
      const upstreamMap = new Map([
        [1, { description: 'A platform description that is long enough to pass' }],
      ]);
      const result = validatePreStage(2, upstreamMap, { logger: silentLogger });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('warns when upstream stage data is unavailable', () => {
      const result = validatePreStage(2, new Map(), { logger: silentLogger });
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('handles flat object as upstream data', () => {
      const flatData = {
        description: 'A platform that connects local artisans with global buyers through AI matching',
        problemStatement: 'Artisans struggle to reach global markets',
        valueProp: 'AI-powered marketplace reducing costs',
        targetMarket: 'Small artisan businesses',
        archetype: 'marketplace',
      };
      const result = validatePreStage(2, flatData, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('validates multi-stage consumers (stage 9 consumes 6, 7, 8)', () => {
      const upstreamMap = new Map([
        [6, { risks: [{ id: 'R1', description: 'Test risk' }], aggregate_risk_score: 4.5 }],
        [7, { tiers: [{ name: 'Basic', price: 10 }] }],
        [8, { customerSegments: { items: [] } }],
      ]);
      const result = validatePreStage(9, upstreamMap, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });
  });

  describe('validatePostStage', () => {
    it('passes when output matches stage 1 produces', () => {
      const output = {
        description: 'A platform that connects local artisans with global buyers through AI matching',
        problemStatement: 'Artisans struggle to reach global markets',
        valueProp: 'AI-powered marketplace reducing costs',
        targetMarket: 'Small artisan businesses',
        archetype: 'marketplace',
      };
      const result = validatePostStage(1, output, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('fails when required output field is missing', () => {
      const result = validatePostStage(1, {}, { logger: silentLogger });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('fails when string field is too short', () => {
      const output = {
        description: 'short',
        problemStatement: 'x',
        valueProp: 'y',
        targetMarket: 'z',
        archetype: 'mp',
      };
      const result = validatePostStage(1, output, { logger: silentLogger });
      expect(result.valid).toBe(false);
    });

    it('passes for stage with no produces', () => {
      // Create a mock scenario with empty produces - use getContract to verify behavior
      const result = validatePostStage(999, {}, { logger: silentLogger });
      // Stage 999 doesn't exist, so no contract = valid
      expect(result.valid).toBe(true);
    });

    it('validates integer constraints (stage 2 compositeScore)', () => {
      const result = validatePostStage(2, { compositeScore: 75 }, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects out-of-range integer (stage 2 compositeScore > 100)', () => {
      const result = validatePostStage(2, { compositeScore: 150 }, { logger: silentLogger });
      expect(result.valid).toBe(false);
    });

    it('validates array constraints (stage 6 risks)', () => {
      const output = {
        risks: [{ id: 'R1' }],
        aggregate_risk_score: 3.5,
        normalized_risk_score: 0.7,
      };
      const result = validatePostStage(6, output, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects empty array when minItems > 0 (stage 6 risks)', () => {
      const output = {
        risks: [],
        aggregate_risk_score: 0,
        normalized_risk_score: 0,
      };
      const result = validatePostStage(6, output, { logger: silentLogger });
      expect(result.valid).toBe(false);
    });
  });
});
