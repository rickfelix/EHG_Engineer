/**
 * Unit tests for Stage 11 - GTM (Go-To-Market) template
 * Part of SD-LEO-FEAT-TMPL-IDENTITY-001
 *
 * Test Scenarios:
 * - TS-1: Exactly 3 tiers required
 * - TS-2: Exactly 8 channels required
 * - TS-3: Budget and CAC validation
 * - TS-4: Derived metrics calculation
 *
 * @module tests/unit/eva/stage-templates/stage-11.test
 */

import { describe, it, expect } from 'vitest';
import stage11, { REQUIRED_TIERS, REQUIRED_CHANNELS, CHANNEL_NAMES } from '../../../../lib/eva/stage-templates/stage-11.js';

describe('stage-11.js - GTM template', () => {
  describe('Template metadata', () => {
    it('should have correct template structure', () => {
      expect(stage11.id).toBe('stage-11');
      expect(stage11.slug).toBe('gtm');
      expect(stage11.title).toBe('GTM Strategy');
      expect(stage11.version).toBe('2.0.0');
    });

    it('should export REQUIRED_TIERS = 3', () => {
      expect(REQUIRED_TIERS).toBe(3);
    });

    it('should export REQUIRED_CHANNELS = 8', () => {
      expect(REQUIRED_CHANNELS).toBe(8);
    });

    it('should export CHANNEL_NAMES', () => {
      expect(CHANNEL_NAMES).toBeInstanceOf(Array);
      expect(CHANNEL_NAMES.length).toBeGreaterThan(0);
      expect(CHANNEL_NAMES).toContain('Organic Search');
      expect(CHANNEL_NAMES).toContain('Paid Search');
    });

    it('should have defaultData', () => {
      expect(stage11.defaultData).toMatchObject({
        tiers: [],
        channels: [],
        launch_timeline: [],
        total_monthly_budget: null,
        avg_cac: null,
      });
    });

    it('should have validate function', () => {
      expect(typeof stage11.validate).toBe('function');
    });

    it('should have computeDerived function', () => {
      expect(typeof stage11.computeDerived).toBe('function');
    });
  });

  describe('validate() - Tiers validation (TS-1: Exactly 3 tiers)', () => {
    const createValidData = () => ({
      tiers: [
        { name: 'Tier 1', description: 'Enterprise', tam: 10000000, sam: 1000000, som: 100000 },
        { name: 'Tier 2', description: 'Mid-Market', tam: 5000000, sam: 500000, som: 50000 },
        { name: 'Tier 3', description: 'SMB', tam: 2000000, sam: 200000, som: 20000 },
      ],
      channels: [
        { name: 'Organic Search', monthly_budget: 5000, expected_cac: 100, primary_kpi: 'Organic traffic' },
        { name: 'Paid Search', monthly_budget: 10000, expected_cac: 150, primary_kpi: 'Conversions' },
        { name: 'Social Media', monthly_budget: 3000, expected_cac: 80, primary_kpi: 'Engagement' },
        { name: 'Content Marketing', monthly_budget: 4000, expected_cac: 90, primary_kpi: 'Leads' },
        { name: 'Email Marketing', monthly_budget: 2000, expected_cac: 50, primary_kpi: 'Open rate' },
        { name: 'Partnerships', monthly_budget: 6000, expected_cac: 120, primary_kpi: 'Referrals' },
        { name: 'Events', monthly_budget: 8000, expected_cac: 200, primary_kpi: 'Attendees' },
        { name: 'Direct Sales', monthly_budget: 12000, expected_cac: 250, primary_kpi: 'Deals closed' },
      ],
      launch_timeline: [
        { milestone: 'Beta launch', date: '2026-Q2', owner: 'Product Team' },
      ],
    });

    it('should pass with exactly 3 tiers', () => {
      const data = createValidData();
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail with 2 tiers (< 3 required) (TS-1)', () => {
      const data = createValidData();
      data.tiers = data.tiers.slice(0, 2);
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers');
      expect(result.errors[0]).toContain('must have exactly 3 items');
      expect(result.errors[0]).toContain('got 2');
    });

    it('should fail with 1 tier', () => {
      const data = createValidData();
      data.tiers = data.tiers.slice(0, 1);
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers');
      expect(result.errors[0]).toContain('must have exactly 3 items');
      expect(result.errors[0]).toContain('got 1');
    });

    it('should fail with 4 tiers (> 3 required) (TS-1)', () => {
      const data = createValidData();
      data.tiers.push({ name: 'Tier 4', description: 'Extra tier', tam: 1000, sam: 100, som: 10 });
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers');
      expect(result.errors[0]).toContain('must have exactly 3 items');
      expect(result.errors[0]).toContain('got 4');
    });

    it('should fail for non-array tiers', () => {
      const data = createValidData();
      data.tiers = 'not an array';
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('tiers must be an array');
    });

    it('should fail for tier missing name', () => {
      const data = createValidData();
      delete data.tiers[1].name;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tiers[1].name'))).toBe(true);
    });

    it('should fail for tier missing description', () => {
      const data = createValidData();
      delete data.tiers[0].description;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('tiers[0].description'))).toBe(true);
    });

    it('should pass with optional tam/sam/som fields', () => {
      const data = createValidData();
      delete data.tiers[0].tam;
      delete data.tiers[1].sam;
      delete data.tiers[2].som;
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Channels validation (TS-2: Exactly 8 channels)', () => {
    const createValidData = () => ({
      tiers: [
        { name: 'T1', description: 'D1' },
        { name: 'T2', description: 'D2' },
        { name: 'T3', description: 'D3' },
      ],
      channels: [
        { name: 'C1', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'K1' },
        { name: 'C2', monthly_budget: 2000, expected_cac: 75, primary_kpi: 'K2' },
        { name: 'C3', monthly_budget: 3000, expected_cac: 100, primary_kpi: 'K3' },
        { name: 'C4', monthly_budget: 4000, expected_cac: 125, primary_kpi: 'K4' },
        { name: 'C5', monthly_budget: 5000, expected_cac: 150, primary_kpi: 'K5' },
        { name: 'C6', monthly_budget: 6000, expected_cac: 175, primary_kpi: 'K6' },
        { name: 'C7', monthly_budget: 7000, expected_cac: 200, primary_kpi: 'K7' },
        { name: 'C8', monthly_budget: 8000, expected_cac: 225, primary_kpi: 'K8' },
      ],
      launch_timeline: [
        { milestone: 'M1', date: '2026-Q2' },
      ],
    });

    it('should pass with exactly 8 channels', () => {
      const data = createValidData();
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail with 6 channels (< 8 required) (TS-2)', () => {
      const data = createValidData();
      data.channels = data.channels.slice(0, 6);
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('channels');
      expect(result.errors[0]).toContain('must have exactly 8 items');
      expect(result.errors[0]).toContain('got 6');
    });

    it('should fail with 7 channels', () => {
      const data = createValidData();
      data.channels = data.channels.slice(0, 7);
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('channels');
      expect(result.errors[0]).toContain('must have exactly 8 items');
      expect(result.errors[0]).toContain('got 7');
    });

    it('should fail with 10 channels (> 8 required) (TS-2)', () => {
      const data = createValidData();
      data.channels.push({ name: 'C9', monthly_budget: 9000, expected_cac: 250, primary_kpi: 'K9' });
      data.channels.push({ name: 'C10', monthly_budget: 10000, expected_cac: 275, primary_kpi: 'K10' });
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('channels');
      expect(result.errors[0]).toContain('must have exactly 8 items');
      expect(result.errors[0]).toContain('got 10');
    });

    it('should fail for non-array channels', () => {
      const data = createValidData();
      data.channels = 'not an array';
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('channels must be an array');
    });

    it('should fail for channel missing name', () => {
      const data = createValidData();
      delete data.channels[3].name;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('channels[3].name'))).toBe(true);
    });

    it('should fail for channel missing monthly_budget (TS-3)', () => {
      const data = createValidData();
      delete data.channels[2].monthly_budget;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('channels[2].monthly_budget'))).toBe(true);
    });

    it('should fail for channel missing expected_cac (TS-3)', () => {
      const data = createValidData();
      delete data.channels[5].expected_cac;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('channels[5].expected_cac'))).toBe(true);
    });

    it('should fail for channel missing primary_kpi', () => {
      const data = createValidData();
      delete data.channels[1].primary_kpi;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('channels[1].primary_kpi'))).toBe(true);
    });

    it('should fail for negative monthly_budget (TS-3)', () => {
      const data = createValidData();
      data.channels[0].monthly_budget = -1000;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('channels[0].monthly_budget'))).toBe(true);
    });

    it('should fail for negative expected_cac (TS-3)', () => {
      const data = createValidData();
      data.channels[4].expected_cac = -50;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('channels[4].expected_cac'))).toBe(true);
    });

    it('should pass with zero monthly_budget', () => {
      const data = createValidData();
      data.channels[6].monthly_budget = 0;
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should pass with zero expected_cac', () => {
      const data = createValidData();
      data.channels[7].expected_cac = 0;
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('validate() - Launch timeline validation', () => {
    const createValidData = () => ({
      tiers: [
        { name: 'T1', description: 'D1' },
        { name: 'T2', description: 'D2' },
        { name: 'T3', description: 'D3' },
      ],
      channels: [
        { name: 'C1', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'K1' },
        { name: 'C2', monthly_budget: 2000, expected_cac: 75, primary_kpi: 'K2' },
        { name: 'C3', monthly_budget: 3000, expected_cac: 100, primary_kpi: 'K3' },
        { name: 'C4', monthly_budget: 4000, expected_cac: 125, primary_kpi: 'K4' },
        { name: 'C5', monthly_budget: 5000, expected_cac: 150, primary_kpi: 'K5' },
        { name: 'C6', monthly_budget: 6000, expected_cac: 175, primary_kpi: 'K6' },
        { name: 'C7', monthly_budget: 7000, expected_cac: 200, primary_kpi: 'K7' },
        { name: 'C8', monthly_budget: 8000, expected_cac: 225, primary_kpi: 'K8' },
      ],
      launch_timeline: [
        { milestone: 'Beta', date: '2026-Q2', owner: 'Team' },
      ],
    });

    it('should pass with valid launch timeline', () => {
      const data = createValidData();
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should fail for empty launch_timeline array', () => {
      const data = createValidData();
      data.launch_timeline = [];
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('launch_timeline');
      expect(result.errors[0]).toContain('must have at least 1 item(s)');
    });

    it('should fail for timeline milestone missing milestone field', () => {
      const data = createValidData();
      delete data.launch_timeline[0].milestone;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_timeline[0].milestone'))).toBe(true);
    });

    it('should fail for timeline milestone missing date field', () => {
      const data = createValidData();
      delete data.launch_timeline[0].date;
      const result = stage11.validate(data);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('launch_timeline[0].date'))).toBe(true);
    });

    it('should pass with multiple timeline milestones', () => {
      const data = createValidData();
      data.launch_timeline = [
        { milestone: 'Alpha', date: '2026-Q1' },
        { milestone: 'Beta', date: '2026-Q2' },
        { milestone: 'GA', date: '2026-Q3' },
      ];
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
    });

    it('should pass with optional owner field', () => {
      const data = createValidData();
      delete data.launch_timeline[0].owner;
      const result = stage11.validate(data);
      expect(result.valid).toBe(true);
    });
  });

  describe('computeDerived() - Derived metrics (TS-4)', () => {
    const createValidData = () => ({
      tiers: [
        { name: 'T1', description: 'D1' },
        { name: 'T2', description: 'D2' },
        { name: 'T3', description: 'D3' },
      ],
      channels: [
        { name: 'C1', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'K1' },
        { name: 'C2', monthly_budget: 2000, expected_cac: 100, primary_kpi: 'K2' },
        { name: 'C3', monthly_budget: 3000, expected_cac: 150, primary_kpi: 'K3' },
        { name: 'C4', monthly_budget: 4000, expected_cac: 200, primary_kpi: 'K4' },
        { name: 'C5', monthly_budget: 5000, expected_cac: 250, primary_kpi: 'K5' },
        { name: 'C6', monthly_budget: 6000, expected_cac: 300, primary_kpi: 'K6' },
        { name: 'C7', monthly_budget: 7000, expected_cac: 350, primary_kpi: 'K7' },
        { name: 'C8', monthly_budget: 8000, expected_cac: 400, primary_kpi: 'K8' },
      ],
      launch_timeline: [
        { milestone: 'M1', date: '2026-Q2' },
      ],
    });

    it('should compute total_monthly_budget (TS-4)', () => {
      const data = createValidData();
      const result = stage11.computeDerived(data);
      // 1000 + 2000 + 3000 + 4000 + 5000 + 6000 + 7000 + 8000 = 36000
      expect(result.total_monthly_budget).toBe(36000);
    });

    it('should compute avg_cac (TS-4)', () => {
      const data = createValidData();
      const result = stage11.computeDerived(data);
      // (50 + 100 + 150 + 200 + 250 + 300 + 350 + 400) / 8 = 1800 / 8 = 225
      expect(result.avg_cac).toBe(225);
    });

    it('should compute avg_cac excluding zero CAC channels', () => {
      const data = createValidData();
      data.channels[0].expected_cac = 0;
      data.channels[1].expected_cac = 0;
      const result = stage11.computeDerived(data);
      // (150 + 200 + 250 + 300 + 350 + 400) / 6 = 1650 / 6 = 275
      expect(result.avg_cac).toBe(275);
    });

    it('should return null avg_cac when all channels have zero CAC', () => {
      const data = createValidData();
      for (const ch of data.channels) {
        ch.expected_cac = 0;
      }
      const result = stage11.computeDerived(data);
      expect(result.avg_cac).toBeNull();
    });

    it('should compute total_monthly_budget with zero budgets', () => {
      const data = createValidData();
      data.channels[0].monthly_budget = 0;
      data.channels[1].monthly_budget = 0;
      const result = stage11.computeDerived(data);
      // 0 + 0 + 3000 + 4000 + 5000 + 6000 + 7000 + 8000 = 33000
      expect(result.total_monthly_budget).toBe(33000);
    });

    it('should compute total_monthly_budget as zero when all budgets are zero', () => {
      const data = createValidData();
      for (const ch of data.channels) {
        ch.monthly_budget = 0;
      }
      const result = stage11.computeDerived(data);
      expect(result.total_monthly_budget).toBe(0);
    });

    it('should preserve all original fields', () => {
      const data = createValidData();
      const result = stage11.computeDerived(data);
      expect(result.tiers).toEqual(data.tiers);
      expect(result.channels).toEqual(data.channels);
      expect(result.launch_timeline).toEqual(data.launch_timeline);
    });

    it('should not mutate original data', () => {
      const data = createValidData();
      const original = JSON.parse(JSON.stringify(data));
      stage11.computeDerived(data);
      expect(data).toEqual(original);
    });

    it('should be deterministic (same input = same output)', () => {
      const data = createValidData();
      const result1 = stage11.computeDerived(data);
      const result2 = stage11.computeDerived(data);
      expect(result1.total_monthly_budget).toBe(result2.total_monthly_budget);
      expect(result1.avg_cac).toBe(result2.avg_cac);
    });
  });

  describe('Integration: validate + computeDerived workflow', () => {
    const createValidData = () => ({
      tiers: [
        { name: 'T1', description: 'D1' },
        { name: 'T2', description: 'D2' },
        { name: 'T3', description: 'D3' },
      ],
      channels: [
        { name: 'C1', monthly_budget: 1000, expected_cac: 50, primary_kpi: 'K1' },
        { name: 'C2', monthly_budget: 2000, expected_cac: 100, primary_kpi: 'K2' },
        { name: 'C3', monthly_budget: 3000, expected_cac: 150, primary_kpi: 'K3' },
        { name: 'C4', monthly_budget: 4000, expected_cac: 200, primary_kpi: 'K4' },
        { name: 'C5', monthly_budget: 5000, expected_cac: 250, primary_kpi: 'K5' },
        { name: 'C6', monthly_budget: 6000, expected_cac: 300, primary_kpi: 'K6' },
        { name: 'C7', monthly_budget: 7000, expected_cac: 350, primary_kpi: 'K7' },
        { name: 'C8', monthly_budget: 8000, expected_cac: 400, primary_kpi: 'K8' },
      ],
      launch_timeline: [
        { milestone: 'M1', date: '2026-Q2' },
      ],
    });

    it('should work together for valid data', () => {
      const data = createValidData();
      const validation = stage11.validate(data);
      expect(validation.valid).toBe(true);

      const computed = stage11.computeDerived(data);
      expect(computed.total_monthly_budget).toBe(36000);
      expect(computed.avg_cac).toBe(225);
    });

    it('should not require validation before computeDerived (decoupled)', () => {
      const data = createValidData();
      data.tiers = data.tiers.slice(0, 2); // Invalid but computeDerived should still work
      const computed = stage11.computeDerived(data);
      expect(computed.total_monthly_budget).toBe(36000);
      expect(computed.avg_cac).toBe(225);
    });
  });
});
