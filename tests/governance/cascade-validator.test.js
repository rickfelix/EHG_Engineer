/**
 * Tests for Strategic Governance Cascade Validator
 * SD-MAN-GEN-CORRECTIVE-VISION-GAP-005
 *
 * Tests cover:
 * - AEGIS query fixes (is_active vs status)
 * - Mission layer validation
 * - Vision bidirectional validation
 * - Strategy bidirectional validation
 * - Cascade-validator integration in SD creation pipeline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabase client
function createMockSupabase(overrides = {}) {
  const defaultResponses = {
    aegis_constitutions: { data: [{ id: 'const-1', name: 'Core', enforcement_mode: 'enforced' }], error: null },
    aegis_rules: { data: [], error: null },
    missions: { data: [{ id: 'mission-1', mission_text: 'Test mission', status: 'active' }], error: null },
    eva_vision_documents: { data: { vision_key: 'VISION-TEST-L2-001', dimensions: [] }, error: null },
    strategic_themes: { data: [{ id: 'theme-1', theme_key: 'T-2026-01', title: 'Growth' }], error: null },
    key_results: { data: [], error: null },
    chairman_decisions: { data: [], error: null },
    ...overrides,
  };

  const mockFrom = (table) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      limit: () => chain,
      single: () => {
        const resp = defaultResponses[table];
        // For single(), if data is an array, return first item
        if (Array.isArray(resp?.data)) {
          return Promise.resolve({ data: resp.data[0] || null, error: resp.error });
        }
        return Promise.resolve(resp || { data: null, error: null });
      },
      then: (fn) => {
        const resp = defaultResponses[table];
        return Promise.resolve(resp || { data: null, error: null }).then(fn);
      },
    };
    // Make chain thenable for non-single queries
    chain[Symbol.for('then')] = chain.then;
    // Override then to make it work as a Promise
    const promise = Promise.resolve(defaultResponses[table] || { data: null, error: null });
    chain.then = promise.then.bind(promise);
    chain.catch = promise.catch.bind(promise);
    return chain;
  };

  return { from: mockFrom };
}

// Helper: build a minimal SD object
function buildSD(overrides = {}) {
  return {
    title: 'Test SD',
    description: 'A test strategic directive',
    strategic_objectives: ['Improve governance'],
    key_changes: ['Fix validation'],
    vision_key: null,
    venture_id: 'venture-1',
    metadata: {},
    ...overrides,
  };
}

describe('cascade-validator', () => {
  let validateCascade;

  beforeEach(async () => {
    // Dynamic import to get fresh module
    const mod = await import('../../scripts/modules/governance/cascade-validator.js');
    validateCascade = mod.validateCascade;
  });

  describe('AEGIS query fixes (FR-001)', () => {
    it('loads constitutions using is_active=true', async () => {
      const selectCalls = [];
      const eqCalls = [];
      const mockFrom = (table) => {
        const chain = {
          select: (...args) => { selectCalls.push({ table, args }); return chain; },
          eq: (...args) => { eqCalls.push({ table, args }); return chain; },
          in: () => chain,
          limit: () => chain,
          single: () => Promise.resolve({ data: null, error: null }),
          then: (fn) => {
            if (table === 'aegis_constitutions') {
              return Promise.resolve({ data: [{ id: 'c1', name: 'Core', enforcement_mode: 'enforced' }], error: null }).then(fn);
            }
            return Promise.resolve({ data: [], error: null }).then(fn);
          },
        };
        const promise = table === 'aegis_constitutions'
          ? Promise.resolve({ data: [{ id: 'c1', name: 'Core', enforcement_mode: 'enforced' }], error: null })
          : Promise.resolve({ data: [], error: null });
        chain.then = promise.then.bind(promise);
        chain.catch = promise.catch.bind(promise);
        return chain;
      };

      const supabase = { from: mockFrom };
      const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

      await validateCascade({
        sd: buildSD(),
        supabase,
        logger,
        dryRun: true,
      });

      // Verify is_active=true was used (not status='active')
      const constitutionEqs = eqCalls.filter(c => c.table === 'aegis_constitutions');
      const hasIsActive = constitutionEqs.some(c => c.args[0] === 'is_active' && c.args[1] === true);
      const hasStatusActive = constitutionEqs.some(c => c.args[0] === 'status' && c.args[1] === 'active');

      expect(hasIsActive).toBe(true);
      expect(hasStatusActive).toBe(false);
    });

    it('loads rules using is_active=true', async () => {
      const eqCalls = [];
      const mockFrom = (table) => {
        const chain = {
          select: () => chain,
          eq: (...args) => { eqCalls.push({ table, args }); return chain; },
          in: () => chain,
          limit: () => chain,
          single: () => Promise.resolve({ data: null, error: null }),
        };
        const promise = table === 'aegis_constitutions'
          ? Promise.resolve({ data: [{ id: 'c1', name: 'Core', enforcement_mode: 'enforced' }], error: null })
          : Promise.resolve({ data: [], error: null });
        chain.then = promise.then.bind(promise);
        chain.catch = promise.catch.bind(promise);
        return chain;
      };

      await validateCascade({
        sd: buildSD(),
        supabase: { from: mockFrom },
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const ruleEqs = eqCalls.filter(c => c.table === 'aegis_rules');
      const hasIsActive = ruleEqs.some(c => c.args[0] === 'is_active' && c.args[1] === true);
      expect(hasIsActive).toBe(true);
    });
  });

  describe('Mission layer validation (FR-002)', () => {
    it('passes when venture has active mission', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ venture_id: 'venture-1' }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const missionViolation = result.violations.find(v => v.layer === 'mission');
      expect(missionViolation).toBeUndefined();
    });

    it('returns violation when no active mission', async () => {
      const supabase = createMockSupabase({
        missions: { data: [], error: null },
      });
      const result = await validateCascade({
        sd: buildSD({ venture_id: 'venture-1' }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const missionViolation = result.violations.find(v => v.layer === 'mission');
      expect(missionViolation).toBeDefined();
      expect(missionViolation.enforcementLevel).toBe('blocking');
    });

    it('warns when no venture_id provided', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ venture_id: null }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const missionWarning = result.warnings.find(w => typeof w === 'object' && w.layer === 'mission');
      expect(missionWarning).toBeDefined();
    });
  });

  describe('Vision bidirectional validation (FR-004)', () => {
    it('passes when vision_key references real document', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ vision_key: 'VISION-TEST-L2-001' }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const visionViolation = result.violations.find(v => v.layer === 'vision');
      expect(visionViolation).toBeUndefined();
    });

    it('returns violation when vision_key does not exist', async () => {
      const supabase = createMockSupabase({
        eva_vision_documents: { data: null, error: null },
      });
      const result = await validateCascade({
        sd: buildSD({ vision_key: 'VISION-NONEXISTENT' }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const visionViolation = result.violations.find(v => v.layer === 'vision');
      expect(visionViolation).toBeDefined();
      expect(visionViolation.reason).toContain('not found in EVA registry');
    });

    it('warns when no vision_key provided', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ vision_key: null }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const visionWarning = result.warnings.find(w => typeof w === 'object' && w.layer === 'vision');
      expect(visionWarning).toBeDefined();
    });
  });

  describe('Strategy bidirectional validation (FR-004)', () => {
    it('warns when SD has objectives but no active themes', async () => {
      const supabase = createMockSupabase({
        strategic_themes: { data: [], error: null },
      });
      const result = await validateCascade({
        sd: buildSD({ strategic_objectives: ['Improve quality'] }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const stratWarning = result.warnings.find(w =>
        typeof w === 'object' && w.layer === 'strategy' && w.reason?.includes('no active strategic themes')
      );
      expect(stratWarning).toBeDefined();
    });

    it('passes when SD has objectives and active themes exist', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ strategic_objectives: ['Improve quality'] }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const stratWarning = result.warnings.find(w =>
        typeof w === 'object' && w.layer === 'strategy' && w.reason?.includes('no active strategic themes')
      );
      expect(stratWarning).toBeUndefined();
    });

    it('warns when SD has no strategic_objectives', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ strategic_objectives: [] }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      const stratWarning = result.warnings.find(w =>
        typeof w === 'object' && w.layer === 'strategy' && w.reason?.includes('no strategic_objectives')
      );
      expect(stratWarning).toBeDefined();
    });
  });

  describe('Full cascade validation', () => {
    it('returns passed=true when no violations exist', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ venture_id: 'venture-1' }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      expect(result.passed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('returns passed=false when blocking violation exists', async () => {
      const supabase = createMockSupabase({
        missions: { data: [], error: null },
      });
      const result = await validateCascade({
        sd: buildSD({ venture_id: 'venture-1' }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('returns warnings but still passes when only advisory issues', async () => {
      const supabase = createMockSupabase();
      const result = await validateCascade({
        sd: buildSD({ strategic_objectives: [], vision_key: null }),
        supabase,
        logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
        dryRun: true,
      });

      expect(result.passed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});
