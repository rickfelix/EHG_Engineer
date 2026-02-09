/**
 * Gate L - SD Creation Validators (LEAD pre-approval)
 * Part of SD-LEO-REFACTOR-VALIDATOR-REG-001
 */

/**
 * Register Gate L validators
 * @param {import('../core.js').ValidatorRegistry} registry
 */
export function registerGateLValidators(registry) {
  registry.register('sdExistenceCheck', async (context) => {
    const { sd } = context;
    if (!sd || !sd.id) {
      return { passed: false, score: 0, max_score: 100, issues: ['SD does not exist'] };
    }
    if (sd.status === 'archived') {
      return { passed: false, score: 0, max_score: 100, issues: ['SD is archived'] };
    }
    return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
  }, 'Verify SD exists and is active');

  registry.register('sdObjectivesDefined', async (context) => {
    const { sd } = context;
    const objectives = sd?.strategic_objectives || [];
    const issues = [];
    let score = 0;

    if (objectives.length >= 2) {
      score += 70;
    } else if (objectives.length === 1) {
      score += 35;
      issues.push('SD should have at least 2 strategic objectives');
    } else {
      issues.push('SD has no strategic objectives defined');
    }

    if (sd?.success_metrics && sd.success_metrics.length > 0) {
      score += 30;
    } else {
      issues.push('SD should have success metrics defined');
    }

    return { passed: issues.length === 0, score, max_score: 100, issues };
  }, 'Verify SD has strategic objectives and success metrics');

  registry.register('sdPrioritySet', async (context) => {
    const { sd } = context;
    const validPriorities = ['critical', 'high', 'medium', 'low'];
    const priority = sd?.priority?.toLowerCase();

    if (!priority) {
      return { passed: false, score: 0, max_score: 100, issues: ['SD priority not set'] };
    }
    if (!validPriorities.includes(priority)) {
      return { passed: false, score: 0, max_score: 100, issues: [`Invalid priority: ${sd.priority}. Valid values: ${validPriorities.join(', ')}`] };
    }
    return { passed: true, score: 100, max_score: 100, issues: [], warnings: [] };
  }, 'Verify SD priority is set to valid value');

  registry.register('sdSuccessCriteria', async (context) => {
    const { sd } = context;
    const metrics = sd?.success_metrics || [];
    const criteria = sd?.success_criteria || [];
    const totalItems = metrics.length + criteria.length;

    if (totalItems >= 3) {
      return { passed: true, score: 100, max_score: 100, issues: [] };
    } else if (totalItems > 0) {
      // 1-2 items: score 80 (soft warning, not a threshold-breaker)
      return { passed: true, score: 80, max_score: 100, issues: [], warnings: [`SD has ${totalItems} success criteria/metrics, 3+ recommended`] };
    }
    return { passed: false, score: 0, max_score: 100, issues: ['No success metrics or criteria defined'] };
  }, 'Verify SD has measurable success criteria');

  registry.register('sdRisksIdentified', async (context) => {
    const { sd } = context;
    // Risks array can be empty for low-risk SDs
    const risks = sd?.risks || [];
    if (risks.length === 0 && sd?.priority === 'high') {
      return { passed: true, score: 80, max_score: 100, warnings: ['High-priority SD has no risks identified'] };
    }
    return { passed: true, score: 100, max_score: 100, issues: [] };
  }, 'Verify risks are identified (optional for low-risk SDs)');

  // SD-LEO-001: SD Type Validation
  registry.register('sdTypeValidation', async (context) => {
    const { sd } = context;
    if (!sd) {
      return { passed: false, score: 0, max_score: 100, issues: ['No SD provided'] };
    }

    // Dynamic import to avoid circular dependencies
    const { detectSDType } = await import('../../../../lib/utils/sd-type-detection.js');
    const detection = detectSDType(sd);

    const currentType = (sd.sd_type || '').toLowerCase();
    const detectedType = (detection.type || '').toLowerCase();

    // If no type set, warn but don't fail
    if (!currentType) {
      return {
        passed: true,
        score: 70,
        max_score: 100,
        issues: [],
        warnings: [`SD type not set. Detection suggests: ${detection.type} (${detection.confidence}% confidence)`]
      };
    }

    // Check for mismatch
    if (currentType !== detectedType) {
      // High confidence detection should be a warning
      if (detection.confidence >= 70) {
        return {
          passed: true,
          score: 80,
          max_score: 100,
          issues: [],
          warnings: [
            `SD type mismatch: set as '${currentType}' but detection suggests '${detection.type}' (${detection.confidence}% confidence)`,
            `Reason: ${detection.reason}`
          ]
        };
      }
    }

    return {
      passed: true,
      score: 100,
      max_score: 100,
      issues: [],
      warnings: []
    };
  }, 'SD-LEO-001: Validate SD type matches content-based detection');
}
