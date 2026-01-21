/**
 * CEO Truth Layer
 * Prediction logging, outcome tracking, and calibration computation
 *
 * SOVEREIGN SEAL v2.9.0: All predictions must be logged
 * Truth Layer enables CEO accountability and accuracy tracking
 *
 * Extracted from venture-ceo-runtime.js for modularity
 * SD-LEO-REFACTOR-VENTURE-CEO-001
 */

import { BusinessHypothesisValidationError } from './exceptions.js';
import { BUSINESS_HYPOTHESIS_SCHEMA } from './constants.js';

/**
 * Truth Layer class
 * Handles prediction/outcome tracking and calibration
 */
export class TruthLayer {
  constructor(supabase, agentId, ventureId) {
    this.supabase = supabase;
    this.agentId = agentId;
    this.ventureId = ventureId;
  }

  /**
   * Log a prediction for future validation
   * SOVEREIGN SEAL v2.9.0: All market/business predictions must be logged
   *
   * @param {Object} prediction - Prediction details
   * @param {string} prediction.prediction_type - Category (market, product, operational, financial)
   * @param {string} prediction.statement - What is being predicted
   * @param {number} prediction.confidence - 0.0 - 1.0
   * @param {string} prediction.timeframe - When outcome expected (ISO date or duration)
   * @param {Object} prediction.metadata - Additional context
   * @returns {Promise<Object>} Created prediction record
   */
  async logPrediction(prediction) {
    const { prediction_type, statement, confidence, timeframe, metadata = {} } = prediction;

    // Validate required fields
    if (!prediction_type || !statement || confidence === undefined || !timeframe) {
      throw new Error('Prediction must include type, statement, confidence, and timeframe');
    }

    // Validate confidence range
    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence must be between 0.0 and 1.0');
    }

    const predictionRecord = {
      agent_id: this.agentId,
      venture_id: this.ventureId,
      prediction_type,
      statement,
      confidence,
      timeframe,
      metadata,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('agent_predictions')
      .insert(predictionRecord)
      .select()
      .single();

    if (error) {
      console.warn(`   [TRUTH] Failed to log prediction: ${error.message}`);
      return null;
    }

    console.log(`   [TRUTH] Prediction logged: ${prediction_type} (${(confidence * 100).toFixed(0)}% confidence)`);
    return data;
  }

  /**
   * Log an outcome for a previous prediction
   * SOVEREIGN SEAL v2.9.0: Outcomes enable calibration
   *
   * @param {string} predictionId - ID of the prediction being validated
   * @param {Object} outcome - Outcome details
   * @param {boolean} outcome.was_correct - Did the prediction come true?
   * @param {number} outcome.actual_value - Actual measured value (if applicable)
   * @param {string} outcome.evidence - Evidence for the outcome
   * @param {Object} outcome.metadata - Additional context
   * @returns {Promise<Object>} Updated prediction with outcome
   */
  async logOutcome(predictionId, outcome) {
    const { was_correct, actual_value, evidence, metadata = {} } = outcome;

    // Fetch original prediction
    const { data: prediction, error: fetchError } = await this.supabase
      .from('agent_predictions')
      .select('*')
      .eq('id', predictionId)
      .single();

    if (fetchError || !prediction) {
      throw new Error(`Prediction not found: ${predictionId}`);
    }

    // Compute calibration delta
    const calibrationDelta = this._computeCalibrationDelta(
      prediction.confidence,
      was_correct
    );

    const outcomeRecord = {
      status: 'resolved',
      was_correct,
      actual_value,
      evidence,
      outcome_metadata: metadata,
      calibration_delta: calibrationDelta,
      resolved_at: new Date().toISOString()
    };

    const { data, error } = await this.supabase
      .from('agent_predictions')
      .update(outcomeRecord)
      .eq('id', predictionId)
      .select()
      .single();

    if (error) {
      console.warn(`   [TRUTH] Failed to log outcome: ${error.message}`);
      return null;
    }

    console.log(`   [TRUTH] Outcome logged: ${was_correct ? 'CORRECT' : 'INCORRECT'} (delta: ${calibrationDelta.toFixed(3)})`);
    return data;
  }

  /**
   * Compute calibration delta (Brier-style scoring)
   * Perfect calibration: confidence = actual frequency
   * @private
   */
  _computeCalibrationDelta(confidence, wasCorrect) {
    // Brier score component: (confidence - actual)^2
    // actual = 1 if correct, 0 if incorrect
    const actual = wasCorrect ? 1 : 0;
    return Math.pow(confidence - actual, 2);
  }

  /**
   * Compute overall calibration accuracy for agent
   * Returns calibration metrics over specified period
   *
   * @param {string} period - 'week', 'month', 'quarter', 'all'
   * @returns {Promise<Object>} Calibration metrics
   */
  async computeCalibration(period = 'month') {
    // Determine date range
    const now = new Date();
    let startDate;
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0);
    }

    // Fetch resolved predictions
    const { data: predictions, error } = await this.supabase
      .from('agent_predictions')
      .select('confidence, was_correct, calibration_delta, prediction_type')
      .eq('agent_id', this.agentId)
      .eq('status', 'resolved')
      .gte('resolved_at', startDate.toISOString());

    if (error || !predictions || predictions.length === 0) {
      return {
        period,
        total_predictions: 0,
        accuracy: null,
        brier_score: null,
        calibration_error: null,
        by_type: {}
      };
    }

    // Compute overall metrics
    const totalCorrect = predictions.filter(p => p.was_correct).length;
    const accuracy = totalCorrect / predictions.length;
    const brierScore = predictions.reduce((sum, p) => sum + p.calibration_delta, 0) / predictions.length;

    // Compute calibration error (deviation from perfect calibration)
    const calibrationError = this._computeCalibrationError(predictions);

    // Compute by prediction type
    const byType = {};
    const types = [...new Set(predictions.map(p => p.prediction_type))];
    for (const type of types) {
      const typePredictions = predictions.filter(p => p.prediction_type === type);
      const typeCorrect = typePredictions.filter(p => p.was_correct).length;
      byType[type] = {
        total: typePredictions.length,
        correct: typeCorrect,
        accuracy: typeCorrect / typePredictions.length
      };
    }

    return {
      period,
      total_predictions: predictions.length,
      accuracy,
      brier_score: brierScore,
      calibration_error: calibrationError,
      by_type: byType
    };
  }

  /**
   * Compute calibration error across confidence buckets
   * @private
   */
  _computeCalibrationError(predictions) {
    // Bucket predictions by confidence level (0-10%, 10-20%, etc.)
    const buckets = {};
    for (let i = 0; i < 10; i++) {
      buckets[i] = { predictions: [], correct: 0 };
    }

    for (const pred of predictions) {
      const bucketIndex = Math.min(Math.floor(pred.confidence * 10), 9);
      buckets[bucketIndex].predictions.push(pred);
      if (pred.was_correct) {
        buckets[bucketIndex].correct++;
      }
    }

    // Compute weighted calibration error
    let totalError = 0;
    let totalWeight = 0;
    for (let i = 0; i < 10; i++) {
      const bucket = buckets[i];
      if (bucket.predictions.length > 0) {
        const expectedAccuracy = (i + 0.5) / 10; // Midpoint of bucket
        const actualAccuracy = bucket.correct / bucket.predictions.length;
        totalError += bucket.predictions.length * Math.abs(expectedAccuracy - actualAccuracy);
        totalWeight += bucket.predictions.length;
      }
    }

    return totalWeight > 0 ? totalError / totalWeight : 0;
  }

  /**
   * Apply vertical normalization for market accuracy
   * Adjusts for industry-specific baseline accuracy
   * @private
   */
  _applyVerticalNormalization(rawAccuracy, vertical) {
    const verticalBaselines = {
      saas: 0.65,
      marketplace: 0.55,
      fintech: 0.60,
      healthcare: 0.50,
      default: 0.60
    };

    const baseline = verticalBaselines[vertical] || verticalBaselines.default;
    // Normalize: (raw - baseline) / (1 - baseline) maps baseline->0, 1->1
    return Math.max(0, (rawAccuracy - baseline) / (1 - baseline));
  }

  /**
   * Compute market-specific accuracy metrics
   */
  async computeMarketAccuracy(marketVertical = 'default') {
    const calibration = await this.computeCalibration('quarter');

    if (calibration.accuracy === null) {
      return { normalized_accuracy: null, raw_accuracy: null };
    }

    const normalizedAccuracy = this._applyVerticalNormalization(
      calibration.accuracy,
      marketVertical
    );

    return {
      normalized_accuracy: normalizedAccuracy,
      raw_accuracy: calibration.accuracy,
      vertical: marketVertical,
      sample_size: calibration.total_predictions
    };
  }

  /**
   * Compute KPI-specific accuracy
   */
  async computeKpiAccuracy(kpiType) {
    const { data: predictions, error } = await this.supabase
      .from('agent_predictions')
      .select('confidence, was_correct, actual_value, metadata')
      .eq('agent_id', this.agentId)
      .eq('status', 'resolved')
      .eq('prediction_type', kpiType);

    if (error || !predictions || predictions.length === 0) {
      return { accuracy: null, mae: null, sample_size: 0 };
    }

    const correct = predictions.filter(p => p.was_correct).length;

    // Mean Absolute Error for numeric predictions
    const numericPredictions = predictions.filter(p =>
      p.metadata?.predicted_value !== undefined && p.actual_value !== undefined
    );

    let mae = null;
    if (numericPredictions.length > 0) {
      const totalError = numericPredictions.reduce((sum, p) =>
        sum + Math.abs(p.metadata.predicted_value - p.actual_value), 0
      );
      mae = totalError / numericPredictions.length;
    }

    return {
      accuracy: correct / predictions.length,
      mae,
      sample_size: predictions.length,
      kpi_type: kpiType
    };
  }

  /**
   * Validate business hypothesis against schema
   * SOVEREIGN SEAL v2.9.0: All hypotheses must be validated
   *
   * @param {Object} hypothesis - Hypothesis to validate
   * @throws {BusinessHypothesisValidationError} If validation fails
   */
  validateBusinessHypothesis(hypothesis) {
    const errors = [];

    // Check required fields
    for (const field of BUSINESS_HYPOTHESIS_SCHEMA.required) {
      if (hypothesis[field] === undefined || hypothesis[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Check types
    if (hypothesis.hypothesis_type &&
        !BUSINESS_HYPOTHESIS_SCHEMA.types.hypothesis_type.includes(hypothesis.hypothesis_type)) {
      errors.push(`Invalid hypothesis_type: ${hypothesis.hypothesis_type}. Must be one of: ${BUSINESS_HYPOTHESIS_SCHEMA.types.hypothesis_type.join(', ')}`);
    }

    if (hypothesis.confidence_level !== undefined) {
      if (typeof hypothesis.confidence_level !== 'number' ||
          hypothesis.confidence_level < 0 ||
          hypothesis.confidence_level > 1) {
        errors.push('confidence_level must be a number between 0.0 and 1.0');
      }
    }

    if (hypothesis.evidence_basis !== undefined && !Array.isArray(hypothesis.evidence_basis)) {
      errors.push('evidence_basis must be an array');
    }

    if (errors.length > 0) {
      throw new BusinessHypothesisValidationError(
        `Hypothesis validation failed: ${errors.join('; ')}`,
        errors
      );
    }

    return true;
  }
}

// Export for direct function usage
export async function logPrediction(supabase, agentId, ventureId, prediction) {
  const layer = new TruthLayer(supabase, agentId, ventureId);
  return layer.logPrediction(prediction);
}

export async function logOutcome(supabase, agentId, ventureId, predictionId, outcome) {
  const layer = new TruthLayer(supabase, agentId, ventureId);
  return layer.logOutcome(predictionId, outcome);
}
