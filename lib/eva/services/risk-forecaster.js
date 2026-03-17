/**
 * Risk Forecaster Service
 * Generates forward-looking risk predictions from venture risk assessment history.
 * Requires >=3 historical assessments to produce a forecast.
 *
 * Part of SD-LEO-INFRA-UNIFIED-STRATEGIC-INTELLIGENCE-001-B
 */

import { createSupabaseServiceClient } from '../../supabase-client.js';

const supabase = createSupabaseServiceClient();
const MIN_ASSESSMENTS = 3;
const MODEL_VERSION = '1.0';

/**
 * Generate risk forecasts for a single venture.
 * Uses linear trend extrapolation from historical risk assessments.
 *
 * @param {string} ventureId - Venture UUID
 * @returns {Array} Generated forecast rows
 */
export async function generateForecast(ventureId) {
  const { data: forms, error } = await supabase
    .from('risk_recalibration_forms')
    .select('id, gate_number, assessment_date, market_risk_current, product_risk_current, technical_risk_current, legal_risk_current, financial_risk_current, operational_risk_current, new_risks')
    .eq('venture_id', ventureId)
    .order('assessment_date', { ascending: true });

  if (error) throw new Error(`Risk recalibration query failed: ${error.message}`);
  if (!forms || forms.length < MIN_ASSESSMENTS) {
    return [];
  }

  // Convert per-category columns to assessment-like records
  const levelToScore = (level) => ({ CRITICAL: 90, HIGH: 60, MEDIUM: 30, LOW: 10, 'N/A': 0 }[level] || 0);
  const categoryColumns = ['market', 'product', 'technical', 'legal', 'financial', 'operational'];
  const byCategory = {};
  for (const form of forms) {
    for (const cat of categoryColumns) {
      const level = form[`${cat}_risk_current`];
      if (!level || level === 'N/A') continue;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push({
        id: form.id,
        risk_category: cat,
        risk_score: levelToScore(level),
        assessment_date: form.assessment_date,
        factors: (form.new_risks || []).filter(r => r.category?.toLowerCase().startsWith(cat)).map(r => r.description),
      });
    }
  }

  const forecasts = [];
  for (const [category, catAssessments] of Object.entries(byCategory)) {
    if (catAssessments.length < MIN_ASSESSMENTS) continue;

    const scores = catAssessments.map(a => a.risk_score || 0);
    const n = scores.length;

    // Linear regression: y = mx + b
    const xMean = (n - 1) / 2;
    const yMean = scores.reduce((s, v) => s + v, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - xMean) * (scores[i] - yMean);
      den += (i - xMean) ** 2;
    }
    const slope = den !== 0 ? num / den : 0;
    const predicted = Math.max(0, Math.min(100, Math.round(yMean + slope * (n - xMean))));

    // Confidence based on data density and consistency
    const variance = scores.reduce((s, v) => s + (v - yMean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    const consistencyFactor = Math.max(0, 1 - stdDev / 50);
    const densityFactor = Math.min(1, n / 10);
    const confidence = Math.round(consistencyFactor * densityFactor * 100) / 100;

    const recentFactors = catAssessments.slice(-2).flatMap(a => a.factors || []);

    forecasts.push({
      venture_id: ventureId,
      risk_category: category,
      predicted_score: predicted,
      confidence,
      factors: recentFactors,
      model_version: MODEL_VERSION,
    });
  }

  if (forecasts.length === 0) return [];

  const { data: inserted, error: insertErr } = await supabase
    .from('risk_forecasts')
    .insert(forecasts)
    .select();

  if (insertErr) throw new Error(`Forecast insert failed: ${insertErr.message}`);
  return inserted || [];
}

/**
 * Generate forecasts for all active ventures with sufficient history.
 * @returns {Object} { generated, skipped, errors }
 */
export async function generateAllForecasts() {
  const { data: ventures } = await supabase
    .from('ventures')
    .select('id, name')
    .eq('status', 'active');

  const results = { generated: 0, skipped: 0, errors: [] };

  for (const v of ventures || []) {
    try {
      const forecasts = await generateForecast(v.id);
      if (forecasts.length > 0) results.generated += forecasts.length;
      else results.skipped++;
    } catch (err) {
      results.errors.push({ venture: v.name, error: err.message });
    }
  }

  return results;
}

/**
 * Get latest forecasts for a venture.
 * @param {string} ventureId
 * @returns {Array} Latest forecasts by category
 */
export async function getLatestForecasts(ventureId) {
  const { data, error } = await supabase
    .from('risk_forecasts')
    .select('*')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) throw new Error(`getLatestForecasts failed: ${error.message}`);
  return data || [];
}
