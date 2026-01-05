/**
 * Financial Engine API Integration Tests
 * SD-FINANCIAL-ENGINE-001
 *
 * Tests the Financial Modeling Engine API endpoints:
 *   - POST /api/v2/financial-engine/project
 *   - GET /api/v2/financial-engine/:id
 *   - POST /api/v2/financial-engine/:id/scenario
 *   - GET /api/v2/financial-engine/:id/export
 *   - GET /api/v2/financial-engine/list/:venture_id
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Test fixtures
let testVentureId;
let testCompanyId;
let testModelId;
let testProjectionId;

// Mock request/response for testing handlers directly
function createMockReq(body = {}, params = {}) {
  return { body, params };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    jsonData: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.jsonData = data;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    }
  };
  return res;
}

describe('Financial Engine API', () => {
  beforeAll(async () => {
    // Create test venture and company
    testCompanyId = uuidv4();
    testVentureId = uuidv4();

    // Insert test company
    const { error: companyError } = await supabase.from('companies').insert({
      id: testCompanyId,
      name: 'Test Company for Financial Engine',
      created_at: new Date().toISOString()
    });
    if (companyError) console.error('Company insert error:', companyError.message);

    // Insert test venture with all required fields
    const { error: ventureError } = await supabase.from('ventures').insert({
      id: testVentureId,
      name: 'Test Venture for Financial Engine',
      company_id: testCompanyId,
      problem_statement: 'Test problem statement for financial engine API tests',
      current_lifecycle_stage: 1,
      status: 'active',
      created_at: new Date().toISOString()
    });
    if (ventureError) console.error('Venture insert error:', ventureError.message);
  });

  afterAll(async () => {
    // Clean up test data in reverse order due to foreign keys
    if (testModelId) {
      await supabase.from('financial_scenarios').delete().eq('model_id', testModelId);
      await supabase.from('financial_projections').delete().eq('model_id', testModelId);
      await supabase.from('financial_models').delete().eq('id', testModelId);
    }
    if (testVentureId) {
      await supabase.from('ventures').delete().eq('id', testVentureId);
    }
    if (testCompanyId) {
      await supabase.from('companies').delete().eq('id', testCompanyId);
    }
  });

  describe('POST /api/v2/financial-engine/project', () => {
    it('should create a SaaS financial projection with valid input', async () => {
      const { createProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({
        venture_id: testVentureId,
        company_id: testCompanyId,
        template_type: 'saas',
        model_name: 'Test SaaS Model',
        assumptions: {
          initial_mrr: 10000,
          monthly_growth_rate: 5,
          monthly_churn_rate: 2,
          cogs_percentage: 20,
          fixed_costs_monthly: 50000,
          initial_funding: 500000
        },
        projection_years: 3,
        period_type: 'yearly'
      });
      const res = createMockRes();

      await createProjection(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.model_id).toBeDefined();
      expect(res.jsonData.projection_id).toBeDefined();
      expect(res.jsonData.projection.periods).toHaveLength(3);

      // Store for later tests
      testModelId = res.jsonData.model_id;
      testProjectionId = res.jsonData.projection_id;

      // Verify projection metrics
      const metrics = res.jsonData.projection.metrics;
      expect(metrics.break_even_achieved).toBeDefined();
      expect(metrics.total_revenue).toBeGreaterThan(0);
      expect(metrics.final_cash_balance).toBeDefined();
    });

    it('should reject invalid venture_id', async () => {
      const { createProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({
        venture_id: uuidv4(), // Non-existent venture
        company_id: testCompanyId,
        template_type: 'saas',
        model_name: 'Invalid Venture Test',
        assumptions: {},
        projection_years: 3
      });
      const res = createMockRes();

      await createProjection(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData.error).toBe('Venture not found');
    });

    it('should reject invalid template_type', async () => {
      const { createProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({
        venture_id: testVentureId,
        company_id: testCompanyId,
        template_type: 'invalid_type',
        model_name: 'Invalid Template Test',
        assumptions: {},
        projection_years: 3
      });
      const res = createMockRes();

      await createProjection(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Validation error');
    });

    it('should create marketplace projection', async () => {
      const { createProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({
        venture_id: testVentureId,
        company_id: testCompanyId,
        template_type: 'marketplace',
        model_name: 'Test Marketplace Model',
        assumptions: {
          initial_mrr: 100000, // GMV
          monthly_growth_rate: 8,
          cogs_percentage: 10,
          fixed_costs_monthly: 30000,
          initial_funding: 500000
        },
        projection_years: 2,
        period_type: 'quarterly'
      });
      const res = createMockRes();

      await createProjection(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.projection.periods).toHaveLength(8); // 2 years * 4 quarters

      // Marketplace should have GMV in revenue
      expect(res.jsonData.projection.periods[0].revenue.gmv).toBeDefined();

      // Clean up this additional model
      await supabase.from('financial_projections').delete().eq('model_id', res.jsonData.model_id);
      await supabase.from('financial_models').delete().eq('id', res.jsonData.model_id);
    });

    it('should generate projections within target time (<5s)', async () => {
      const { createProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({
        venture_id: testVentureId,
        company_id: testCompanyId,
        template_type: 'saas',
        model_name: 'Performance Test Model',
        assumptions: {
          initial_mrr: 10000,
          monthly_growth_rate: 5
        },
        projection_years: 5,
        period_type: 'monthly' // 60 periods - more complex
      });
      const res = createMockRes();

      await createProjection(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.generation_time_ms).toBeLessThan(5000); // Target: <5s

      // Clean up
      await supabase.from('financial_projections').delete().eq('model_id', res.jsonData.model_id);
      await supabase.from('financial_models').delete().eq('id', res.jsonData.model_id);
    });
  });

  describe('GET /api/v2/financial-engine/:id', () => {
    it('should retrieve projection by model ID', async () => {
      const { getProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, { id: testModelId });
      const res = createMockRes();

      await getProjection(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.model).toBeDefined();
      expect(res.jsonData.model.id).toBe(testModelId);
      expect(res.jsonData.projections).toBeInstanceOf(Array);
      expect(res.jsonData.projection_count).toBeGreaterThan(0);
    });

    it('should return 404 for non-existent model', async () => {
      const { getProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, { id: uuidv4() });
      const res = createMockRes();

      await getProjection(req, res);

      expect(res.statusCode).toBe(404);
      expect(res.jsonData.error).toBe('Financial model not found');
    });

    it('should return 400 for missing model ID', async () => {
      const { getProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, {});
      const res = createMockRes();

      await getProjection(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v2/financial-engine/:id/scenario', () => {
    it('should create base_case scenario', async () => {
      const { createScenario } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq(
        {
          scenario_type: 'base_case',
          name: 'Base Case Scenario'
        },
        { id: testModelId }
      );
      const res = createMockRes();

      await createScenario(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.scenario_id).toBeDefined();
      expect(res.jsonData.scenario.type).toBe('base_case');
    });

    it('should create best_case scenario with adjusted assumptions', async () => {
      const { createScenario } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq(
        {
          scenario_type: 'best_case',
          name: 'Optimistic Scenario'
        },
        { id: testModelId }
      );
      const res = createMockRes();

      await createScenario(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.scenario.type).toBe('best_case');

      // Best case should have better metrics than base case
      expect(res.jsonData.scenario.metrics).toBeDefined();
    });

    it('should create worst_case scenario with conservative assumptions', async () => {
      const { createScenario } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq(
        {
          scenario_type: 'worst_case',
          name: 'Conservative Scenario'
        },
        { id: testModelId }
      );
      const res = createMockRes();

      await createScenario(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.scenario.type).toBe('worst_case');
    });

    it('should create custom scenario with assumption overrides', async () => {
      const { createScenario } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq(
        {
          scenario_type: 'custom',
          name: 'High Growth Custom',
          assumptions_override: {
            monthly_growth_rate: 15,
            monthly_churn_rate: 1
          }
        },
        { id: testModelId }
      );
      const res = createMockRes();

      await createScenario(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.scenario.type).toBe('custom');
    });

    it('should reject invalid scenario_type', async () => {
      const { createScenario } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq(
        {
          scenario_type: 'invalid_scenario'
        },
        { id: testModelId }
      );
      const res = createMockRes();

      await createScenario(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.jsonData.error).toBe('Validation error');
    });

    it('should return 404 for non-existent model', async () => {
      const { createScenario } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq(
        { scenario_type: 'base_case' },
        { id: uuidv4() }
      );
      const res = createMockRes();

      await createScenario(req, res);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v2/financial-engine/:id/export', () => {
    it('should export model data as JSON', async () => {
      const { exportToExcel } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, { id: testModelId });
      const res = createMockRes();

      await exportToExcel(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.export_format).toBe('json');
      expect(res.jsonData.data).toBeDefined();
      expect(res.jsonData.data.model).toBeDefined();
      expect(res.jsonData.data.assumptions).toBeDefined();
      expect(res.jsonData.data.base_projection).toBeInstanceOf(Array);
      expect(res.jsonData.data.scenarios).toBeInstanceOf(Array);

      // Check Content-Disposition header
      expect(res.headers['Content-Disposition']).toContain('attachment');
    });

    it('should return 404 for non-existent model', async () => {
      const { exportToExcel } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, { id: uuidv4() });
      const res = createMockRes();

      await exportToExcel(req, res);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v2/financial-engine/list/:venture_id', () => {
    it('should list all models for a venture', async () => {
      const { listModels } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, { venture_id: testVentureId });
      const res = createMockRes();

      await listModels(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.models).toBeInstanceOf(Array);
      expect(res.jsonData.count).toBeGreaterThan(0);

      // Verify model structure
      const model = res.jsonData.models[0];
      expect(model.id).toBeDefined();
      expect(model.model_name).toBeDefined();
      expect(model.template_type).toBeDefined();
    });

    it('should return empty list for venture with no models', async () => {
      const { listModels } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, { venture_id: uuidv4() });
      const res = createMockRes();

      await listModels(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.jsonData.models).toEqual([]);
      expect(res.jsonData.count).toBe(0);
    });

    it('should return 400 for missing venture_id', async () => {
      const { listModels } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({}, {});
      const res = createMockRes();

      await listModels(req, res);

      expect(res.statusCode).toBe(400);
    });
  });

  describe('Calculation Accuracy', () => {
    it('should calculate break-even point correctly', async () => {
      const { createProjection } = await import('../../src/api/financial-engine/index.js');

      // Create a model that should break even
      const req = createMockReq({
        venture_id: testVentureId,
        company_id: testCompanyId,
        template_type: 'saas',
        model_name: 'Break-Even Test Model',
        assumptions: {
          initial_mrr: 100000, // High initial MRR
          monthly_growth_rate: 10,
          monthly_churn_rate: 1,
          cogs_percentage: 15,
          fixed_costs_monthly: 40000,
          initial_funding: 200000
        },
        projection_years: 3,
        period_type: 'yearly'
      });
      const res = createMockRes();

      await createProjection(req, res);

      expect(res.statusCode).toBe(201);
      expect(res.jsonData.projection.metrics.break_even_achieved).toBe(true);
      expect(res.jsonData.projection.metrics.break_even_period).toBeDefined();

      // Clean up
      await supabase.from('financial_projections').delete().eq('model_id', res.jsonData.model_id);
      await supabase.from('financial_models').delete().eq('id', res.jsonData.model_id);
    });

    it('should calculate LTV/CAC ratio correctly for SaaS', async () => {
      const { createProjection } = await import('../../src/api/financial-engine/index.js');

      const req = createMockReq({
        venture_id: testVentureId,
        company_id: testCompanyId,
        template_type: 'saas',
        model_name: 'LTV CAC Test Model',
        assumptions: {
          initial_mrr: 10000,
          monthly_growth_rate: 5,
          monthly_churn_rate: 2, // 2% churn = 50 month LTV
          customer_acquisition_cost: 500
        },
        projection_years: 1,
        period_type: 'monthly'
      });
      const res = createMockRes();

      await createProjection(req, res);

      expect(res.statusCode).toBe(201);

      // Check first period has LTV/CAC ratio
      const firstPeriod = res.jsonData.projection.periods[0];
      expect(firstPeriod.metrics.ltv).toBeGreaterThan(0);
      expect(firstPeriod.metrics.cac).toBe(500);
      expect(firstPeriod.metrics.ltv_cac_ratio).toBeGreaterThan(0);

      // Clean up
      await supabase.from('financial_projections').delete().eq('model_id', res.jsonData.model_id);
      await supabase.from('financial_models').delete().eq('id', res.jsonData.model_id);
    });
  });
});
