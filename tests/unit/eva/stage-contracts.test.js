/**
 * Tests for Cross-Stage Data Contracts Registry
 * SD-MAN-ORCH-EVA-GOVERNANCE-POLISH-001-B
 * SD-RCA-PREEMPTIVE-S26: Updated to cover all 26 stages.
 * SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (FR-5): venture_stages inserted stage 23
 * (Dedicated Venture UAT) ahead of the launch/learn tail, pushing the pipeline terminus
 * (Growth Playbook) from 26 to 27 -- now covers all 27 stages.
 */

import { describe, it, expect } from 'vitest';
import { getContract, validatePreStage, validatePostStage, validateDependencyChain, STAGE_CONTRACTS } from '../../../lib/eva/contracts/stage-contracts.js';

const silentLogger = { warn() {}, info() {}, error() {}, debug() {}, log() {} };

describe('stage-contracts', () => {

  describe('STAGE_CONTRACTS', () => {
    it('covers all 27 stages', () => {
      for (let i = 1; i <= 27; i++) {
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

    it('returns contract for stage 27 (pipeline terminus)', () => {
      // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (FR-5): Growth Playbook moved from 26 to 27
      // when Dedicated Venture UAT was inserted as the new stage 23.
      const c = getContract(27);
      expect(c).not.toBeNull();
      expect(c.consumes).toHaveLength(1);
      expect(c.consumes[0].stage).toBe(26);
      expect(c.produces).toHaveProperty('growth_experiments');
      expect(c.produces).toHaveProperty('scaling_priorities');
    });

    it('returns contract for stage 23 (Dedicated Venture UAT, new stage)', () => {
      const c = getContract(23);
      expect(c).not.toBeNull();
      expect(c.consumes).toEqual([]);
      expect(c.produces).toHaveProperty('applies');
      expect(c.produces).toHaveProperty('satisfied');
    });

    it('returns null for invalid stage', () => {
      expect(getContract(0)).toBeNull();
      expect(getContract(28)).toBeNull();
      expect(getContract(99)).toBeNull();
    });
  });

  describe('validateDependencyChain (FR-5 non-vacuity proof)', () => {
    // PLAN-phase TESTING review: a stage missing from CROSS_STAGE_DEPS makes
    // validateDependencyChain() return {valid:true} WITHOUT ever querying supabase --
    // a pass that proves nothing. This throws if .from() is called, so a regression
    // back to "stage 27 has no deps entry" fails LOUDLY instead of passing vacuously.
    function throwingSupabase() {
      return { from: () => { throw new Error('NON_VACUOUS_PROOF: .from() was called'); } };
    }

    it('stage 27 has a real (non-empty) deps entry and actually queries supabase', async () => {
      await expect(validateDependencyChain(27, throwingSupabase(), 'venture-1'))
        .rejects.toThrow(/NON_VACUOUS_PROOF/);
    });

    it('stage 23 has a real (non-empty) deps entry and actually queries supabase', async () => {
      await expect(validateDependencyChain(23, throwingSupabase(), 'venture-1'))
        .rejects.toThrow(/NON_VACUOUS_PROOF/);
    });

    it('a genuinely deps-free stage (e.g. an unknown stage number) short-circuits without querying', async () => {
      const result = await validateDependencyChain(9999, throwingSupabase(), 'venture-1');
      expect(result).toEqual({ valid: true, missingStages: [], presentStages: [] });
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

    it('errors when upstream stage data with required fields is unavailable', () => {
      // SD-MAN-GEN-CORRECTIVE-VISION-GAP-012 (V05): Missing required upstream is now an error
      const result = validatePreStage(2, new Map(), { logger: silentLogger });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/data missing.*required fields/i);
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

    it('validates stage 27 pre-stage with stage 26 data', () => {
      // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (FR-5): Growth Playbook (consumes
      // optional key_learnings from Post-Launch Review) moved from 26 to 27.
      const upstreamMap = new Map([
        [26, { key_learnings: ['retention driven by onboarding'] }],
      ]);
      const result = validatePreStage(27, upstreamMap, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('passes stage 27 pre-stage when stage 26 data missing (consumes now optional)', () => {
      // Repointed contract: S27 consumes only optional key_learnings from S26 —
      // the S26 analyzer does its own upstream verification; the contract layer
      // must not double-block on a stricter phantom shape (warnings, not errors).
      const result = validatePreStage(27, new Map(), { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('validates stage 26 pre-stage with stage 25 data (Post-Launch Review consumes Go Live)', () => {
      const upstreamMap = new Map([
        [25, { launch_status: 'launched' }],
      ]);
      const result = validatePreStage(26, upstreamMap, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('passes stage 25 pre-stage when upstream stages absent (all optional)', () => {
      // Stage 25 (Go Live) consumes stages 1, 21, 22, 24, but all fields are required: false.
      // When the upstream stages are entirely absent, optional fields produce warnings not errors.
      const result = validatePreStage(25, new Map(), { logger: silentLogger });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(0);
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

    it('validates stage 27 post-stage output (Growth Playbook terminus)', () => {
      // SD-LEO-INFRA-VENTURE-QUALITY-CAPA-001-H (FR-5): S27 = Growth Playbook
      // (growth_experiments required; scaling_priorities / operations_handoff optional).
      const output = {
        growth_experiments: [{ name: 'SEO content sprint', hypothesis: 'organic signups +20%' }],
        scaling_priorities: ['blog_seo'],
        operations_handoff: { monitoring: {}, escalation: {} },
      };
      const result = validatePostStage(27, output, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects stage 27 output missing growth_experiments', () => {
      const output = {
        scaling_priorities: [],
        operations_handoff: {},
      };
      const result = validatePostStage(27, output, { logger: silentLogger });
      expect(result.valid).toBe(false);
    });

    it('validates stage 26 post-stage output (Post-Launch Review)', () => {
      const output = {
        metrics: { signups: 12, impressions: 500 },
        key_learnings: ['onboarding friction at step 2'],
        data_collection_status: 'collected',
      };
      const result = validatePostStage(26, output, { logger: silentLogger });
      expect(result.valid).toBe(true);
    });

    it('rejects stage 26 output missing required metrics/data_collection_status', () => {
      const output = { key_learnings: [] };
      const result = validatePostStage(26, output, { logger: silentLogger });
      expect(result.valid).toBe(false);
    });
  });
});
