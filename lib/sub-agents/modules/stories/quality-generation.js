/**
 * Quality Story Content Generation
 * SD-CAPABILITY-LIFECYCLE-001: Generate meaningful stories, not boilerplate
 *
 * MARKET-PULSE DIRECTIVE (v3.2.0): Write stories for Customers, not DBAs.
 * Forbidden personas (developer, dba, admin, engineer, ops) are BLOCKED.
 *
 * @module quality-generation
 */

import {
  FORBIDDEN_PERSONAS,
  isForbiddenPersona
} from '../../../agents/persona-templates.js';

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
 * @returns {Object} Story content fields
 */
export function generateQualityStoryContent(criterion, prd, index) {
  const criterionLower = criterion.toLowerCase();
  const prdTitle = (prd?.title || '').toLowerCase();
  const prdSummary = (prd?.executive_summary || '').toLowerCase();

  // Detect appropriate user role
  let userRole = 'Platform User';

  // Check for forbidden personas
  const forbiddenPatterns = FORBIDDEN_PERSONAS.map(fp => new RegExp(`\\b${fp}\\b`, 'i'));
  const hasForbiddenPersona = forbiddenPatterns.some(pattern =>
    pattern.test(criterionLower) || pattern.test(prdTitle) || pattern.test(prdSummary)
  );

  if (hasForbiddenPersona) {
    console.log('   Warning: MARKET-PULSE VIOLATION: Criterion mentions tech persona. Defaulting to customer persona.');
  }

  for (const [key, role] of Object.entries(ROLE_MAP)) {
    if (criterionLower.includes(key) || prdTitle.includes(key) || prdSummary.includes(key)) {
      if (!isForbiddenPersona(role)) {
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
 * Generate specific acceptance criteria (Given-When-Then format)
 * @param {string} criterion - The acceptance criterion
 * @param {number} index - Story index
 * @returns {Array} Acceptance criteria array
 */
function generateAcceptanceCriteria(criterion, index) {
  const criteria = [];

  criteria.push({
    id: `AC-${index + 1}-1`,
    scenario: 'Happy path - successful completion',
    given: 'User is authenticated and on the relevant page',
    when: `User ${criterion.toLowerCase()}`,
    then: 'The action completes successfully and user receives confirmation',
    is_boilerplate: false
  });

  criteria.push({
    id: `AC-${index + 1}-2`,
    scenario: 'Validation - invalid input',
    given: 'User is on the form/action page',
    when: 'User submits with invalid or missing required data',
    then: 'Validation errors are displayed inline with specific guidance',
    is_boilerplate: false
  });

  const criterionLower = criterion.toLowerCase();
  if (criterionLower.includes('create') || criterionLower.includes('add')) {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: 'Edge case - duplicate detection',
      given: 'An item with the same key identifier exists',
      when: 'User attempts to create a duplicate',
      then: 'System prevents duplicate and suggests alternatives',
      is_boilerplate: false
    });
  } else if (criterionLower.includes('delete') || criterionLower.includes('remove')) {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: 'Edge case - deletion with dependencies',
      given: 'Item has related records or dependencies',
      when: 'User attempts to delete',
      then: 'System shows warning about affected items and requires confirmation',
      is_boilerplate: false
    });
  } else if (criterionLower.includes('edit') || criterionLower.includes('update')) {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: 'Edge case - concurrent edit',
      given: 'Another user has modified the same item',
      when: 'User submits their changes',
      then: 'System handles conflict appropriately (merge or notify)',
      is_boilerplate: false
    });
  } else {
    criteria.push({
      id: `AC-${index + 1}-3`,
      scenario: 'Edge case - permission denied',
      given: 'User lacks permission for this action',
      when: 'User attempts the action',
      then: 'System shows appropriate permission error without exposing sensitive info',
      is_boilerplate: false
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
