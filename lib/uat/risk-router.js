/**
 * UAT Risk-Based Defect Router
 *
 * Purpose: Route defects to /quick-fix or full SD based on risk assessment
 * SD: SD-UAT-ROUTE-001
 *
 * Features:
 * - Risk assessment beyond just LOC count
 * - Checks for auth/security, database, payment impacts
 * - Returns routing recommendation (QUICK_FIX or FULL_SD)
 */

/**
 * Risk factors that elevate a defect from quick-fix to full SD
 */
const HIGH_RISK_PATTERNS = {
  // Authentication/Security patterns
  auth: [
    /auth/i,
    /login/i,
    /logout/i,
    /session/i,
    /token/i,
    /jwt/i,
    /oauth/i,
    /password/i,
    /credential/i,
    /permission/i,
    /role/i,
    /rls/i,
    /security/i
  ],

  // Database patterns
  database: [
    /migration/i,
    /schema/i,
    /table/i,
    /column/i,
    /index/i,
    /foreign key/i,
    /constraint/i,
    /supabase/i,
    /postgres/i,
    /sql/i,
    /database/i,
    /db\./i
  ],

  // Payment/Money patterns
  payment: [
    /payment/i,
    /stripe/i,
    /billing/i,
    /invoice/i,
    /subscription/i,
    /charge/i,
    /refund/i,
    /money/i,
    /price/i,
    /checkout/i,
    /cart/i,
    /transaction/i
  ],

  // Critical infrastructure patterns
  infrastructure: [
    /api/i,
    /endpoint/i,
    /middleware/i,
    /webhook/i,
    /cron/i,
    /queue/i,
    /cache/i,
    /redis/i,
    /env/i,
    /config/i,
    /deploy/i,
    /ci\/cd/i
  ]
};

/**
 * Maximum LOC for quick-fix eligibility
 */
const QUICK_FIX_MAX_LOC = 50;

/**
 * Assess risk level of a defect
 *
 * @param {Object} defect - Defect information
 * @param {string} defect.title - Defect title
 * @param {string} defect.description - Defect description
 * @param {string} defect.failureType - Type of failure
 * @param {number} defect.estimatedLOC - Estimated lines of code
 * @param {Array<string>} defect.affectedFiles - Files that may need changes
 * @returns {Object} Risk assessment
 */
export function assessRisk(defect) {
  const {
    title = '',
    description = '',
    failureType = '',
    estimatedLOC = 0,
    affectedFiles = []
  } = defect;

  const searchText = `${title} ${description} ${failureType} ${affectedFiles.join(' ')}`;

  const riskFactors = [];
  let riskScore = 0;

  // Check LOC
  if (estimatedLOC > QUICK_FIX_MAX_LOC) {
    riskFactors.push({
      category: 'size',
      reason: `Estimated ${estimatedLOC} LOC exceeds quick-fix limit of ${QUICK_FIX_MAX_LOC}`,
      weight: 30
    });
    riskScore += 30;
  }

  // Check auth/security patterns
  for (const pattern of HIGH_RISK_PATTERNS.auth) {
    if (pattern.test(searchText)) {
      riskFactors.push({
        category: 'security',
        reason: `Touches authentication/security: ${pattern.toString()}`,
        weight: 40
      });
      riskScore += 40;
      break; // Only count once per category
    }
  }

  // Check database patterns
  for (const pattern of HIGH_RISK_PATTERNS.database) {
    if (pattern.test(searchText)) {
      riskFactors.push({
        category: 'database',
        reason: `Involves database changes: ${pattern.toString()}`,
        weight: 35
      });
      riskScore += 35;
      break;
    }
  }

  // Check payment patterns
  for (const pattern of HIGH_RISK_PATTERNS.payment) {
    if (pattern.test(searchText)) {
      riskFactors.push({
        category: 'payment',
        reason: `Touches payment/billing: ${pattern.toString()}`,
        weight: 50
      });
      riskScore += 50;
      break;
    }
  }

  // Check infrastructure patterns
  for (const pattern of HIGH_RISK_PATTERNS.infrastructure) {
    if (pattern.test(searchText)) {
      riskFactors.push({
        category: 'infrastructure',
        reason: `Involves critical infrastructure: ${pattern.toString()}`,
        weight: 25
      });
      riskScore += 25;
      break;
    }
  }

  // Check failure severity
  if (failureType === 'functional' || failureType === 'performance') {
    riskFactors.push({
      category: 'severity',
      reason: `Failure type is ${failureType}`,
      weight: 15
    });
    riskScore += 15;
  }

  // Determine risk level
  let riskLevel = 'LOW';
  if (riskScore >= 50) {
    riskLevel = 'HIGH';
  } else if (riskScore >= 25) {
    riskLevel = 'MEDIUM';
  }

  return {
    riskScore,
    riskLevel,
    riskFactors,
    quickFixEligible: riskScore < 50 && estimatedLOC <= QUICK_FIX_MAX_LOC
  };
}

/**
 * Route a defect to appropriate resolution path
 *
 * @param {Object} defect - Defect information
 * @returns {Object} Routing recommendation
 */
export function routeDefect(defect) {
  const assessment = assessRisk(defect);

  const routing = {
    ...assessment,
    recommendation: assessment.quickFixEligible ? 'QUICK_FIX' : 'FULL_SD',
    actions: []
  };

  if (assessment.quickFixEligible) {
    routing.actions = [
      'Run /quick-fix to address this defect',
      `Estimated effort: ${defect.estimatedLOC || '<50'} lines`,
      'Auto-merge eligible after tests pass'
    ];
    routing.command = '/quick-fix';
  } else {
    routing.actions = [
      'Create new SD for this defect',
      'Requires full LEO Protocol workflow',
      `Risk factors: ${assessment.riskFactors.map(f => f.category).join(', ')}`
    ];
    routing.command = 'Create SD';
  }

  return routing;
}

/**
 * Get routing options for user selection
 *
 * @param {Object} defect - Defect information
 * @returns {Object} Options for AskUserQuestion
 */
export function getRoutingOptions(defect) {
  const assessment = assessRisk(defect);

  const options = [];

  if (assessment.quickFixEligible) {
    options.push({
      label: '/quick-fix (Recommended)',
      description: `Fix now, ${defect.estimatedLOC || '<50'} LOC, auto-merge eligible`
    });
    options.push({
      label: 'Create SD',
      description: 'Full LEO workflow if more scrutiny needed'
    });
  } else {
    options.push({
      label: 'Create SD (Recommended)',
      description: `Full workflow: ${assessment.riskFactors[0]?.reason || 'High risk'}`
    });
    options.push({
      label: '/quick-fix anyway',
      description: 'Override risk assessment (not recommended)'
    });
  }

  options.push({
    label: '/ship anyway',
    description: 'Ship with known issue'
  });

  options.push({
    label: 'Defer',
    description: 'Add to backlog for later'
  });

  return {
    question: `Defect found: ${defect.title}. How should we proceed?`,
    header: 'Defect Routing',
    multiSelect: false,
    options,
    assessment
  };
}

/**
 * Check if a file path touches high-risk areas
 *
 * @param {string} filePath - File path to check
 * @returns {Object} Risk categories matched
 */
export function checkFileRisk(filePath) {
  const categories = {
    auth: false,
    database: false,
    payment: false,
    infrastructure: false
  };

  for (const category of Object.keys(HIGH_RISK_PATTERNS)) {
    for (const pattern of HIGH_RISK_PATTERNS[category]) {
      if (pattern.test(filePath)) {
        categories[category] = true;
        break;
      }
    }
  }

  return categories;
}

export default {
  assessRisk,
  routeDefect,
  getRoutingOptions,
  checkFileRisk,
  QUICK_FIX_MAX_LOC
};
