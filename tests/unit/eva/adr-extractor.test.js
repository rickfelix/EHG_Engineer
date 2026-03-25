/**
 * Unit tests for ADR Extractor — Stage 14 ADR extraction and persistence
 * SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001-A
 *
 * @module tests/unit/eva/adr-extractor.test
 */

import { describe, it, expect, vi } from 'vitest';
import { extractADRs, persistADRs, supersedeADR } from '../../../lib/eva/adr-extractor.js';

// Full architecture data matching Stage 14 output shape
const FULL_ARCH_DATA = {
  architecture_summary: 'Full-stack web application with React frontend and Node.js backend',
  layers: {
    presentation: { technology: 'React', components: ['Dashboard', 'Forms'], rationale: 'Component-based UI' },
    api: { technology: 'REST/Express', components: ['Auth API', 'Data API'], rationale: 'Simple HTTP endpoints' },
    business_logic: { technology: 'Node.js', components: ['Validator', 'Transformer'], rationale: 'JavaScript ecosystem' },
    data: { technology: 'PostgreSQL', components: ['Users', 'Orders'], rationale: 'Relational data model' },
    infrastructure: { technology: 'Vercel', components: ['CDN', 'Serverless'], rationale: 'Zero-config deployment' },
  },
  security: {
    authStrategy: 'JWT',
    dataClassification: 'confidential',
    complianceRequirements: ['GDPR', 'SOC2'],
  },
  dataEntities: [
    { name: 'User', description: 'Application user', relationships: ['Order'], estimatedVolume: '~10k' },
    { name: 'Order', description: 'Purchase order', relationships: ['User', 'Product'], estimatedVolume: '~50k' },
  ],
  integration_points: [
    { name: 'API Gateway', source_layer: 'presentation', target_layer: 'api', protocol: 'REST' },
  ],
  constraints: [
    { name: 'Latency', description: '<200ms p99', category: 'performance' },
  ],
};

describe('adr-extractor.js', () => {
  describe('extractADRs()', () => {
    it('should produce 3+ ADRs from full architecture data', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      expect(adrs.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract one ADR per non-TBD layer', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      const layerADRs = adrs.filter(a => a.title.includes('layer:'));
      expect(layerADRs.length).toBe(5); // 5 layers, none TBD
    });

    it('should extract security ADR when authStrategy is defined', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      const securityADR = adrs.find(a => a.title.includes('Security:'));
      expect(securityADR).toBeDefined();
      expect(securityADR.decision).toContain('JWT');
      expect(securityADR.decision).toContain('confidential');
    });

    it('should extract data model ADR when entities exist', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      const dataADR = adrs.find(a => a.title.includes('Data model:'));
      expect(dataADR).toBeDefined();
      expect(dataADR.decision).toContain('2 core data entities');
    });

    it('should assign correct decision_type per layer', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      const dataLayer = adrs.find(a => a.title.startsWith('data layer:'));
      const apiLayer = adrs.find(a => a.title.startsWith('api layer:'));
      const presLayer = adrs.find(a => a.title.startsWith('presentation layer:'));
      expect(dataLayer.decision_type).toBe('data_model');
      expect(apiLayer.decision_type).toBe('api_design');
      expect(presLayer.decision_type).toBe('technical_choice');
    });

    it('should assign sequential adr_number values', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      const numbers = adrs.map(a => a.adr_number);
      expect(numbers[0]).toBe('ADR-001');
      expect(numbers[1]).toBe('ADR-002');
      expect(numbers[numbers.length - 1]).toBe(`ADR-${String(adrs.length).padStart(3, '0')}`);
    });

    it('should generate unique UUIDs for each ADR', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      const ids = new Set(adrs.map(a => a.id));
      expect(ids.size).toBe(adrs.length);
    });

    it('should skip layers with TBD technology', () => {
      const partialData = {
        ...FULL_ARCH_DATA,
        layers: {
          presentation: { technology: 'React', components: ['App'], rationale: 'Test' },
          api: { technology: 'TBD', components: [], rationale: '' },
          business_logic: { technology: 'TBD', components: [], rationale: '' },
          data: { technology: 'TBD', components: [], rationale: '' },
          infrastructure: { technology: 'TBD', components: [], rationale: '' },
        },
      };
      const adrs = extractADRs(partialData);
      const layerADRs = adrs.filter(a => a.title.includes('layer:'));
      expect(layerADRs.length).toBe(1); // only presentation
    });

    it('should return empty array for null/undefined input', () => {
      expect(extractADRs(null)).toEqual([]);
      expect(extractADRs(undefined)).toEqual([]);
    });

    it('should return empty array when layers missing', () => {
      expect(extractADRs({ security: {} })).toEqual([]);
    });

    it('should skip security ADR when authStrategy is TBD', () => {
      const data = {
        layers: { presentation: { technology: 'React', components: ['App'], rationale: 'Test' } },
        security: { authStrategy: 'TBD', dataClassification: 'public' },
      };
      const adrs = extractADRs(data);
      const secADR = adrs.find(a => a.title.includes('Security:'));
      expect(secADR).toBeUndefined();
    });

    it('should skip data model ADR when no entities', () => {
      const data = {
        layers: { presentation: { technology: 'React', components: ['App'], rationale: 'Test' } },
        dataEntities: [],
      };
      const adrs = extractADRs(data);
      const dataADR = adrs.find(a => a.title.includes('Data model:'));
      expect(dataADR).toBeUndefined();
    });

    it('should include rollback_plan on every ADR', () => {
      const adrs = extractADRs(FULL_ARCH_DATA);
      adrs.forEach(adr => {
        expect(adr.rollback_plan).toBeDefined();
        expect(adr.rollback_plan.length).toBeGreaterThan(0);
      });
    });
  });

  describe('persistADRs()', () => {
    /**
     * Build a chainable Supabase mock that supports .from().select().eq().neq().single() etc.
     */
    function chainable(resolveValue) {
      const chain = {};
      const methods = ['select', 'eq', 'neq', 'order', 'limit', 'single', 'maybeSingle'];
      methods.forEach(m => { chain[m] = vi.fn().mockReturnValue(chain); });
      // Terminal methods resolve
      chain.then = (fn) => Promise.resolve(resolveValue).then(fn);
      // Make it thenable so await works
      chain[Symbol.toStringTag] = 'Promise';
      return chain;
    }

    function mockSupabase({ insertError = null, selectData = null, updateError = null } = {}) {
      const leoAdrsChain = chainable({ data: selectData, error: null });
      leoAdrsChain.insert = vi.fn().mockResolvedValue({ error: insertError });

      const archPlansSelectChain = chainable({ data: { adr_ids: [] }, error: null });
      const archPlansUpdateChain = chainable({ error: updateError });
      archPlansSelectChain.select = vi.fn().mockReturnValue(archPlansSelectChain);
      archPlansUpdateChain.update = vi.fn().mockReturnValue(archPlansUpdateChain);

      return {
        from: vi.fn((table) => {
          if (table === 'leo_adrs') {
            return {
              insert: leoAdrsChain.insert,
              select: vi.fn().mockReturnValue(leoAdrsChain),
              update: vi.fn().mockReturnValue(leoAdrsChain),
            };
          }
          if (table === 'eva_architecture_plans') {
            return {
              select: vi.fn().mockReturnValue(archPlansSelectChain),
              update: vi.fn().mockReturnValue(archPlansUpdateChain),
            };
          }
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }),
      };
    }

    it('should return {inserted: 0} for empty ADR array', async () => {
      const supabase = mockSupabase();
      const result = await persistADRs(supabase, [], null);
      expect(result).toEqual({ inserted: 0, adrIds: [] });
    });

    it('should insert ADR rows and return count + ids', async () => {
      const supabase = mockSupabase();
      const adrs = extractADRs(FULL_ARCH_DATA);
      const logger = { log: vi.fn(), warn: vi.fn() };
      const result = await persistADRs(supabase, adrs, null, { logger });
      expect(result.inserted).toBe(adrs.length);
      expect(result.adrIds.length).toBe(adrs.length);
    });

    it('should set architecture_plan_id on rows when provided', async () => {
      const insertFn = vi.fn().mockResolvedValue({ error: null });
      // Build a supabase mock where we can inspect inserted rows
      const leoChain = chainable({ data: [], error: null }); // no existing ADRs
      const archChain = chainable({ data: { adr_ids: [] }, error: null });
      const archUpdateChain = chainable({ error: null });

      const supabase = {
        from: vi.fn((table) => {
          if (table === 'leo_adrs') {
            return {
              insert: insertFn,
              select: vi.fn().mockReturnValue(leoChain),
            };
          }
          if (table === 'eva_architecture_plans') {
            return {
              select: vi.fn().mockReturnValue(archChain),
              update: vi.fn().mockReturnValue(archUpdateChain),
            };
          }
          return {};
        }),
      };

      const adrs = [extractADRs(FULL_ARCH_DATA)[0]];
      const planId = 'plan-uuid-123';
      const logger = { log: vi.fn(), warn: vi.fn() };
      await persistADRs(supabase, adrs, planId, { logger });

      expect(insertFn).toHaveBeenCalled();
      const insertedRows = insertFn.mock.calls[0][0];
      expect(insertedRows[0].architecture_plan_id).toBe(planId);
    });

    it('should return 0 on insert error', async () => {
      const supabase = mockSupabase({ insertError: { message: 'DB error' } });
      const adrs = extractADRs(FULL_ARCH_DATA);
      const logger = { log: vi.fn(), warn: vi.fn() };
      const result = await persistADRs(supabase, adrs, null, { logger });
      expect(result.inserted).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should include prd_id on rows', async () => {
      const insertFn = vi.fn().mockResolvedValue({ error: null });
      const supabase = {
        from: vi.fn(() => ({
          insert: insertFn,
          select: vi.fn().mockReturnValue(chainable({ data: [], error: null })),
        })),
      };

      const adrs = [extractADRs(FULL_ARCH_DATA)[0]];
      const logger = { log: vi.fn(), warn: vi.fn() };
      await persistADRs(supabase, adrs, null, { logger, prdId: 'test-prd-123' });

      const insertedRows = insertFn.mock.calls[0][0];
      expect(insertedRows[0].prd_id).toBe('test-prd-123');
    });
  });

  describe('supersedeADR()', () => {
    it('should update old ADR status to superseded with reference to new ADR', async () => {
      const updateFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const supabase = {
        from: vi.fn().mockReturnValue({ update: updateFn }),
      };

      const result = await supersedeADR(supabase, 'old-uuid', 'new-uuid');
      expect(result).toBe(true);
      expect(updateFn).toHaveBeenCalledWith({
        status: 'superseded',
        superseded_by: 'new-uuid',
      });
    });

    it('should return false on error', async () => {
      const supabase = {
        from: vi.fn().mockReturnValue({
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: { message: 'Not found' } }),
          }),
        }),
      };

      const result = await supersedeADR(supabase, 'old-uuid', 'new-uuid');
      expect(result).toBe(false);
    });
  });
});
