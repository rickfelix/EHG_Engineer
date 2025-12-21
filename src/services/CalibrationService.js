/**
 * CalibrationService - 60/40 Weighted Truth Law
 *
 * OPERATION 'SOVEREIGN PIPE' v3.7.0 - Calibration Logic Extraction
 *
 * THE LAW: Calibration = (Business Accuracy × 0.6) + (Technical Accuracy × 0.4)
 *
 * Consolidates calibration logic from:
 * - scripts/modules/adaptive-threshold-calculator.js (threshold logic)
 * - lib/governance/portfolio-calibrator.js (vertical normalization)
 * - lib/agents/venture-ceo-runtime.js (60/40 computation)
 *
 * Purpose: API-ready calibration service with no shell spawning.
 *
 * @module CalibrationService
 * @version 3.7.0
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { SovereignAlert } from '../../lib/services/sovereign-alert.js';

// =============================================================================
// CONSTANTS: Thresholds & Multipliers
// =============================================================================

/**
 * Base threshold by risk level (from adaptive-threshold-calculator.js)
 */
const BASE_THRESHOLDS = {
  LOW: 70,
  MEDIUM: 80,
  HIGH: 90,
  CRITICAL: 95
};

/**
 * Special case minimum thresholds
 */
const SPECIAL_MINIMUMS = {
  PRODUCTION: 90,
  SECURITY: 95,
  DATA_INTEGRITY: 95,
  COMPLIANCE: 95,
  EMERGENCY_HOTFIX: 100
};

/**
 * Default vertical complexity multipliers (from portfolio-calibrator.js)
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

// =============================================================================
// CALIBRATION SERVICE CLASS
// =============================================================================

/**
 * CalibrationService - API-ready calibration computations
 */
export class CalibrationService {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(
      supabaseUrl || process.env.SUPABASE_URL,
      supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    this.multipliersCache = null;
    this.cacheExpiry = null;
    this.CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes (increased from 5)
  }

  // ===========================================================================
  // CORE: 60/40 Truth Delta Computation
  // ===========================================================================

  /**
   * Compute the 60/40 Weighted Truth Delta
   *
   * THE LAW: Business accuracy carries 60% weight, Technical carries 40%.
   *
   * @param {number} businessAccuracy - Business accuracy score (0.0 - 1.0)
   * @param {number} technicalAccuracy - Technical accuracy score (0.0 - 1.0)
   * @returns {object} Truth delta computation result
   */
  computeTruthDelta(businessAccuracy, technicalAccuracy) {
    // Apply the 60/40 law
    const compositeScore = (businessAccuracy * 0.6) + (technicalAccuracy * 0.4);

    return {
      business_accuracy: businessAccuracy,
      technical_accuracy: technicalAccuracy,
      business_weight: 0.6,
      technical_weight: 0.4,
      composite_score: compositeScore,
      truth_delta: 1 - compositeScore, // Delta = deviation from perfect
      law: 'Calibration = (Business × 0.6) + (Technical × 0.4)'
    };
  }

  // ===========================================================================
  // THRESHOLD: Adaptive Threshold Calculation
  // ===========================================================================

  /**
   * Calculate adaptive threshold for a validation gate
   *
   * @param {object} options - Calculation options
   * @param {object} options.sd - Strategic directive record
   * @param {Array} options.priorGateScores - Prior gate scores
   * @param {object} options.patternStats - Pattern stats { sdCount, avgROI }
   * @param {number} options.gateNumber - Gate number (1-4)
   * @returns {object} Threshold calculation result
   */
  calculateAdaptiveThreshold(options) {
    const { sd, priorGateScores = [], patternStats = null, gateNumber = 1 } = options;

    // Step 1: Base threshold from risk level
    const riskLevel = (sd.risk_level || sd.metadata?.risk_level || 'MEDIUM').toUpperCase();
    const baseThreshold = BASE_THRESHOLDS[riskLevel] || BASE_THRESHOLDS.MEDIUM;

    // Step 2: Performance modifier
    const performanceMod = this._getPerformanceModifier(priorGateScores);

    // Step 3: Maturity modifier
    const maturityMod = this._getMaturityModifier(patternStats);

    // Step 4: Raw threshold
    const rawThreshold = baseThreshold + performanceMod + maturityMod;

    // Step 5: Apply special case minimums
    const thresholdWithSpecialCases = this._applySpecialCaseMinimums(sd, rawThreshold);

    // Step 6: Cap at 100%
    const finalThreshold = Math.min(100, thresholdWithSpecialCases);

    return {
      finalThreshold,
      breakdown: {
        baseThreshold,
        performanceMod,
        maturityMod,
        rawThreshold,
        specialCaseApplied: thresholdWithSpecialCases > rawThreshold,
        specialCaseMinimum: thresholdWithSpecialCases > rawThreshold ? thresholdWithSpecialCases : null
      },
      reasoning: `Gate ${gateNumber} threshold: Base ${baseThreshold}% (${riskLevel}), ` +
                 `Performance ${performanceMod >= 0 ? '+' : ''}${performanceMod}%, ` +
                 `Maturity ${maturityMod >= 0 ? '+' : ''}${maturityMod}%. Final: ${finalThreshold}%`
    };
  }

  /**
   * Check if gate passed with adaptive threshold
   */
  checkGatePassed(score, thresholdResult) {
    const { finalThreshold, reasoning } = thresholdResult;
    const passed = score >= finalThreshold;
    const margin = score - finalThreshold;

    return {
      passed,
      score,
      threshold: finalThreshold,
      margin,
      reasoning,
      status: passed ? 'PASS' : 'FAIL',
      message: passed
        ? `Gate passed: ${score}/${finalThreshold} (margin: +${margin.toFixed(1)}%)`
        : `Gate failed: ${score}/${finalThreshold} (shortfall: ${margin.toFixed(1)}%)`
    };
  }

  // ===========================================================================
  // VERTICAL NORMALIZATION
  // ===========================================================================

  /**
   * Load vertical complexity multipliers from database
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
        console.warn(`[CalibrationService] DB load failed, using defaults: ${error.message}`);
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
      console.warn(`[CalibrationService] Exception: ${err.message}`);
      return DEFAULT_MULTIPLIERS;
    }
  }

  /**
   * Get multiplier for a specific vertical
   */
  async getVerticalMultiplier(vertical) {
    const multipliers = await this.loadMultipliers();
    const key = (vertical || 'other').toLowerCase();
    return multipliers[key] || multipliers.other;
  }

  /**
   * Normalize a calibration delta by vertical complexity
   *
   * @param {number} rawDelta - Raw calibration delta (0.0 - 1.0)
   * @param {string} vertical - Vertical category
   * @returns {object} Normalized calibration result
   */
  async normalizeCalibrationDelta(rawDelta, vertical) {
    const multiplier = await this.getVerticalMultiplier(vertical);

    // Normalize: raw delta * complexity multiplier
    const normalizedDelta = Math.min(1.0, rawDelta * multiplier.complexity_multiplier);

    // Convert delta to accuracy
    const rawAccuracy = 1 - rawDelta;
    const normalizedAccuracy = 1 - normalizedDelta;

    // Determine health status
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
      }
    };
  }

  // ===========================================================================
  // VENTURE CALIBRATION
  // ===========================================================================

  /**
   * Get calibration score for a specific venture
   *
   * @param {string} ventureId - Venture UUID
   * @returns {object} Venture calibration result
   */
  async getVentureCalibration(ventureId) {
    // Get venture details
    const { data: venture, error: ventureError } = await this.supabase
      .from('ventures')
      .select('id, name, vertical_category, current_lifecycle_stage')
      .eq('id', ventureId)
      .single();

    if (ventureError) {
      return { success: false, error: ventureError.message };
    }

    // Get latest calibration event
    const { data: latestEvent } = await this.supabase
      .from('system_events')
      .select('calibration_delta, created_at')
      .eq('venture_id', ventureId)
      .eq('event_type', 'AGENT_OUTCOME')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const rawDelta = latestEvent?.calibration_delta || 0;
    const vertical = venture.vertical_category || 'other';

    // Normalize
    const normalized = await this.normalizeCalibrationDelta(rawDelta, vertical);

    // Industrial Hardening v3.0: Fire SovereignAlert if delta below emergency threshold
    // Emergency threshold: normalized_accuracy < 0.5 (i.e., normalized_delta > 0.5)
    if (normalized.normalized_delta > 0.5) {
      try {
        await SovereignAlert.fireCalibrationEmergency(ventureId, normalized.normalized_delta, {
          venture_name: venture.name,
          vertical_category: vertical,
          raw_delta: normalized.raw_delta,
          health_status: normalized.health_status
        });
      } catch (alertError) {
        console.error(`[CalibrationService] Failed to fire SovereignAlert: ${alertError.message}`);
      }
    }

    return {
      success: true,
      venture: {
        id: venture.id,
        name: venture.name,
        vertical: vertical,
        stage: venture.current_lifecycle_stage
      },
      calibration: normalized,
      last_updated: latestEvent?.created_at || null
    };
  }

  /**
   * Calibrate entire portfolio
   */
  async calibratePortfolio() {
    const { data: ventures, error } = await this.supabase
      .from('ventures')
      .select('id, name, vertical_category, current_lifecycle_stage')
      .eq('status', 'active');

    if (error) {
      return { success: false, error: error.message };
    }

    const results = [];

    for (const venture of ventures) {
      const calibration = await this.getVentureCalibration(venture.id);
      if (calibration.success) {
        results.push(calibration);
      }
    }

    // Portfolio summary
    const summary = {
      total_ventures: results.length,
      by_status: {
        green: results.filter(r => r.calibration.health_status === 'green').length,
        yellow: results.filter(r => r.calibration.health_status === 'yellow').length,
        red: results.filter(r => r.calibration.health_status === 'red').length
      },
      avg_normalized_delta: results.length > 0
        ? results.reduce((sum, r) => sum + r.calibration.normalized_delta, 0) / results.length
        : 0
    };

    return {
      success: true,
      portfolio: summary,
      ventures: results
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  _getPerformanceModifier(priorGateScores) {
    if (!priorGateScores || priorGateScores.length === 0) {
      return 0;
    }

    const validScores = priorGateScores.filter(score => score !== null && score !== undefined);
    if (validScores.length === 0) {
      return 0;
    }

    const average = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;

    if (average >= 90) return -5;  // Strong → easier
    if (average < 75) return 5;    // Weak → harder
    return 0;
  }

  _getMaturityModifier(patternStats) {
    if (!patternStats || !patternStats.sdCount) {
      return 0;
    }

    const { sdCount, avgROI } = patternStats;
    if (sdCount > 10 && avgROI > 85) {
      return 5;
    }

    return 0;
  }

  _applySpecialCaseMinimums(sd, calculatedThreshold) {
    let threshold = calculatedThreshold;

    const directCategories = Array.isArray(sd.category) ? sd.category : [sd.category];
    const metadataCategories = sd.metadata?.categories || [];
    const allCategories = [...directCategories, ...metadataCategories];
    const categoriesLower = allCategories.map(c => c?.toLowerCase() || '');

    if (sd.is_production_deployment || sd.metadata?.is_production_deployment || categoriesLower.includes('production')) {
      threshold = Math.max(threshold, SPECIAL_MINIMUMS.PRODUCTION);
    }

    if (categoriesLower.includes('security') || categoriesLower.includes('authentication')) {
      threshold = Math.max(threshold, SPECIAL_MINIMUMS.SECURITY);
    }

    if (categoriesLower.includes('database') && (sd.complexity === 'CRITICAL' || sd.metadata?.complexity === 'CRITICAL')) {
      threshold = Math.max(threshold, SPECIAL_MINIMUMS.DATA_INTEGRITY);
    }

    if (categoriesLower.includes('compliance') || categoriesLower.includes('legal')) {
      threshold = Math.max(threshold, SPECIAL_MINIMUMS.COMPLIANCE);
    }

    if (sd.is_emergency_hotfix || sd.metadata?.is_emergency_hotfix || sd.title?.toLowerCase().includes('hotfix')) {
      threshold = Math.max(threshold, SPECIAL_MINIMUMS.EMERGENCY_HOTFIX);
    }

    return threshold;
  }
}

// Singleton instance
let instance = null;

/**
 * Get singleton CalibrationService instance
 */
export function getCalibrationService() {
  if (!instance) {
    instance = new CalibrationService();
  }
  return instance;
}

export default CalibrationService;
