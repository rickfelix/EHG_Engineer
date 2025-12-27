/**
 * LEO Protocol v4.1 Progress Calculator
 * Deterministic progress calculation - Single source of truth
 *
 * Refactored as part of SD-REFACTOR-2025-001-P1-003
 * Phase calculation logic extracted to phase-calculators.js
 *
 * @module ProgressCalculator
 * @version 2.0.0
 */

import {
  PHASE_WEIGHTS,
  PHASE_ORDER,
  calculateLeadPlanningProgress,
  getLeadPlanningDetails,
  calculatePlanDesignProgress,
  getPlanDesignDetails,
  calculateExecImplementationProgress,
  getExecImplementationDetails,
  calculatePlanVerificationProgress,
  getPlanVerificationDetails,
  calculateLeadApprovalProgress,
  getLeadApprovalDetails,
  determineCurrentPhase,
  getPhaseDisplayName,
  calculateAllPhases,
  getAllPhaseDetails
} from './phase-calculators.js';

// Re-export constants for backward compatibility
export { PHASE_WEIGHTS, PHASE_ORDER };

class ProgressCalculator {
  constructor() {
    // Use imported constants
    this.PHASE_WEIGHTS = PHASE_WEIGHTS;
    this.PHASE_ORDER = PHASE_ORDER;
  }

  /**
   * Calculate SD progress using deterministic LEO Protocol v4.1 rules
   * This is the SINGLE SOURCE OF TRUTH for progress calculation
   */
  calculateSDProgress(sd, prd) {
    // SPECIAL CASE: Completed SDs - respect database progress field
    if (sd?.status?.toLowerCase() === 'completed' || sd?.current_phase === 'COMPLETE') {
      return {
        phases: {
          LEAD_PLANNING: 100,
          PLAN_DESIGN: 100,
          EXEC_IMPLEMENTATION: 100,
          PLAN_VERIFICATION: 100,
          LEAD_APPROVAL: 100
        },
        total: sd?.progress || 100,
        currentPhase: sd?.current_phase || 'COMPLETE',
        details: {
          completed: true,
          reason: 'SD marked as completed in database'
        }
      };
    }

    // SPECIAL CASE: Archived SDs with 100% manual completion
    if (sd?.status?.toLowerCase() === 'archived' && sd?.metadata?.completion_percentage === 100) {
      return {
        phases: {
          LEAD_PLANNING: 100,
          PLAN_DESIGN: 100,
          EXEC_IMPLEMENTATION: 100,
          PLAN_VERIFICATION: 100,
          LEAD_APPROVAL: 100
        },
        total: 100,
        currentPhase: 'COMPLETE',
        details: {
          manualCompletion: true,
          reason: 'Archived SD with manual 100% completion (metadata override)'
        }
      };
    }

    // Calculate all phases using extracted module
    const phases = calculateAllPhases(sd, prd);
    const details = getAllPhaseDetails(sd, prd);

    // Calculate total progress using official weights
    const total = Math.round(
      (phases.LEAD_PLANNING * this.PHASE_WEIGHTS.LEAD_PLANNING / 100) +
      (phases.PLAN_DESIGN * this.PHASE_WEIGHTS.PLAN_DESIGN / 100) +
      (phases.EXEC_IMPLEMENTATION * this.PHASE_WEIGHTS.EXEC_IMPLEMENTATION / 100) +
      (phases.PLAN_VERIFICATION * this.PHASE_WEIGHTS.PLAN_VERIFICATION / 100) +
      (phases.LEAD_APPROVAL * this.PHASE_WEIGHTS.LEAD_APPROVAL / 100)
    );

    // Determine current phase
    const currentPhase = determineCurrentPhase(phases);

    return {
      phases,
      total,
      currentPhase,
      details
    };
  }

  // ===========================================================================
  // DELEGATED METHODS: For backward compatibility
  // ===========================================================================

  calculateLeadPlanningProgress(sd) {
    return calculateLeadPlanningProgress(sd);
  }

  getLeadPlanningDetails(sd) {
    return getLeadPlanningDetails(sd);
  }

  calculatePlanDesignProgress(prd) {
    return calculatePlanDesignProgress(prd);
  }

  getPlanDesignDetails(prd) {
    return getPlanDesignDetails(prd);
  }

  calculateExecImplementationProgress(prd) {
    return calculateExecImplementationProgress(prd);
  }

  getExecImplementationDetails(prd) {
    return getExecImplementationDetails(prd);
  }

  calculatePlanVerificationProgress(prd) {
    return calculatePlanVerificationProgress(prd);
  }

  getPlanVerificationDetails(prd) {
    return getPlanVerificationDetails(prd);
  }

  calculateLeadApprovalProgress(prd) {
    return calculateLeadApprovalProgress(prd);
  }

  getLeadApprovalDetails(prd) {
    return getLeadApprovalDetails(prd);
  }

  determineCurrentPhase(phases) {
    return determineCurrentPhase(phases);
  }

  getPhaseDisplayName(phase) {
    return getPhaseDisplayName(phase);
  }

  /**
   * Get progress summary for dashboard
   */
  getProgressSummary(sd, prd) {
    const progress = this.calculateSDProgress(sd, prd);

    return {
      total: progress.total,
      currentPhase: progress.currentPhase,
      currentPhaseDisplay: getPhaseDisplayName(progress.currentPhase),
      phases: Object.entries(progress.phases).map(([phase, percentage]) => ({
        phase,
        phaseDisplay: getPhaseDisplayName(phase),
        percentage,
        weight: this.PHASE_WEIGHTS[phase],
        isComplete: percentage === 100,
        isCurrent: phase === progress.currentPhase
      })),
      details: progress.details
    };
  }

  /**
   * Calculate system-wide progress (all SDs)
   */
  calculateSystemProgress(allSDs, allPRDs) {
    if (!allSDs || allSDs.length === 0) return { average: 0, breakdown: {} };

    const prdMap = {};
    if (allPRDs) {
      allPRDs.forEach(prd => {
        prdMap[prd.directive_id] = prd;
      });
    }

    let totalProgress = 0;
    const breakdown = {
      byPhase: {},
      bySD: []
    };

    allSDs.forEach(sd => {
      const prd = prdMap[sd.id];
      const progress = this.calculateSDProgress(sd, prd);

      totalProgress += progress.total;
      breakdown.bySD.push({
        id: sd.id,
        title: sd.title,
        progress: progress.total,
        currentPhase: progress.currentPhase
      });

      // Aggregate by phase
      Object.entries(progress.phases).forEach(([phase, percentage]) => {
        if (!breakdown.byPhase[phase]) {
          breakdown.byPhase[phase] = { total: 0, count: 0, average: 0 };
        }
        breakdown.byPhase[phase].total += percentage;
        breakdown.byPhase[phase].count += 1;
      });
    });

    // Calculate phase averages
    Object.keys(breakdown.byPhase).forEach(phase => {
      const phaseData = breakdown.byPhase[phase];
      phaseData.average = Math.round(phaseData.total / phaseData.count);
    });

    return {
      average: Math.round(totalProgress / allSDs.length),
      breakdown
    };
  }
}

export default ProgressCalculator;

// Also export extracted module for direct access
export * from './phase-calculators.js';
