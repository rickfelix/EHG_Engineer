/**
 * Validation Gate Enforcer
 * Ensures all validation gates are passed before SD creation
 * Mandatory gates - no bypassing allowed in MVP+
 */

class ValidationGateEnforcer {
  constructor() {
    // Define all 6 mandatory validation gates
    this.gates = {
      1: {
        name: 'Input Provided',
        field: 'chairman_input',
        check: (submission) => {
          return submission.chairman_input && 
                 submission.chairman_input.trim().length > 0;
        },
        error: 'Feedback text is required to proceed',
        required: true
      },
      2: {
        name: 'Intent Confirmed',
        field: 'intent_confirmed',
        check: (submission) => {
          return submission.intent_confirmed === true &&
                 submission.intent_summary && 
                 submission.intent_summary.length > 0;
        },
        error: 'Please confirm or adjust the intent summary before proceeding',
        required: true
      },
      3: {
        name: 'Classification Reviewed',
        field: 'strat_tac_reviewed',
        check: (submission) => {
          return submission.strat_tac_reviewed === true &&
                 submission.strat_tac_final !== null;
        },
        error: 'Please review the strategic/tactical classification',
        required: true
      },
      4: {
        name: 'Impact Analysis Reviewed',
        field: 'impact_analysis_reviewed',
        check: (submission) => {
          return submission.impact_analysis_reviewed === true ||
                 submission.consistency_validation_acknowledged === true;
        },
        error: 'Please review the impact analysis and consistency validation',
        required: true
      },
      5: {
        name: 'Synthesis Reviewed',
        field: 'synthesis_reviewed',
        check: (submission) => {
          return submission.synthesis_reviewed === true &&
                 submission.synthesis !== null;
        },
        error: 'Please review all synthesis items and their policy badges',
        required: true
      },
      6: {
        name: 'Questions Answered',
        field: 'questions_answered',
        check: (submission) => {
          // All questions must be answered if any exist
          if (!submission.clarifying_questions || 
              submission.clarifying_questions.length === 0) {
            return true; // No questions to answer
          }
          
          return submission.questions_answered === true &&
                 submission.question_answers &&
                 Object.keys(submission.question_answers).length === 
                 submission.clarifying_questions.length;
        },
        error: 'Please answer all clarifying questions',
        required: true
      },
      7: {
        name: 'Summary Confirmed',
        field: 'summary_confirmed',
        check: (submission) => {
          return submission.summary_confirmed === true &&
                 submission.client_summary &&
                 submission.client_summary.length > 0;
        },
        error: 'Please confirm the client-ready summary',
        required: true
      }
    };
  }

  /**
   * Validate a specific gate
   * @param {number} step - Step number (1-6)
   * @param {object} submission - Submission data
   * @returns {object} Validation result
   */
  validateGate(step, submission) {
    const gate = this.gates[step];
    
    if (!gate) {
      return {
        passed: false,
        error: `Invalid step number: ${step}`,
        step
      };
    }

    const passed = gate.check(submission);
    
    return {
      passed,
      step,
      gate_name: gate.name,
      error: passed ? null : gate.error,
      field: gate.field,
      required: gate.required
    };
  }

  /**
   * Validate all gates
   * @param {object} submission - Submission data
   * @returns {object} Complete validation status
   */
  validateAllGates(submission) {
    const results = [];
    let allPassed = true;
    const missingGates = [];

    // Check each gate
    for (let step = 1; step <= 7; step++) {
      const result = this.validateGate(step, submission);
      results.push(result);
      
      if (!result.passed) {
        allPassed = false;
        missingGates.push({
          step,
          name: result.gate_name,
          error: result.error
        });
      }
    }

    return {
      all_passed: allPassed,
      can_create_sd: allPassed,
      results,
      missing_gates: missingGates,
      completed_gates: results.filter(r => r.passed).length,
      total_gates: 7,
      completion_percentage: Math.round((results.filter(r => r.passed).length / 7) * 100)
    };
  }

  /**
   * Get current step based on validation status
   * @param {object} submission - Submission data
   * @returns {number} Current step (1-7)
   */
  getCurrentStep(submission) {
    // Find the first gate that hasn't been passed
    for (let step = 1; step <= 7; step++) {
      const result = this.validateGate(step, submission);
      if (!result.passed) {
        return step;
      }
    }
    
    // All gates passed
    return 8; // Ready for SD creation
  }

  /**
   * Update gate status in submission
   * @param {object} submission - Submission data
   * @param {number} step - Step completed
   * @returns {object} Updated gate status
   */
  updateGateStatus(submission, step) {
    if (!submission.gate_status) {
      submission.gate_status = {
        step1: false,
        step2: false,
        step3: false,
        step4: false,
        step5: false,
        step6: false,
        step7: false
      };
    }

    const result = this.validateGate(step, submission);
    submission.gate_status[`step${step}`] = result.passed;
    
    // Update current step
    submission.current_step = this.getCurrentStep(submission);
    
    // Check if all gates passed
    const validation = this.validateAllGates(submission);
    submission.all_gates_passed = validation.all_passed;
    submission.validation_complete = validation.all_passed;
    
    if (validation.all_passed) {
      submission.completed_at = new Date().toISOString();
    }
    
    return submission.gate_status;
  }

  /**
   * Can proceed to next step?
   * @param {object} submission - Submission data
   * @param {number} currentStep - Current step
   * @returns {object} Can proceed status
   */
  canProceedToNext(submission, currentStep) {
    const currentGate = this.validateGate(currentStep, submission);
    
    if (!currentGate.passed) {
      return {
        can_proceed: false,
        reason: currentGate.error,
        current_step: currentStep
      };
    }
    
    return {
      can_proceed: true,
      next_step: currentStep + 1,
      current_step: currentStep
    };
  }

  /**
   * Get progress summary
   * @param {object} submission - Submission data
   * @returns {object} Progress information
   */
  getProgressSummary(submission) {
    const validation = this.validateAllGates(submission);
    
    const steps = [];
    for (let step = 1; step <= 7; step++) {
      const gate = this.gates[step];
      const result = this.validateGate(step, submission);
      
      steps.push({
        step,
        name: gate.name,
        completed: result.passed,
        error: result.error,
        field: gate.field
      });
    }
    
    return {
      current_step: this.getCurrentStep(submission),
      completed_steps: validation.completed_gates,
      total_steps: 7,
      percentage: validation.completion_percentage,
      can_create_sd: validation.all_passed,
      steps
    };
  }

  /**
   * Enforce gate before allowing action
   * @param {number} step - Step to enforce
   * @param {object} submission - Submission data
   * @throws {ValidationError} If gate not passed
   */
  enforceGate(step, submission) {
    const result = this.validateGate(step, submission);
    
    if (!result.passed) {
      const error = new Error(result.error);
      error.name = 'ValidationError';
      error.step = step;
      error.gate_name = result.gate_name;
      throw error;
    }
    
    return true;
  }

  /**
   * Enforce all gates before SD creation
   * @param {object} submission - Submission data
   * @throws {ValidationError} If any gate not passed
   */
  enforceAllGatesForSD(submission) {
    const validation = this.validateAllGates(submission);
    
    if (!validation.all_passed) {
      const missingNames = validation.missing_gates
        .map(g => g.name)
        .join(', ');
      
      const error = new Error(
        `Cannot create Strategic Directive. Missing gates: ${missingNames}`
      );
      error.name = 'ValidationError';
      error.missing_gates = validation.missing_gates;
      error.completion_percentage = validation.completion_percentage;
      throw error;
    }
    
    return true;
  }

  /**
   * Get validation message for UI
   * @param {object} submission - Submission data
   * @param {number} step - Current step
   * @returns {object} UI message
   */
  getValidationMessage(submission, step) {
    const result = this.validateGate(step, submission);
    
    if (result.passed) {
      return {
        type: 'success',
        message: `✓ ${result.gate_name} completed`,
        icon: '✓',
        color: 'green'
      };
    } else {
      return {
        type: 'warning',
        message: result.error,
        icon: '⚠',
        color: 'orange',
        action_required: true
      };
    }
  }

  /**
   * Get next required action
   * @param {object} submission - Submission data
   * @returns {object} Next action information
   */
  getNextRequiredAction(submission) {
    const currentStep = this.getCurrentStep(submission);
    
    if (currentStep > 7) {
      return {
        action: 'create_sd',
        message: 'All validation complete. Ready to create Strategic Directive.',
        step: null
      };
    }
    
    const gate = this.gates[currentStep];
    return {
      action: 'complete_step',
      message: gate.error,
      step: currentStep,
      gate_name: gate.name,
      field: gate.field
    };
  }
}

module.exports = ValidationGateEnforcer;