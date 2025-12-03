/**
 * USER STORY QUALITY VALIDATION MODULE
 *
 * Validates user story quality during PLAN→EXEC handoff to ensure
 * stories are implementation-ready and not boilerplate.
 *
 * @module user-story-quality-validation
 * @version 1.0.0
 * @see SD-CAPABILITY-LIFECYCLE-001 - Retrospective analysis identified boilerplate patterns
 */

// Known boilerplate patterns to flag
const BOILERPLATE_AC = [
  'implementation verified through unit tests',
  'e2e test validates user-facing behavior',
  'no regressions in related functionality',
  'all acceptance criteria met',
  'code review completed',
  'documentation updated'
];

const BOILERPLATE_TITLES = [
  'implement undefined',
  'implement feature',
  'create component',
  'add functionality'
];

const GENERIC_ROLES = ['user', 'developer', 'admin', 'system'];

const GENERIC_BENEFITS = [
  'improve the system',
  'enhance functionality',
  'better user experience',
  'meet requirements',
  'have this capability'
];

/**
 * Validate a single user story for quality
 * @param {Object} story - User story object from database
 * @returns {Object} { valid: boolean, issues: array, warnings: array, score: number }
 */
export function validateUserStoryQuality(story) {
  const issues = [];  // Blocking issues
  const warnings = [];  // Non-blocking but logged
  let score = 100;

  // === BLOCKING CHECKS (will reject handoff) ===

  // 1. Title check
  if (!story.title || story.title.trim().length < 10) {
    issues.push(`Story ${story.story_key}: Title is empty or too short (<10 chars)`);
    score -= 20;
  } else if (BOILERPLATE_TITLES.some(bp => story.title.toLowerCase().includes(bp))) {
    issues.push(`Story ${story.story_key}: Title contains boilerplate text ("${story.title}")`);
    score -= 15;
  }

  // 2. User want check
  if (!story.user_want || story.user_want.trim().length < 20) {
    issues.push(`Story ${story.story_key}: user_want is empty or too short (<20 chars)`);
    score -= 20;
  } else if (story.user_want.toLowerCase().includes('undefined')) {
    issues.push(`Story ${story.story_key}: user_want contains "undefined"`);
    score -= 20;
  }

  // 3. User benefit check
  if (!story.user_benefit || story.user_benefit.trim().length < 15) {
    issues.push(`Story ${story.story_key}: user_benefit is empty or too short (<15 chars)`);
    score -= 15;
  } else if (GENERIC_BENEFITS.some(gb => story.user_benefit.toLowerCase().includes(gb))) {
    warnings.push(`Story ${story.story_key}: user_benefit is generic ("${story.user_benefit.substring(0, 50)}...")`);
    score -= 5;
  }

  // 4. Acceptance criteria check
  if (!story.acceptance_criteria || story.acceptance_criteria.length === 0) {
    issues.push(`Story ${story.story_key}: No acceptance criteria defined`);
    score -= 25;
  } else if (story.acceptance_criteria.length < 2) {
    issues.push(`Story ${story.story_key}: Insufficient acceptance criteria (${story.acceptance_criteria.length}, need ≥2)`);
    score -= 15;
  } else {
    // Check for boilerplate AC
    const realAC = story.acceptance_criteria.filter(ac => {
      const text = typeof ac === 'string' ? ac : (ac.criterion || ac.text || ac.description || '');
      return !BOILERPLATE_AC.some(bp => text.toLowerCase().includes(bp.toLowerCase()));
    });

    if (realAC.length < 2) {
      issues.push(`Story ${story.story_key}: Only boilerplate acceptance criteria found (${realAC.length} specific, ${story.acceptance_criteria.length - realAC.length} boilerplate)`);
      score -= 20;
    }

    // Check for Given-When-Then format (best practice)
    const hasGWT = story.acceptance_criteria.some(ac => {
      const text = typeof ac === 'string' ? ac : (ac.criterion || ac.text || '');
      return text.toLowerCase().includes('given') &&
             text.toLowerCase().includes('when') &&
             text.toLowerCase().includes('then');
    });

    if (!hasGWT) {
      warnings.push(`Story ${story.story_key}: No Given-When-Then format in acceptance criteria (recommended)`);
      score -= 5;
    }
  }

  // === WARNING CHECKS (logged but don't block) ===

  // 5. User role check
  if (!story.user_role || story.user_role.trim().length === 0) {
    warnings.push(`Story ${story.story_key}: user_role is empty`);
    score -= 5;
  } else if (GENERIC_ROLES.includes(story.user_role.toLowerCase().trim())) {
    warnings.push(`Story ${story.story_key}: Generic user_role "${story.user_role}" - consider more specific persona`);
    score -= 3;
  }

  // 6. Story points check
  if (!story.story_points || story.story_points === 0) {
    warnings.push(`Story ${story.story_key}: No story points assigned`);
    score -= 3;
  }

  // 7. Implementation context check (BMAD enhancement)
  if (!story.implementation_context) {
    warnings.push(`Story ${story.story_key}: Missing implementation_context (BMAD enhancement)`);
    score -= 5;
  } else {
    try {
      const context = typeof story.implementation_context === 'string'
        ? JSON.parse(story.implementation_context)
        : story.implementation_context;

      // Check for minimal context
      if (context.approach === 'See user story details' || !context.approach) {
        warnings.push(`Story ${story.story_key}: implementation_context has placeholder approach`);
        score -= 3;
      }
    } catch (e) {
      // Ignore JSON parse errors
    }
  }

  return {
    story_key: story.story_key,
    valid: issues.length === 0,
    issues,
    warnings,
    score: Math.max(0, score)
  };
}

/**
 * Validate all user stories for an SD
 * @param {Array} stories - Array of user story objects
 * @param {Object} options - Validation options
 * @param {number} options.minimumScore - Minimum average score required (default: 70)
 * @param {number} options.minimumStories - Minimum number of stories required (default: 1)
 * @param {boolean} options.blockOnWarnings - Whether to block on warnings (default: false)
 * @returns {Object} Validation result
 */
export function validateUserStoriesForHandoff(stories, options = {}) {
  const {
    minimumScore = 70,
    minimumStories = 1,
    blockOnWarnings = false
  } = options;

  const result = {
    valid: true,
    totalStories: stories.length,
    validatedStories: 0,
    averageScore: 0,
    minimumScore,
    issues: [],
    warnings: [],
    storyResults: [],
    boilerplateCount: 0,
    qualityDistribution: {
      excellent: 0,  // 90-100
      good: 0,       // 80-89
      acceptable: 0, // 70-79
      poor: 0        // <70
    }
  };

  // Check minimum stories
  if (stories.length < minimumStories) {
    result.valid = false;
    result.issues.push(`Insufficient user stories: ${stories.length}/${minimumStories} required`);
    return result;
  }

  // Validate each story
  let totalScore = 0;

  for (const story of stories) {
    const storyResult = validateUserStoryQuality(story);
    result.storyResults.push(storyResult);
    result.validatedStories++;
    totalScore += storyResult.score;

    // Collect issues and warnings
    result.issues.push(...storyResult.issues);
    result.warnings.push(...storyResult.warnings);

    // Track quality distribution
    if (storyResult.score >= 90) result.qualityDistribution.excellent++;
    else if (storyResult.score >= 80) result.qualityDistribution.good++;
    else if (storyResult.score >= 70) result.qualityDistribution.acceptable++;
    else result.qualityDistribution.poor++;

    // Count boilerplate
    if (storyResult.issues.some(i => i.includes('boilerplate'))) {
      result.boilerplateCount++;
    }
  }

  // Calculate average score
  result.averageScore = Math.round(totalScore / stories.length);

  // Determine overall validity
  if (result.issues.length > 0) {
    result.valid = false;
  }

  if (result.averageScore < minimumScore) {
    result.valid = false;
    result.issues.push(`Average user story quality score (${result.averageScore}%) is below minimum (${minimumScore}%)`);
  }

  if (blockOnWarnings && result.warnings.length > 0) {
    result.valid = false;
  }

  // Generate summary
  result.summary = generateValidationSummary(result);

  return result;
}

/**
 * Generate human-readable validation summary
 */
function generateValidationSummary(result) {
  const lines = [];

  lines.push('📊 User Story Quality Validation');
  lines.push(`   Stories Validated: ${result.validatedStories}/${result.totalStories}`);
  lines.push(`   Average Score: ${result.averageScore}% (minimum: ${result.minimumScore}%)`);
  lines.push('   Quality Distribution:');
  lines.push(`     - Excellent (90-100): ${result.qualityDistribution.excellent}`);
  lines.push(`     - Good (80-89): ${result.qualityDistribution.good}`);
  lines.push(`     - Acceptable (70-79): ${result.qualityDistribution.acceptable}`);
  lines.push(`     - Poor (<70): ${result.qualityDistribution.poor}`);

  if (result.boilerplateCount > 0) {
    lines.push(`   ⚠️  Boilerplate Detected: ${result.boilerplateCount} stories`);
  }

  if (result.issues.length > 0) {
    lines.push(`   ❌ Blocking Issues: ${result.issues.length}`);
  }

  if (result.warnings.length > 0) {
    lines.push(`   ⚠️  Warnings: ${result.warnings.length}`);
  }

  return lines.join('\n');
}

/**
 * Get improvement guidance for failed validation
 */
export function getUserStoryImprovementGuidance(validationResult) {
  const guidance = {
    required: [],
    recommended: [],
    timeEstimate: '30-60 minutes',
    instructions: ''
  };

  // Analyze issues
  const issueTypes = {
    title: validationResult.issues.filter(i => i.includes('Title')),
    userWant: validationResult.issues.filter(i => i.includes('user_want')),
    userBenefit: validationResult.issues.filter(i => i.includes('user_benefit')),
    acceptanceCriteria: validationResult.issues.filter(i => i.includes('acceptance criteria')),
    boilerplate: validationResult.issues.filter(i => i.includes('boilerplate'))
  };

  if (issueTypes.title.length > 0) {
    guidance.required.push(`Fix ${issueTypes.title.length} story titles (remove "undefined", add specificity)`);
  }

  if (issueTypes.userWant.length > 0) {
    guidance.required.push(`Expand ${issueTypes.userWant.length} user_want fields (minimum 20 chars, describe the feature)`);
  }

  if (issueTypes.userBenefit.length > 0) {
    guidance.required.push(`Add specific benefits to ${issueTypes.userBenefit.length} stories (what value does the user gain?)`);
  }

  if (issueTypes.acceptanceCriteria.length > 0) {
    guidance.required.push(`Add specific acceptance criteria to ${issueTypes.acceptanceCriteria.length} stories (minimum 2 per story)`);
  }

  if (issueTypes.boilerplate.length > 0) {
    guidance.required.push(`Replace boilerplate in ${issueTypes.boilerplate.length} stories with specific, testable criteria`);
  }

  // Recommendations from warnings
  const warningTypes = {
    genericRole: validationResult.warnings.filter(w => w.includes('Generic user_role')),
    noGWT: validationResult.warnings.filter(w => w.includes('Given-When-Then')),
    noContext: validationResult.warnings.filter(w => w.includes('implementation_context'))
  };

  if (warningTypes.genericRole.length > 0) {
    guidance.recommended.push(`Use specific personas instead of "user/developer" in ${warningTypes.genericRole.length} stories`);
  }

  if (warningTypes.noGWT.length > 0) {
    guidance.recommended.push('Add Given-When-Then format to acceptance criteria for better testability');
  }

  if (warningTypes.noContext.length > 0) {
    guidance.recommended.push('Add implementation_context with architecture references and code patterns');
  }

  // Time estimate based on issues
  const totalIssues = validationResult.issues.length;
  if (totalIssues <= 5) {
    guidance.timeEstimate = '15-30 minutes';
  } else if (totalIssues <= 15) {
    guidance.timeEstimate = '30-60 minutes';
  } else {
    guidance.timeEstimate = '1-2 hours';
  }

  guidance.instructions = `User story quality score is ${validationResult.averageScore}% (minimum ${validationResult.minimumScore}%). ` +
    'Focus on stories with score < 70. ' +
    'Use the stories-agent skill for guidance on INVEST criteria and Given-When-Then format.';

  return guidance;
}

export default {
  validateUserStoryQuality,
  validateUserStoriesForHandoff,
  getUserStoryImprovementGuidance
};
