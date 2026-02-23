/**
 * Portfolio Calibrator (EVA:CALIBRATOR)
 *
 * INDUSTRIAL HARDENING v2.9.0 - Truth Normalization (Pillar 6)
 *
 * Purpose: Normalize calibration scores across ventures with different vertical complexity.
 * A 0.22 delta in FinTech is NOT the same risk as 0.22 in Logistics.
 *
 * Vertical Complexity Multipliers:
 * - Healthcare: 1.5x (Patient safety, regulatory, clinical validation)
 * - FinTech: 1.3x (Regulatory, fraud prevention, financial risk)
 * - EdTech: 1.2x (User engagement variance is normal)
 * - Logistics: 1.0x (Baseline - operational efficiency)
 *
 * SD Authority: SD-PARENT-4.0 (Swarm Genesis)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Default vertical complexity multipliers (fallback if DB unavailable)
 */
const DEFAULT_MULTIPLIERS = {
  healthcare: {
    complexity_multiplier: 1.5,
    risk_adjustment_factor: 1.8,
    health_threshold_green: 0.90,
    health_threshold_yellow: 0.70
  },
  fintech: {
    complexity_multiplier: 1.3,
    risk_adjustment_factor: 1.6,
    health_threshold_green: 0.85,
    health_threshold_yellow: 0.65
  },
  edtech: {
    complexity_multiplier: 1.2,
    risk_adjustment_factor: 1.3,
    health_threshold_green: 0.75,
    health_threshold_yellow: 0.50
  },
  logistics: {
    complexity_multiplier: 1.0,
    risk_adjustment_factor: 1.1,
    health_threshold_green: 0.75,
    health_threshold_yellow: 0.50
  },
  other: {
    complexity_multiplier: 1.0,
    risk_adjustment_factor: 1.0,
    health_threshold_green: 0.75,
    health_threshold_yellow: 0.50
  }
};

/**
 * PortfolioCalibrator - EVA:CALIBRATOR meta-agent
 *
 * Normalizes calibration deltas across ventures with different vertical complexity.
 */
export class PortfolioCalibrator {
  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    this.multipliersCache = null;
    this.cacheExpiry = null;
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Load vertical complexity multipliers from database (with caching)
   */
  async loadMultipliers() {
    // Return cached if valid
    if (this.multipliersCache && this.cacheExpiry > Date.now()) {
      return this.multipliersCache;
    }

    try {
      const { data, error } = await this.supabase
        .from('vertical_complexity_multipliers')
        .select('*');

      if (error) {
        console.warn(`[EVA:CALIBRATOR] DB load failed, using defaults: ${error.message}`);
        return DEFAULT_MULTIPLIERS;
      }

      // Convert to lookup object
      const multipliers = {};
      for (const row of data) {
        multipliers[row.vertical_category] = {
          complexity_multiplier: parseFloat(row.complexity_multiplier),
          risk_adjustment_factor: parseFloat(row.risk_adjustment_factor),
          health_threshold_green: parseFloat(row.health_threshold_green),
          health_threshold_yellow: parseFloat(row.health_threshold_yellow)
        };
      }

      this.multipliersCache = { ...DEFAULT_MULTIPLIERS, ...multipliers };
      this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

      return this.multipliersCache;
    } catch (err) {
      console.warn(`[EVA:CALIBRATOR] Exception loading multipliers: ${err.message}`);
      return DEFAULT_MULTIPLIERS;
    }
  }

  /**
   * Get multiplier for a specific vertical
   */
  async getMultiplier(vertical) {
    const multipliers = await this.loadMultipliers();
    const key = (vertical || 'other').toLowerCase();
    return multipliers[key] || multipliers.other;
  }

  /**
   * Normalize a raw calibration delta by vertical complexity
   *
   * Higher complexity = more severe interpretation of same delta
   * E.g., 0.22 in healthcare (1.5x) becomes 0.33 (more severe)
   *
   * @param {number} rawDelta - Raw calibration delta (0.0 - 1.0)
   * @param {string} vertical - Vertical category
   * @returns {object} Normalized calibration result
   */
  async normalizeCalibrationDelta(rawDelta, vertical) {
    const multiplier = await this.getMultiplier(vertical);

    // Normalize: raw delta * complexity multiplier
    // Higher multiplier = worse interpretation of same delta
    const normalizedDelta = Math.min(1.0, rawDelta * multiplier.complexity_multiplier);

    // Convert delta to accuracy (1 - delta)
    const rawAccuracy = 1 - rawDelta;
    const normalizedAccuracy = 1 - normalizedDelta;

    // Determine health status based on vertical-specific thresholds
    let healthStatus;
    if (normalizedAccuracy >= multiplier.health_threshold_green) {
      healthStatus = 'green';
    } else if (normalizedAccuracy >= multiplier.health_threshold_yellow) {
      healthStatus = 'yellow';
    } else {
      healthStatus = 'red';
    }

    return {
      raw_delta: rawDelta,
      raw_accuracy: rawAccuracy,
      vertical_category: vertical,
      complexity_multiplier: multiplier.complexity_multiplier,
      normalized_delta: normalizedDelta,
      normalized_accuracy: normalizedAccuracy,
      health_status: healthStatus,
      thresholds: {
        green: multiplier.health_threshold_green,
        yellow: multiplier.health_threshold_yellow
      },
      interpretation: this._interpretDelta(rawDelta, normalizedDelta, vertical, healthStatus)
    };
  }

  /**
   * Generate human-readable interpretation of the calibration
   */
  _interpretDelta(rawDelta, normalizedDelta, vertical, healthStatus) {
    const severityWord = healthStatus === 'green' ? 'acceptable' :
                         healthStatus === 'yellow' ? 'concerning' : 'critical';

    return `A ${(rawDelta * 100).toFixed(1)}% raw calibration error in ${vertical} ` +
           `is interpreted as ${(normalizedDelta * 100).toFixed(1)}% after vertical adjustment. ` +
           `This is ${severityWord} for ${vertical} operations.`;
  }

  /**
   * Calibrate entire portfolio - normalize all ventures' health scores
   *
   * @returns {object} Portfolio health summary with normalized scores
   */
  async calibratePortfolio() {
    console.log('\n[EVA:CALIBRATOR] Beginning portfolio calibration...');

    // Load all ventures with their calibration data
    const { data: ventures, error } = await this.supabase
      .from('ventures')
      .select(`
        id,
        name,
        vertical_category,
        current_lifecycle_stage,
        metadata
      `)
      .eq('status', 'active');

    if (error) {
      console.error(`[EVA:CALIBRATOR] Failed to load ventures: ${error.message}`);
      return { success: false, error: error.message };
    }

    const results = [];

    for (const venture of ventures) {
      // Get latest calibration data from system_events
      const { data: latestEvent } = await this.supabase
        .from('system_events')
        .select('calibration_delta, created_at')
        .eq('venture_id', venture.id)
        .eq('event_type', 'AGENT_OUTCOME')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const rawDelta = latestEvent?.calibration_delta || 0;
      const vertical = venture.vertical_category || 'other';

      // Normalize the calibration
      const normalized = await this.normalizeCalibrationDelta(rawDelta, vertical);

      results.push({
        venture_id: venture.id,
        venture_name: venture.name,
        vertical_category: vertical,
        stage: venture.current_lifecycle_stage,
        raw_delta: normalized.raw_delta,
        normalized_delta: normalized.normalized_delta,
        health_status: normalized.health_status,
        complexity_multiplier: normalized.complexity_multiplier
      });

      console.log(`   ${venture.name} (${vertical}): ` +
                  `raw=${(rawDelta * 100).toFixed(1)}% → ` +
                  `normalized=${(normalized.normalized_delta * 100).toFixed(1)}% = ${normalized.health_status.toUpperCase()}`);
    }

    // Calculate portfolio-level metrics
    const portfolio = {
      total_ventures: results.length,
      by_status: {
        green: results.filter(r => r.health_status === 'green').length,
        yellow: results.filter(r => r.health_status === 'yellow').length,
        red: results.filter(r => r.health_status === 'red').length
      },
      avg_normalized_delta: results.reduce((sum, r) => sum + r.normalized_delta, 0) / results.length || 0,
      ventures: results
    };

    console.log('\n[EVA:CALIBRATOR] Portfolio Summary:');
    console.log(`   GREEN: ${portfolio.by_status.green}/${portfolio.total_ventures}`);
    console.log(`   YELLOW: ${portfolio.by_status.yellow}/${portfolio.total_ventures}`);
    console.log(`   RED: ${portfolio.by_status.red}/${portfolio.total_ventures}`);
    console.log(`   Avg Normalized Delta: ${(portfolio.avg_normalized_delta * 100).toFixed(1)}%`);

    return { success: true, portfolio };
  }

  /**
   * Update venture health in database with normalized values
   */
  async persistNormalizedHealth(ventureId, calibrationResult) {
    const { error } = await this.supabase
      .from('venture_stage_work')
      .update({
        calibration_delta_raw: calibrationResult.raw_delta,
        calibration_delta_normalized: calibrationResult.normalized_delta,
        vertical_category: calibrationResult.vertical_category,
        health_score: calibrationResult.health_status,
        updated_at: new Date().toISOString()
      })
      .eq('venture_id', ventureId)
      .eq('lifecycle_stage', calibrationResult.stage);

    if (error) {
      console.warn(`[EVA:CALIBRATOR] Failed to persist health: ${error.message}`);
      return false;
    }

    return true;
  }
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const calibrator = new PortfolioCalibrator();

  console.log(`
╔════════════════════════════════════════════════════════════╗
║     EVA:CALIBRATOR - Truth Normalization (Pillar 6)        ║
╚════════════════════════════════════════════════════════════╝
`);

  calibrator.calibratePortfolio()
    .then(result => {
      if (result.success) {
        console.log('\n✅ Portfolio calibration complete.');
      } else {
        console.error(`\n❌ Portfolio calibration failed: ${result.error}`);
        process.exit(1);
      }
    })
    .catch(err => {
      console.error(`\n❌ Unexpected error: ${err.message}`);
      process.exit(1);
    });
}

export default PortfolioCalibrator;
