/**
 * Quality Story Content Generation
 * SD-CAPABILITY-LIFECYCLE-001: Generate meaningful stories, not boilerplate
 * SD-LEO-ENH-LLM-POWERED-USER-001: LLM-powered generation with rule-based fallback
 * SD-LEO-INFRA-CONTEXT-AWARE-LLM-001A: SD type-aware persona validation
 *
 * MARKET-PULSE DIRECTIVE (v3.2.0): Write stories for Customers, not DBAs.
 * Forbidden personas (developer, dba, admin, engineer, ops) are BLOCKED
 * EXCEPT for infrastructure/documentation/refactor SDs where technical personas are allowed.
 *
 * Generation Strategy:
 * 1. Try LLM-powered generation for semantic understanding (with SD context)
 * 2. Fall back to rule-based templates if LLM unavailable or fails
 *
 * @module quality-generation
 */

import { isForbiddenPersona } from '../../../agents/persona-templates.js';
import { getForbiddenPersonasSync } from '../../../persona-config-provider.js';
import { createLLMStoryGenerator, isLLMAvailable, normalizeSdContext } from './llm-story-generator.js';

/**
 * Role mapping for user personas
 * APPROVED personas only (end-users, decision-makers)
 */
const ROLE_MAP = {
  'chairman': 'EHG Chairman',
  'investor': 'Investment Professional',
  'venture': 'Venture Founder',
  'founder': 'Venture Founder',
  'customer': 'Customer',
  'user': 'Platform User',
  'manager': 'Portfolio Manager',
  'analyst': 'Business Analyst',
  'board': 'Board Member',
  'executive': 'C-Suite Executive',
  'patient': 'Healthcare Patient',
  'clinician': 'Healthcare Clinician',
  'cfo': 'Chief Financial Officer',
  'owner': 'Business Owner',
  'client': 'Enterprise Client'
};

/**
 * Generate quality story content from acceptance criterion
 * Avoids boilerplate patterns like "implement X" or generic benefits
 *
 * @param {string} criterion - The acceptance criterion text
 * @param {Object} prd - The PRD object
 * @param {number} index - Story index (0-based)
 * @param {Object} [options] - Optional context for target-app-aware validation
 * @param {string} [options.targetApp] - Target application name (e.g., 'EHG_Engineer')
 * @param {string} [options.sdType] - SD type (e.g., 'infrastructure')
 * @returns {Object} Story content fields
 */
export function generateQualityStoryContent(criterion, prd, index, options = {}) {
  const criterionLower = criterion.toLowerCase();
  const prdTitle = (prd?.title || '').toLowerCase();
  const prdSummary = (prd?.executive_summary || '').toLowerCase();

  // Detect appropriate user role
  let userRole = 'Platform User';

  // SD-LEO-ENH-TARGET-APPLICATION-AWARE-001: Use app-aware forbidden list
  const appForbiddenList = getForbiddenPersonasSync(
    options.targetApp || '_default',
    options.sdType
  );

  // Check for forbidden personas using app-aware list
  const forbiddenPatterns = appForbiddenList.map(fp => new RegExp(`\\b${fp}\\b`, 'i'));
  const hasForbiddenPersona = forbiddenPatterns.some(pattern =>
    pattern.test(criterionLower) || pattern.test(prdTitle) || pattern.test(prdSummary)
  );

  if (hasForbiddenPersona) {
    console.log('   Warning: MARKET-PULSE VIOLATION: Criterion mentions tech persona. Defaulting to customer persona.');
  }

  for (const [key, role] of Object.entries(ROLE_MAP)) {
    if (criterionLower.includes(key) || prdTitle.includes(key) || prdSummary.includes(key)) {
      if (!isForbiddenPersona(role, appForbiddenList)) {
        userRole = role;
        break;
      }
    }
  }

  // Generate meaningful title
  let title = criterion;
  if (criterion.length > 80) {
    const actionMatch = criterion.match(/^([A-Z][^.!?]+)/);
    title = actionMatch ? actionMatch[1] : criterion.substring(0, 80);
  }
  if (title.toLowerCase().startsWith('implement ')) {
    title = title.replace(/^implement\s+/i, '');
  }

  // Generate story components
  const userWant = generateUserWant(criterion);
  const userBenefit = generateUserBenefit(criterion, userRole);
  const acceptanceCriteria = generateAcceptanceCriteria(criterion, index);
  const storyPoints = calculateStoryPoints(criterion);

  return {
    title,
    user_role: userRole,
    user_want: userWant,
    user_benefit: userBenefit,
    acceptance_criteria: acceptanceCriteria,
    story_points: storyPoints
  };
}

/**
 * Generate meaningful user_want (what the user wants to do)
 * @param {string} criterion - The acceptance criterion
 * @returns {string} User want statement
 */
function generateUserWant(criterion) {
  const patterns = [
    { regex: /view\s+(.+)/i, template: 'view $1 on the dashboard' },
    { regex: /create\s+(.+)/i, template: 'create $1 through the interface' },
    { regex: /edit\s+(.+)/i, template: 'edit $1 inline without page reload' },
    { regex: /delete\s+(.+)/i, template: 'delete $1 with confirmation' },
    { regex: /search\s+(.+)/i, template: 'search for $1 using filters and keywords' },
    { regex: /filter\s+(.+)/i, template: 'filter $1 by multiple criteria' },
    { regex: /export\s+(.+)/i, template: 'export $1 to various formats (CSV, PDF)' },
    { regex: /import\s+(.+)/i, template: 'import $1 from external sources' },
    { regex: /configure\s+(.+)/i, template: 'configure $1 settings as needed' },
    { regex: /manage\s+(.+)/i, template: 'manage $1 from a central location' },
    { regex: /track\s+(.+)/i, template: 'track $1 progress over time' },
    { regex: /monitor\s+(.+)/i, template: 'monitor $1 in real-time' },
    { regex: /approve\s+(.+)/i, template: 'approve or reject $1 with feedback' },
    { regex: /submit\s+(.+)/i, template: 'submit $1 for review' },
    { regex: /receive\s+(.+)/i, template: 'receive $1 notifications automatically' },
    { regex: /see\s+(.+)/i, template: 'see $1 displayed clearly' },
    { regex: /access\s+(.+)/i, template: 'access $1 from the main navigation' }
  ];

  for (const { regex, template } of patterns) {
    const match = criterion.match(regex);
    if (match) {
      return template.replace('$1', match[1].trim());
    }
  }

  if (criterion.length >= 20) {
    return criterion.charAt(0).toLowerCase() + criterion.slice(1);
  }

  return `${criterion.toLowerCase()} in the application interface`;
}

/**
 * Generate meaningful user_benefit (why the user wants this)
 * @param {string} criterion - The acceptance criterion
 * @param {string} userRole - The user role
 * @returns {string} User benefit statement
 */
function generateUserBenefit(criterion, userRole) {
  const criterionLower = criterion.toLowerCase();

  const benefitMap = {
    'view': 'I can make informed decisions based on current data',
    'create': 'I can add new items to the system efficiently',
    'edit': 'I can keep information up-to-date without disruption',
    'delete': 'I can maintain a clean and relevant dataset',
    'search': 'I can quickly find the information I need',
    'filter': 'I can focus on the most relevant items',
    'export': 'I can share data with stakeholders and other systems',
    'import': 'I can leverage existing data without manual entry',
    'configure': 'I can customize the system to my workflow',
    'manage': 'I have full control over my resources',
    'track': 'I can measure progress and identify trends',
    'monitor': 'I can respond quickly to changes and issues',
    'approve': 'I can ensure quality control in the workflow',
    'submit': 'I can move items forward in the process',
    'receive': 'I stay informed about important updates',
    'access': 'I can quickly navigate to important features'
  };

  for (const [key, benefit] of Object.entries(benefitMap)) {
    if (criterionLower.includes(key)) {
      return benefit;
    }
  }

  const roleBenefits = {
    'EHG Chairman': 'I can maintain strategic oversight of the portfolio',
    'Investment Professional': 'I can make better investment decisions',
    'Venture Creator': 'I can efficiently manage my venture pipeline',
    'System Administrator': 'I can ensure system reliability and security',
    'Portfolio Manager': 'I can optimize portfolio performance',
    'Board Member': 'I can fulfill my governance responsibilities',
    'Business Analyst': 'I can derive actionable insights from data'
  };

  return roleBenefits[userRole] || 'I can accomplish my goals more efficiently';
}

/**
 * Simple past tense conjugation for regular verbs.
 * Handles "e"-ending verbs (score→scored, create→created) correctly.
 * @param {string} verb - Base verb
 * @returns {string} Past tense form
 */
function pastTense(verb) {
  if (verb.endsWith('e')) return verb + 'd';
  return verb + 'ed';
}

/**
 * Extract key action and subject from a criterion string
 * @param {string} criterion - The acceptance criterion
 * @returns {{ action: string, subject: string, details: string }}
 */
function extractCriterionParts(criterion) {
  const lower = criterion.toLowerCase().trim();

  // Try to extract "verb + subject" pattern
  const verbPatterns = [
    /^(view|display|show|see|list)\s+(.+)/i,
    /^(create|add|generate|insert)\s+(.+)/i,
    /^(edit|update|modify|change)\s+(.+)/i,
    /^(delete|remove|archive)\s+(.+)/i,
    /^(filter|sort|search|find)\s+(.+)/i,
    /^(score|rate|evaluate|assess|validate)\s+(.+)/i,
    /^(configure|set|toggle|enable|disable)\s+(.+)/i,
    /^(export|download|import|upload)\s+(.+)/i,
    /^(notify|alert|warn|flag)\s+(.+)/i
  ];

  for (const pattern of verbPatterns) {
    const match = lower.match(pattern);
    if (match) {
      return { action: match[1], subject: match[2], details: criterion };
    }
  }

  // Fallback: use first few words as action, rest as subject
  const words = lower.split(/\s+/);
  return {
    action: words.slice(0, 2).join(' '),
    subject: words.slice(2).join(' ') || 'the feature',
    details: criterion
  };
}

/**
 * Generate specific acceptance criteria (Given-When-Then format)
 * Extracts meaningful terms from the criterion to produce specific,
 * testable scenarios rather than generic boilerplate.
 *
 * @param {string} criterion - The acceptance criterion
 * @param {number} index - Story index
 * @returns {Array} Acceptance criteria array
 */
function generateAcceptanceCriteria(criterion, index) {
  const criteria = [];
  const { action, subject } = extractCriterionParts(criterion);
  const criterionLower = criterion.toLowerCase();

  // AC 1: Happy path - derived from actual criterion content
  criteria.push({
    id: `AC-${index + 1}-1`,
    scenario: `Successful ${action} of ${subject}`,
    given: `The user has navigated to the area where they can ${action} ${subject}`,
    when: `The user performs the ${action} action with valid inputs`,
    then: `The ${subject} is ${pastTense(action)} successfully, the result is visible in the UI, and data is persisted correctly`,
    is_boilerplate: true
  });

  // AC 2: Context-specific validation scenario
  if (criterionLower.includes('score') || criterionLower.includes('quality') || criterionLower.includes('rating')) {
    criteria.push({
      id: `AC-${index + 1}-2`,
      scenario: `Score/quality boundary validation for ${subject}`,
      given: `The ${subject} has varying levels of completeness`,
      when: 'The system evaluates the quality score',
      then: 'Items at threshold boundaries (e.g., 59 vs 60) are scored correctly and the displayed score matches the stored value',
      is_boilerplate: true
    });
  } else if (criterionLower.includes('filter') || criterionLower.includes('sort')) {
    criteria.push({
      id: `AC-${index + 1}-2`,
      scenario: `Filter/sort accuracy for ${subject}`,
      given: 'Multiple items exist with different attribute values',
      when: 'The user applies filter or sort criteria',
      then: 'Only matching items are shown, sort order is correct, and result count is accurate',
      is_boilerplate: true
    });
  } else if (criterionLower.includes('warn') || criterionLower.includes('alert') || criterionLower.includes('flag')) {
    criteria.push({
      id: `AC-${index + 1}-2`,
      scenario: `Warning display and dismissal for ${subject}`,
      given: 'A condition triggering a warning exists',
      when: 'The warning is displayed to the user',
      then: 'The warning is non-blocking, clearly explains the issue, and the user can dismiss or act on it',
      is_boilerplate: true
    });
  } else {
    criteria.push({
      id: `AC-${index + 1}-2`,
      scenario: `Input validation for ${action} ${subject}`,
      given: `The user is on the ${action} form with required fields`,
      when: 'The user submits with missing or invalid data',
      then: 'Specific field-level validation errors are displayed and the form is not submitted',
      is_boilerplate: true
    });
  }

  // AC 3: Edge case based on action type
  if (criterionLower.includes('create') || criterionLower.includes('add')) {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: `Duplicate detection when creating ${subject}`,
      given: 'An item with the same identifying attributes already exists',
      when: `The user attempts to create a duplicate ${subject}`,
      then: 'The system prevents the duplicate, shows the existing item, and suggests alternatives',
      is_boilerplate: true
    });
  } else if (criterionLower.includes('delete') || criterionLower.includes('remove')) {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: `Deletion with dependencies for ${subject}`,
      given: `The ${subject} has related records or downstream dependencies`,
      when: 'The user attempts to delete it',
      then: 'A confirmation dialog lists affected items, and deletion only proceeds after explicit confirmation',
      is_boilerplate: true
    });
  } else if (criterionLower.includes('edit') || criterionLower.includes('update') || criterionLower.includes('configure')) {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: `Persistence verification for ${action} ${subject}`,
      given: `The user has made changes to ${subject}`,
      when: 'The page is refreshed or the user navigates away and returns',
      then: 'All changes are persisted and displayed correctly',
      is_boilerplate: true
    });
  } else if (criterionLower.includes('list') || criterionLower.includes('view') || criterionLower.includes('display')) {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: `Empty state for ${subject}`,
      given: `No ${subject} items exist matching the current context`,
      when: `The user views the ${subject} area`,
      then: 'A meaningful empty state is shown with guidance on how to create the first item',
      is_boilerplate: true
    });
  } else {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: `Error recovery for ${action} ${subject}`,
      given: `A transient error occurs during the ${action} operation (e.g., network timeout)`,
      when: 'The user retries the action',
      then: 'The operation succeeds without data corruption or duplicate side effects',
      is_boilerplate: true
    });
  }

  return criteria;
}

/**
 * Calculate story points based on complexity indicators
 * @param {string} criterion - The acceptance criterion
 * @returns {number} Story points
 */
function calculateStoryPoints(criterion) {
  let points = 2;

  const complexityIndicators = [
    { pattern: /integrat/i, points: 2 },
    { pattern: /migrat/i, points: 3 },
    { pattern: /real.?time/i, points: 2 },
    { pattern: /security/i, points: 2 },
    { pattern: /performance/i, points: 2 },
    { pattern: /export/i, points: 1 },
    { pattern: /import/i, points: 2 },
    { pattern: /chart|graph|visual/i, points: 2 },
    { pattern: /notification/i, points: 1 },
    { pattern: /search|filter/i, points: 1 },
    { pattern: /email/i, points: 1 },
    { pattern: /report/i, points: 2 },
    { pattern: /dashboard/i, points: 2 },
    { pattern: /api/i, points: 1 },
    { pattern: /database|schema/i, points: 2 }
  ];

  for (const { pattern, points: addPoints } of complexityIndicators) {
    if (pattern.test(criterion)) {
      points += addPoints;
    }
  }

  return Math.min(points, 13);
}

// ============================================================================
// LLM-POWERED GENERATION (SD-LEO-ENH-LLM-POWERED-USER-001)
// ============================================================================

// Singleton LLM generator instance
let llmGenerator = null;

/**
 * Get or create the LLM generator instance
 * @returns {Object|null} LLM generator or null if not available
 */
function getLLMGenerator() {
  if (llmGenerator === null) {
    if (isLLMAvailable()) {
      llmGenerator = createLLMStoryGenerator();
    }
  }
  return llmGenerator;
}

/**
 * Generate quality story content using LLM with rule-based fallback
 * This is the preferred async method for story generation.
 *
 * @param {string} criterion - The acceptance criterion text
 * @param {Object} prd - The PRD object
 * @param {number} index - Story index (0-based)
 * @param {Object} options - Generation options
 * @param {Object} sdContext - Optional SD context for enriched generation
 * @returns {Promise<Object>} Story content fields with generation metadata
 */
export async function generateQualityStoryContentWithLLM(criterion, prd, index, _options = {}, sdContext = null) {
  const generator = getLLMGenerator();
  const normalizedContext = normalizeSdContext(sdContext);

  // Try LLM generation first
  if (generator && generator.isEnabled()) {
    try {
      const llmResult = await generator.generateSingleStory(criterion, prd, index, normalizedContext);

      if (llmResult) {
        // Validate LLM output against forbidden personas (SD-type aware)
        const userRole = validateUserRole(llmResult.user_role, normalizedContext);

        return {
          title: llmResult.title || criterion.substring(0, 80),
          user_role: userRole,
          user_want: llmResult.user_want || generateUserWant(criterion),
          user_benefit: llmResult.user_benefit || generateUserBenefit(criterion, userRole),
          acceptance_criteria: llmResult.acceptance_criteria || generateAcceptanceCriteria(criterion, index),
          story_points: llmResult.story_points || calculateStoryPoints(criterion),
          generated_by: 'LLM',
          gaps_detected: llmResult.gaps || [],
          sd_context_applied: !!normalizedContext,
          sd_type: normalizedContext?.sdType || null
        };
      }
    } catch (error) {
      console.log(`   [LLM] Falling back to rule-based: ${error.message}`);
    }
  }

  // Fall back to rule-based generation
  const ruleBasedContent = generateQualityStoryContent(criterion, prd, index);
  return {
    ...ruleBasedContent,
    generated_by: 'RULE_BASED',
    gaps_detected: [],
    sd_context_applied: false
  };
}

/**
 * Generate multiple stories in batch using LLM
 * More efficient than individual calls for large PRDs.
 *
 * @param {Array} acceptanceCriteria - Array of acceptance criteria strings
 * @param {Object} prd - The PRD object
 * @param {Object} options - Generation options
 * @param {Object} sdContext - Optional SD context for enriched generation
 * @returns {Promise<Object>} Batch generation results
 */
export async function generateStoriesBatch(acceptanceCriteria, prd, options = {}, sdContext = null) {
  const generator = getLLMGenerator();
  const normalizedContext = normalizeSdContext(sdContext);

  // Try LLM batch generation first
  if (generator && generator.isEnabled()) {
    const result = await generator.generateStoriesFromCriteria(acceptanceCriteria, prd, options, normalizedContext);

    if (result.success && result.stories.length > 0) {
      // Validate and enrich LLM stories (SD-type aware)
      const validatedStories = result.stories.map((story) => ({
        ...story,
        user_role: validateUserRole(story.user_role, normalizedContext),
        generated_by: 'LLM',
        sd_context_applied: !!normalizedContext,
        sd_type: normalizedContext?.sdType || null
      }));

      return {
        success: true,
        stories: validatedStories,
        gaps: result.gaps || [],
        generated_by: 'LLM',
        sd_context_applied: !!normalizedContext
      };
    }
  }

  // Fall back to rule-based generation
  console.log('   [Stories] Using rule-based generation (LLM unavailable or failed)');
  const stories = acceptanceCriteria.map((criterion, idx) => {
    const content = generateQualityStoryContent(criterion, prd, idx);
    return {
      ...content,
      criterion_index: idx,
      original_criterion: criterion,
      generated_by: 'RULE_BASED',
      sd_context_applied: false
    };
  });

  return {
    success: true,
    stories,
    gaps: [],
    generated_by: 'RULE_BASED',
    sd_context_applied: false
  };
}

/**
 * Validate and sanitize user role against forbidden personas
 * SD-LEO-INFRA-CONTEXT-AWARE-LLM-001A: SD-type aware persona validation
 *
 * @param {string} role - The proposed user role
 * @param {Object} sdContext - Normalized SD context (optional)
 * @returns {string} Valid user role
 */
function validateUserRole(role, sdContext = null) {
  if (!role) {
    // Default based on SD type
    if (sdContext?.personas?.suggestedPersonas?.length > 0) {
      return sdContext.personas.suggestedPersonas[0];
    }
    return 'Platform User';
  }

  // Check if role matches any approved role in ROLE_MAP
  const normalizedRole = role.toLowerCase();
  for (const [key, approvedRole] of Object.entries(ROLE_MAP)) {
    if (normalizedRole.includes(key)) {
      return approvedRole;
    }
  }

  // SD-type aware persona validation
  if (sdContext && sdContext.personas) {
    // If SD type allows technical personas, accept them
    if (sdContext.personas.allowTechnical) {
      // Still validate it's a reasonable technical role
      const technicalPatterns = ['developer', 'engineer', 'operator', 'admin', 'dba', 'architect', 'devops'];
      const isTechnicalRole = technicalPatterns.some(pattern => normalizedRole.includes(pattern));

      if (isTechnicalRole) {
        // Accept the technical role for infrastructure/documentation/refactor SDs
        return role;
      }
    }

    // Check against SD-type specific forbidden personas
    if (sdContext.personas.forbiddenPersonas && sdContext.personas.forbiddenPersonas.length > 0) {
      const isForbiddenForType = sdContext.personas.forbiddenPersonas.some(
        forbidden => normalizedRole.includes(forbidden.toLowerCase())
      );

      if (isForbiddenForType) {
        console.log(`   Warning: Role "${role}" forbidden for ${sdContext.sdType} SD, using suggested persona`);
        return sdContext.personas.suggestedPersonas[0] || 'Platform User';
      }
    }
  }

  // Legacy check against global forbidden personas (for backward compatibility)
  if (isForbiddenPersona(role)) {
    // Only block if SD context doesn't allow technical personas
    if (!sdContext?.personas?.allowTechnical) {
      console.log(`   Warning: LLM suggested forbidden persona "${role}", defaulting to Platform User`);
      return 'Platform User';
    }
  }

  // Accept the LLM's role if it passes validation
  return role;
}

/**
 * Check if LLM generation is available
 * @returns {boolean} Whether LLM generation can be used
 */
export function isLLMGenerationAvailable() {
  return isLLMAvailable();
}

// Re-export normalizeSdContext for external use
export { normalizeSdContext } from './llm-story-generator.js';
