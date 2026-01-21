/**
 * Golden Nugget Validator - Exit Gate Validation Module
 *
 * Validates exit gate requirements.
 * SD-HARDENING-V2-004: Gates fail safe - if we can't validate, we BLOCK
 *
 * @module lib/agents/modules/golden-nugget-validator/exit-gate-validation
 */

/**
 * Validate exit gate requirements
 * SD-HARDENING-V2-004: Gates fail safe - if we can't validate, we BLOCK
 *
 * @param {string} gateDescription - Exit gate requirement
 * @param {Array} artifacts - Available artifacts
 * @param {Object} ventureContext - Optional venture data for DB-level checks
 * @returns {Object} {passed, reason}
 */
export function validateExitGate(gateDescription, artifacts, ventureContext = null) {
  // Check for completion-type gates
  if (/complete|done|finished/i.test(gateDescription)) {
    if (artifacts.length === 0) {
      return {
        passed: false,
        reason: 'No artifacts provided to satisfy completion gate'
      };
    }
    return {
      passed: true,
      reason: 'Completion gate satisfied (artifacts present)'
    };
  }

  // Check for title validation gates
  if (/title.*validated|validated.*title/i.test(gateDescription)) {
    const charMatch = gateDescription.match(/\((\d+)-(\d+)\s*chars?\)/i);
    if (charMatch) {
      const minChars = parseInt(charMatch[1]);
      const maxChars = parseInt(charMatch[2]);
      const titleArtifact = artifacts.find(a => a.metadata?.title);
      if (!titleArtifact || !titleArtifact.metadata?.title) {
        return {
          passed: false,
          reason: 'Title validation failed: No artifact with title metadata'
        };
      }
      const titleLength = titleArtifact.metadata.title.length;
      if (titleLength < minChars || titleLength > maxChars) {
        return {
          passed: false,
          reason: `Title length ${titleLength} not in range ${minChars}-${maxChars}`
        };
      }
      return {
        passed: true,
        reason: `Title validated (${titleLength} chars)`
      };
    }
  }

  // Check for score gates (e.g., "Validation score >= 6")
  if (/score\s*>=?\s*(\d+)/i.test(gateDescription)) {
    const scoreMatch = gateDescription.match(/score\s*>=?\s*(\d+)/i);
    const requiredScore = parseInt(scoreMatch[1]);
    const scoredArtifact = artifacts.find(a =>
      a.metadata?.score !== undefined || a.metadata?.validation_score !== undefined
    );
    if (!scoredArtifact) {
      return {
        passed: false,
        reason: 'Score gate failed: No artifact with score metadata'
      };
    }
    const actualScore = scoredArtifact.metadata.score ?? scoredArtifact.metadata.validation_score;
    if (actualScore < requiredScore) {
      return {
        passed: false,
        reason: `Score ${actualScore} below required ${requiredScore}`
      };
    }
    return {
      passed: true,
      reason: `Score gate satisfied (${actualScore} >= ${requiredScore})`
    };
  }

  // Check for problem_statement population gate (requires ventureContext)
  if (/problem_statement.*populated|populated.*problem_statement/i.test(gateDescription)) {
    if (!ventureContext) {
      return {
        passed: false,
        reason: 'problem_statement population gate requires venture context to validate'
      };
    }

    if (!ventureContext.problem_statement || ventureContext.problem_statement.trim().length === 0) {
      return {
        passed: false,
        reason: 'problem_statement is empty or not populated - Chairman vision not captured'
      };
    }

    return {
      passed: true,
      reason: `problem_statement populated (${ventureContext.problem_statement.length} chars)`
    };
  }

  // Check for Chairman intent capture gate (requires ventureContext)
  if (/chairman.*intent.*captured|immutable.*vision|raw.*intent/i.test(gateDescription)) {
    if (!ventureContext) {
      return {
        passed: false,
        reason: 'Chairman intent gate requires venture context to validate'
      };
    }

    if (!ventureContext.raw_chairman_intent || ventureContext.raw_chairman_intent.trim().length === 0) {
      return {
        passed: false,
        reason: 'raw_chairman_intent not captured - Chairman vision not locked'
      };
    }

    return {
      passed: true,
      reason: `Chairman intent captured and locked (${ventureContext.raw_chairman_intent.length} chars)`
    };
  }

  // Check for category assignment gate
  if (/category.*assigned|assigned.*category/i.test(gateDescription)) {
    const categoryArtifact = artifacts.find(a => a.metadata?.category);
    if (!categoryArtifact || !categoryArtifact.metadata?.category) {
      return {
        passed: false,
        reason: 'Category assignment failed: No artifact with category metadata'
      };
    }
    return {
      passed: true,
      reason: `Category assigned: ${categoryArtifact.metadata.category}`
    };
  }

  // SD-HARDENING-V2-004: FAIL SAFE - Unknown gates are BLOCKED
  return {
    passed: false,
    reason: `Gate validation not implemented for: "${gateDescription}" - requires manual verification or gate parser extension`
  };
}
