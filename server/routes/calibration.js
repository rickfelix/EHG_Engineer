/**
 * Calibration API Routes
 * SOVEREIGN PIPE v3.7.0: Calibration and Error Handling
 * Extracted from server.js for modularity
 * SD-LEO-REFACTOR-SERVER-001
 */

import { Router } from 'express';
import { getCalibrationService } from '../../src/services/CalibrationService.js';
import { asyncHandler } from '../../lib/middleware/eva-error-handler.js';
import { requireVentureScope, requireChairmanForGlobal } from '../../src/middleware/venture-scope.js';
import { dashboardState } from '../state.js';

const router = Router();

/**
 * GET /api/calibration/venture/:venture_id
 * Get calibration score for a specific venture
 */
router.get('/venture/:venture_id', requireVentureScope, asyncHandler(async (req, res) => {
  const calibrationService = getCalibrationService();
  const result = await calibrationService.getVentureCalibration(req.venture_id);

  if (!result.success) {
    return res.status(404).json({
      alert: 'Venture calibration not found',
      severity: 'MEDIUM',
      category: 'CALIBRATION',
      error: result.error
    });
  }

  res.json(result);
}));

/**
 * GET /api/calibration/threshold/:sd_id
 * Get adaptive threshold for a strategic directive
 */
router.get('/threshold/:sd_id', asyncHandler(async (req, res) => {
  const { sd_id } = req.params;
  const { gate_number = 1 } = req.query;

  // Get SD from state
  const sd = dashboardState.strategicDirectives.find(s => s.id === sd_id);
  if (!sd) {
    return res.status(404).json({
      alert: 'Strategic directive not found',
      severity: 'MEDIUM',
      category: 'VALIDATION'
    });
  }

  const calibrationService = getCalibrationService();
  const result = calibrationService.calculateAdaptiveThreshold({
    sd,
    priorGateScores: [],
    patternStats: null,
    gateNumber: parseInt(gate_number)
  });

  res.json({
    sd_id,
    gate_number: parseInt(gate_number),
    threshold: result.finalThreshold,
    breakdown: result.breakdown,
    reasoning: result.reasoning
  });
}));

/**
 * POST /api/calibration/compute
 * Compute 60/40 Truth Delta
 */
router.post('/compute', asyncHandler(async (req, res) => {
  const { business_accuracy, technical_accuracy, vertical } = req.body;

  if (business_accuracy === undefined || technical_accuracy === undefined) {
    return res.status(400).json({
      alert: 'Missing required fields',
      severity: 'MEDIUM',
      category: 'VALIDATION',
      diagnosis: ['Provide business_accuracy (0-1)', 'Provide technical_accuracy (0-1)']
    });
  }

  const calibrationService = getCalibrationService();

  // Compute 60/40 Truth Delta
  const truthDelta = calibrationService.computeTruthDelta(
    parseFloat(business_accuracy),
    parseFloat(technical_accuracy)
  );

  // Optionally normalize by vertical
  let normalized = null;
  if (vertical) {
    normalized = await calibrationService.normalizeCalibrationDelta(
      truthDelta.truth_delta,
      vertical
    );
  }

  res.json({
    truth_delta: truthDelta,
    normalized: normalized
  });
}));

/**
 * GET /api/calibration/portfolio
 * Calibrate entire portfolio (Chairman only)
 */
router.get('/portfolio', requireChairmanForGlobal, asyncHandler(async (req, res) => {
  const calibrationService = getCalibrationService();
  const result = await calibrationService.calibratePortfolio();

  if (!result.success) {
    return res.status(500).json({
      alert: 'Portfolio calibration failed',
      severity: 'HIGH',
      category: 'CALIBRATION',
      error: result.error
    });
  }

  res.json(result);
}));

export default router;
