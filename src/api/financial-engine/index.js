/**
 * Financial Engine API
 * SD-FINANCIAL-ENGINE-001
 *
 * Endpoints:
 *   POST /api/v2/financial-engine/project - Create financial projection
 *   GET /api/v2/financial-engine/:id - Get projection by model ID
 *   POST /api/v2/financial-engine/:id/scenario - Create scenario for model
 *   GET /api/v2/financial-engine/:id/export - Export model to Excel
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// VALIDATION SCHEMAS
// ============================================================

const assumptionsSchema = z.object({
  // Revenue assumptions
  initial_mrr: z.number().min(0).optional(),
  monthly_growth_rate: z.number().min(0).max(100).optional(),
  price_per_unit: z.number().min(0).optional(),
  units_year_1: z.number().min(0).optional(),

  // Cost assumptions
  cogs_percentage: z.number().min(0).max(100).optional(),
  fixed_costs_monthly: z.number().min(0).optional(),
  headcount_year_1: z.number().min(0).optional(),
  avg_salary: z.number().min(0).optional(),

  // Growth assumptions
  customer_acquisition_cost: z.number().min(0).optional(),
  monthly_churn_rate: z.number().min(0).max(100).optional(),
  ltv_multiplier: z.number().min(0).optional(),

  // Funding
  initial_funding: z.number().min(0).optional(),

  // Custom assumptions (for flexibility)
  custom: z.record(z.union([z.string(), z.number(), z.boolean()])).optional()
});

const projectSchema = z.object({
  venture_id: z.string().uuid(),
  company_id: z.string().uuid(),
  template_type: z.enum(['saas', 'marketplace', 'hardware', 'services', 'ecommerce', 'subscription', 'custom']),
  model_name: z.string().min(1).max(255),
  assumptions: assumptionsSchema,
  projection_years: z.number().min(1).max(10).default(5),
  period_type: z.enum(['monthly', 'quarterly', 'yearly']).default('yearly')
});

const scenarioSchema = z.object({
  scenario_type: z.enum(['monte_carlo', 'sensitivity', 'best_case', 'base_case', 'worst_case', 'custom']),
  name: z.string().min(1).max(100).optional(),
  assumptions_override: assumptionsSchema.optional(),
  probability: z.number().min(0).max(100).optional()
});

// ============================================================
// CALCULATION ENGINE
// ============================================================

/**
 * Calculate SaaS financial projections
 */
function calculateSaaSProjections(assumptions, years, periodType) {
  const periods = [];
  const periodsPerYear = periodType === 'monthly' ? 12 : periodType === 'quarterly' ? 4 : 1;
  const totalPeriods = years * periodsPerYear;

  let currentMRR = assumptions.initial_mrr || 10000;
  const monthlyGrowth = (assumptions.monthly_growth_rate || 5) / 100;
  const churnRate = (assumptions.monthly_churn_rate || 2) / 100;
  const cogsPercent = (assumptions.cogs_percentage || 20) / 100;
  const fixedCosts = assumptions.fixed_costs_monthly || 50000;
  const cac = assumptions.customer_acquisition_cost || 500;
  let cash = assumptions.initial_funding || 500000;

  for (let i = 0; i < totalPeriods; i++) {
    const periodMultiplier = periodType === 'monthly' ? 1 : periodType === 'quarterly' ? 3 : 12;

    // Revenue calculations
    const grossRevenue = currentMRR * periodMultiplier;
    const churnLoss = grossRevenue * churnRate;
    const netRevenue = grossRevenue - churnLoss;

    // Cost calculations
    const cogs = netRevenue * cogsPercent;
    const grossProfit = netRevenue - cogs;
    const operatingExpenses = fixedCosts * periodMultiplier;
    const netIncome = grossProfit - operatingExpenses;

    // Cash flow
    cash += netIncome;
    const burnRate = netIncome < 0 ? Math.abs(netIncome) : 0;
    const runway = burnRate > 0 ? Math.ceil(cash / burnRate) : 999;

    // Metrics
    const ltv = currentMRR * 12 / churnRate;
    const ltvCacRatio = cac > 0 ? ltv / cac : 0;
    const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    periods.push({
      period_number: i + 1,
      period_label: getPeriodLabel(i, periodType),
      revenue: {
        gross_revenue: Math.round(grossRevenue * 100) / 100,
        churn_loss: Math.round(churnLoss * 100) / 100,
        net_revenue: Math.round(netRevenue * 100) / 100
      },
      costs: {
        cogs: Math.round(cogs * 100) / 100,
        operating_expenses: Math.round(operatingExpenses * 100) / 100,
        total_costs: Math.round((cogs + operatingExpenses) * 100) / 100
      },
      profitability: {
        gross_profit: Math.round(grossProfit * 100) / 100,
        gross_margin_percent: Math.round(grossMargin * 100) / 100,
        net_income: Math.round(netIncome * 100) / 100
      },
      cash_flow: {
        cash_balance: Math.round(cash * 100) / 100,
        burn_rate: Math.round(burnRate * 100) / 100,
        runway_months: runway
      },
      metrics: {
        mrr: Math.round(currentMRR * 100) / 100,
        arr: Math.round(currentMRR * 12 * 100) / 100,
        ltv: Math.round(ltv * 100) / 100,
        cac: cac,
        ltv_cac_ratio: Math.round(ltvCacRatio * 100) / 100
      }
    });

    // Apply growth for next period
    currentMRR *= (1 + monthlyGrowth);
  }

  return periods;
}

/**
 * Calculate marketplace financial projections
 */
function calculateMarketplaceProjections(assumptions, years, periodType) {
  const periods = [];
  const periodsPerYear = periodType === 'monthly' ? 12 : periodType === 'quarterly' ? 4 : 1;
  const totalPeriods = years * periodsPerYear;

  let gmv = assumptions.initial_mrr || 100000; // Using initial_mrr for GMV
  const takeRate = 0.15; // 15% take rate
  const monthlyGrowth = (assumptions.monthly_growth_rate || 8) / 100;
  const cogsPercent = (assumptions.cogs_percentage || 10) / 100;
  const fixedCosts = assumptions.fixed_costs_monthly || 30000;
  let cash = assumptions.initial_funding || 500000;

  for (let i = 0; i < totalPeriods; i++) {
    const periodMultiplier = periodType === 'monthly' ? 1 : periodType === 'quarterly' ? 3 : 12;

    const periodGMV = gmv * periodMultiplier;
    const netRevenue = periodGMV * takeRate;
    const cogs = netRevenue * cogsPercent;
    const grossProfit = netRevenue - cogs;
    const operatingExpenses = fixedCosts * periodMultiplier;
    const netIncome = grossProfit - operatingExpenses;

    cash += netIncome;
    const burnRate = netIncome < 0 ? Math.abs(netIncome) : 0;
    const runway = burnRate > 0 ? Math.ceil(cash / burnRate) : 999;

    periods.push({
      period_number: i + 1,
      period_label: getPeriodLabel(i, periodType),
      revenue: {
        gmv: Math.round(periodGMV * 100) / 100,
        take_rate_percent: takeRate * 100,
        net_revenue: Math.round(netRevenue * 100) / 100
      },
      costs: {
        cogs: Math.round(cogs * 100) / 100,
        operating_expenses: Math.round(operatingExpenses * 100) / 100,
        total_costs: Math.round((cogs + operatingExpenses) * 100) / 100
      },
      profitability: {
        gross_profit: Math.round(grossProfit * 100) / 100,
        net_income: Math.round(netIncome * 100) / 100
      },
      cash_flow: {
        cash_balance: Math.round(cash * 100) / 100,
        burn_rate: Math.round(burnRate * 100) / 100,
        runway_months: runway
      }
    });

    gmv *= (1 + monthlyGrowth);
  }

  return periods;
}

/**
 * Calculate generic/custom projections
 */
function calculateGenericProjections(assumptions, years, periodType) {
  const periods = [];
  const periodsPerYear = periodType === 'monthly' ? 12 : periodType === 'quarterly' ? 4 : 1;
  const totalPeriods = years * periodsPerYear;

  let revenue = assumptions.initial_mrr || 50000;
  const monthlyGrowth = (assumptions.monthly_growth_rate || 5) / 100;
  const cogsPercent = (assumptions.cogs_percentage || 30) / 100;
  const fixedCosts = assumptions.fixed_costs_monthly || 40000;
  let cash = assumptions.initial_funding || 300000;

  for (let i = 0; i < totalPeriods; i++) {
    const periodMultiplier = periodType === 'monthly' ? 1 : periodType === 'quarterly' ? 3 : 12;

    const periodRevenue = revenue * periodMultiplier;
    const cogs = periodRevenue * cogsPercent;
    const grossProfit = periodRevenue - cogs;
    const operatingExpenses = fixedCosts * periodMultiplier;
    const netIncome = grossProfit - operatingExpenses;

    cash += netIncome;
    const burnRate = netIncome < 0 ? Math.abs(netIncome) : 0;
    const runway = burnRate > 0 ? Math.ceil(cash / burnRate) : 999;

    periods.push({
      period_number: i + 1,
      period_label: getPeriodLabel(i, periodType),
      revenue: {
        gross_revenue: Math.round(periodRevenue * 100) / 100
      },
      costs: {
        cogs: Math.round(cogs * 100) / 100,
        operating_expenses: Math.round(operatingExpenses * 100) / 100,
        total_costs: Math.round((cogs + operatingExpenses) * 100) / 100
      },
      profitability: {
        gross_profit: Math.round(grossProfit * 100) / 100,
        gross_margin_percent: Math.round((grossProfit / periodRevenue) * 100 * 100) / 100,
        net_income: Math.round(netIncome * 100) / 100
      },
      cash_flow: {
        cash_balance: Math.round(cash * 100) / 100,
        burn_rate: Math.round(burnRate * 100) / 100,
        runway_months: runway
      }
    });

    revenue *= (1 + monthlyGrowth);
  }

  return periods;
}

/**
 * Get period label based on period type
 */
function getPeriodLabel(index, periodType) {
  if (periodType === 'monthly') {
    const year = Math.floor(index / 12) + 1;
    const month = (index % 12) + 1;
    return `Y${year}M${month}`;
  } else if (periodType === 'quarterly') {
    const year = Math.floor(index / 4) + 1;
    const quarter = (index % 4) + 1;
    return `Y${year}Q${quarter}`;
  } else {
    return `Year ${index + 1}`;
  }
}

/**
 * Calculate summary metrics from projection periods
 */
function calculateSummaryMetrics(periods, _assumptions) {
  const lastPeriod = periods[periods.length - 1];
  const firstPeriod = periods[0];

  // Find break-even point
  let breakEvenPeriod = null;
  for (let i = 0; i < periods.length; i++) {
    if (periods[i].profitability.net_income >= 0) {
      breakEvenPeriod = i + 1;
      break;
    }
  }

  // Calculate total revenue and costs
  const totalRevenue = periods.reduce((sum, p) => sum + (p.revenue.net_revenue || p.revenue.gross_revenue || 0), 0);
  const totalCosts = periods.reduce((sum, p) => sum + p.costs.total_costs, 0);
  const totalNetIncome = periods.reduce((sum, p) => sum + p.profitability.net_income, 0);

  return {
    break_even_period: breakEvenPeriod,
    break_even_achieved: breakEvenPeriod !== null,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_costs: Math.round(totalCosts * 100) / 100,
    total_net_income: Math.round(totalNetIncome * 100) / 100,
    final_cash_balance: lastPeriod.cash_flow.cash_balance,
    final_runway_months: lastPeriod.cash_flow.runway_months,
    revenue_growth_total: firstPeriod.revenue.net_revenue || firstPeriod.revenue.gross_revenue
      ? Math.round(((lastPeriod.revenue.net_revenue || lastPeriod.revenue.gross_revenue) /
          (firstPeriod.revenue.net_revenue || firstPeriod.revenue.gross_revenue) - 1) * 100 * 100) / 100
      : 0,
    avg_monthly_burn: periods.filter(p => p.cash_flow.burn_rate > 0).length > 0
      ? Math.round(periods.reduce((sum, p) => sum + p.cash_flow.burn_rate, 0) /
          periods.filter(p => p.cash_flow.burn_rate > 0).length * 100) / 100
      : 0
  };
}

// ============================================================
// API HANDLERS
// ============================================================

/**
 * Create financial projection
 * POST /api/v2/financial-engine/project
 */
export async function createProjection(req, res) {
  const startTime = Date.now();

  try {
    // Validate request
    const data = projectSchema.parse(req.body);
    const { venture_id, company_id, template_type, model_name, assumptions, projection_years, period_type } = data;

    // Verify venture exists
    const { data: venture, error: ventureError } = await supabase
      .from('ventures')
      .select('id, name')
      .eq('id', venture_id)
      .single();

    if (ventureError || !venture) {
      return res.status(404).json({
        error: 'Venture not found',
        venture_id
      });
    }

    // Create financial model record
    const modelId = uuidv4();
    const { error: modelError } = await supabase
      .from('financial_models')
      .insert({
        id: modelId,
        venture_id,
        company_id,
        template_type,
        model_name,
        model_data: {
          assumptions,
          projection_years,
          period_type,
          created_at: new Date().toISOString()
        }
      });

    if (modelError) {
      console.error('Error creating model:', modelError);
      return res.status(500).json({ error: 'Failed to create financial model', details: modelError.message });
    }

    // Calculate projections based on template type
    let periods;
    switch (template_type) {
      case 'saas':
      case 'subscription':
        periods = calculateSaaSProjections(assumptions, projection_years, period_type);
        break;
      case 'marketplace':
        periods = calculateMarketplaceProjections(assumptions, projection_years, period_type);
        break;
      default:
        periods = calculateGenericProjections(assumptions, projection_years, period_type);
    }

    // Calculate summary metrics
    const metrics = calculateSummaryMetrics(periods, assumptions);

    // Create projection record
    const projectionId = uuidv4();
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setFullYear(periodEnd.getFullYear() + projection_years);

    const { error: projectionError } = await supabase
      .from('financial_projections')
      .insert({
        id: projectionId,
        model_id: modelId,
        period_type,
        period_start: now.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        projections: { periods },
        assumptions,
        scenario_name: 'base_case',
        scenario_probability: 50
      });

    if (projectionError) {
      console.error('Error creating projection:', projectionError);
      // Clean up model if projection failed
      await supabase.from('financial_models').delete().eq('id', modelId);
      return res.status(500).json({ error: 'Failed to create projection', details: projectionError.message });
    }

    const generationTime = Date.now() - startTime;

    return res.status(201).json({
      success: true,
      model_id: modelId,
      projection_id: projectionId,
      generation_time_ms: generationTime,
      model: {
        id: modelId,
        venture_id,
        template_type,
        model_name
      },
      projection: {
        id: projectionId,
        period_type,
        periods,
        metrics
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Projection creation error:', error);
    return res.status(500).json({
      error: 'Failed to create projection',
      message: error.message
    });
  }
}

/**
 * Get financial projection by model ID
 * GET /api/v2/financial-engine/:id
 */
export async function getProjection(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Model ID required' });
    }

    // Get model with projections and scenarios
    const { data: model, error: modelError } = await supabase
      .from('financial_models')
      .select('*')
      .eq('id', id)
      .single();

    if (modelError || !model) {
      return res.status(404).json({ error: 'Financial model not found', model_id: id });
    }

    // Get projections for this model
    const { data: projections, error: _projError } = await supabase
      .from('financial_projections')
      .select('*')
      .eq('model_id', id)
      .order('created_at', { ascending: false });

    // Get scenarios for this model
    const { data: scenarios, error: _scenarioError } = await supabase
      .from('financial_scenarios')
      .select('*')
      .eq('model_id', id)
      .order('created_at', { ascending: false });

    // Calculate metrics for the latest projection
    let metrics = null;
    if (projections && projections.length > 0 && projections[0].projections?.periods) {
      metrics = calculateSummaryMetrics(projections[0].projections.periods, projections[0].assumptions);
    }

    return res.status(200).json({
      success: true,
      model,
      projections: projections || [],
      scenarios: scenarios || [],
      metrics,
      projection_count: projections?.length || 0,
      scenario_count: scenarios?.length || 0
    });

  } catch (error) {
    console.error('Get projection error:', error);
    return res.status(500).json({
      error: 'Failed to fetch projection',
      message: error.message
    });
  }
}

/**
 * Create scenario for a model
 * POST /api/v2/financial-engine/:id/scenario
 */
export async function createScenario(req, res) {
  const startTime = Date.now();

  try {
    const { id: modelId } = req.params;
    const data = scenarioSchema.parse(req.body);

    if (!modelId) {
      return res.status(400).json({ error: 'Model ID required' });
    }

    // Get the model
    const { data: model, error: modelError } = await supabase
      .from('financial_models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (modelError || !model) {
      return res.status(404).json({ error: 'Financial model not found', model_id: modelId });
    }

    // Merge assumptions with overrides
    const baseAssumptions = model.model_data?.assumptions || {};
    const mergedAssumptions = {
      ...baseAssumptions,
      ...(data.assumptions_override || {})
    };

    // Apply scenario-specific adjustments
    let adjustedAssumptions = { ...mergedAssumptions };
    if (data.scenario_type === 'best_case') {
      adjustedAssumptions.monthly_growth_rate = (adjustedAssumptions.monthly_growth_rate || 5) * 1.5;
      adjustedAssumptions.monthly_churn_rate = (adjustedAssumptions.monthly_churn_rate || 2) * 0.5;
    } else if (data.scenario_type === 'worst_case') {
      adjustedAssumptions.monthly_growth_rate = (adjustedAssumptions.monthly_growth_rate || 5) * 0.5;
      adjustedAssumptions.monthly_churn_rate = (adjustedAssumptions.monthly_churn_rate || 2) * 2;
    }

    // Calculate projections for the scenario
    const templateType = model.template_type;
    const projectionYears = model.model_data?.projection_years || 5;
    const periodType = model.model_data?.period_type || 'yearly';

    let periods;
    switch (templateType) {
      case 'saas':
      case 'subscription':
        periods = calculateSaaSProjections(adjustedAssumptions, projectionYears, periodType);
        break;
      case 'marketplace':
        periods = calculateMarketplaceProjections(adjustedAssumptions, projectionYears, periodType);
        break;
      default:
        periods = calculateGenericProjections(adjustedAssumptions, projectionYears, periodType);
    }

    // Create scenario record
    const scenarioId = uuidv4();
    const { error: scenarioError } = await supabase
      .from('financial_scenarios')
      .insert({
        id: scenarioId,
        model_id: modelId,
        scenario_type: data.scenario_type,
        scenario_config: {
          name: data.name || data.scenario_type,
          assumptions_override: data.assumptions_override || {},
          merged_assumptions: adjustedAssumptions
        },
        results: {
          periods,
          metrics: calculateSummaryMetrics(periods, adjustedAssumptions)
        }
      });

    if (scenarioError) {
      console.error('Error creating scenario:', scenarioError);
      return res.status(500).json({ error: 'Failed to create scenario', details: scenarioError.message });
    }

    const generationTime = Date.now() - startTime;

    return res.status(201).json({
      success: true,
      scenario_id: scenarioId,
      generation_time_ms: generationTime,
      scenario: {
        id: scenarioId,
        model_id: modelId,
        type: data.scenario_type,
        name: data.name || data.scenario_type,
        periods,
        metrics: calculateSummaryMetrics(periods, adjustedAssumptions)
      }
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors
      });
    }

    console.error('Scenario creation error:', error);
    return res.status(500).json({
      error: 'Failed to create scenario',
      message: error.message
    });
  }
}

/**
 * Export financial model to Excel
 * GET /api/v2/financial-engine/:id/export
 */
export async function exportToExcel(req, res) {
  try {
    const { id: modelId } = req.params;

    if (!modelId) {
      return res.status(400).json({ error: 'Model ID required' });
    }

    // Get the model with projections
    const { data: model, error: modelError } = await supabase
      .from('financial_models')
      .select('*')
      .eq('id', modelId)
      .single();

    if (modelError || !model) {
      return res.status(404).json({ error: 'Financial model not found', model_id: modelId });
    }

    // Get projections
    const { data: projections } = await supabase
      .from('financial_projections')
      .select('*')
      .eq('model_id', modelId)
      .order('created_at', { ascending: false })
      .limit(1);

    // Get scenarios
    const { data: scenarios } = await supabase
      .from('financial_scenarios')
      .select('*')
      .eq('model_id', modelId);

    // Build CSV export (simple fallback - xlsx package would be better for production)
    // For now, return JSON that frontend can convert
    const exportData = {
      model: {
        id: model.id,
        name: model.model_name,
        template_type: model.template_type,
        created_at: model.created_at
      },
      assumptions: model.model_data?.assumptions || {},
      base_projection: projections?.[0]?.projections?.periods || [],
      scenarios: (scenarios || []).map(s => ({
        name: s.scenario_config?.name || s.scenario_type,
        type: s.scenario_type,
        periods: s.results?.periods || []
      }))
    };

    // Return as downloadable JSON (frontend can use xlsx library)
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${model.model_name}-financial-model.json"`);

    return res.status(200).json({
      success: true,
      export_format: 'json',
      note: 'Use xlsx library on frontend for Excel conversion',
      data: exportData
    });

  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({
      error: 'Failed to export model',
      message: error.message
    });
  }
}

/**
 * List all financial models for a venture
 * GET /api/v2/financial-engine/list/:venture_id
 */
export async function listModels(req, res) {
  try {
    const { venture_id } = req.params;

    if (!venture_id) {
      return res.status(400).json({ error: 'Venture ID required' });
    }

    const { data: models, error } = await supabase
      .from('financial_models')
      .select('id, model_name, template_type, created_at, updated_at')
      .eq('venture_id', venture_id)
      .order('updated_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      models: models || [],
      count: models?.length || 0
    });

  } catch (error) {
    console.error('List models error:', error);
    return res.status(500).json({
      error: 'Failed to list models',
      message: error.message
    });
  }
}

export default {
  createProjection,
  getProjection,
  createScenario,
  exportToExcel,
  listModels
};
