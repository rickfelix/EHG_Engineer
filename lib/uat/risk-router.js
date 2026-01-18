/**
 * UAT Risk-Based Defect Router
 *
 * Purpose: Route defects to /quick-fix or full SD based on risk assessment
 * SD: SD-UAT-ROUTE-001
 * Updated: SD-QUALITY-INT-001 - Now reads from unified feedback table
 *
 * Features:
 * - Risk assessment beyond just LOC count
 * - Checks for auth/security, database, payment impacts
 * - Returns routing recommendation (QUICK_FIX or FULL_SD)
 * - Queries unified feedback table for open defects
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

let supabase = null;

/**
 * Initialize Supabase client
 */
async function getSupabase() {
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabase;
}

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

/**
 * SD-QUALITY-INT-001: Get open defects from unified feedback table
 * Replaces queries to uat_defects table
 *
 * @param {Object} options - Query options
 * @param {string} options.sourceType - Filter by source type (e.g., 'uat_failure', 'error_capture')
 * @param {string} options.severity - Filter by severity
 * @param {number} options.limit - Maximum results to return
 * @returns {Promise<Array>} Open defects with routing recommendations
 */
export async function getOpenDefects(options = {}) {
  const db = await getSupabase();

  const {
    sourceType = null,
    severity = null,
    limit = 50
  } = options;

  let query = db
    .from('feedback')
    .select('*')
    .eq('type', 'issue')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (sourceType) {
    query = query.eq('source_type', sourceType);
  }

  if (severity) {
    query = query.eq('severity', severity);
  }

  const { data: defects, error } = await query;

  if (error) {
    console.error('Failed to fetch defects from feedback:', error.message);
    return [];
  }

  // Add routing recommendations to each defect
  return defects.map(defect => {
    const routing = routeDefect({
      title: defect.title,
      description: defect.description,
      failureType: defect.metadata?.failure_type,
      estimatedLOC: defect.metadata?.estimated_loc || 0,
      affectedFiles: defect.metadata?.affected_files || []
    });

    return {
      ...defect,
      routing
    };
  });
}

/**
 * SD-QUALITY-INT-001: Get defects pending routing decision
 * These are defects that haven't been assigned to a resolution path
 *
 * @returns {Promise<Array>} Defects needing routing
 */
export async function getDefectsNeedingRouting() {
  const db = await getSupabase();

  const { data: defects, error } = await db
    .from('feedback')
    .select('*')
    .eq('type', 'issue')
    .eq('status', 'open')
    .is('assigned_to', null)
    .order('priority', { ascending: true }) // P0 first
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('Failed to fetch defects needing routing:', error.message);
    return [];
  }

  // Add routing recommendations
  return defects.map(defect => ({
    ...defect,
    routingOptions: getRoutingOptions({
      title: defect.title,
      description: defect.description,
      estimatedLOC: defect.metadata?.estimated_loc
    })
  }));
}

/**
 * SD-QUALITY-INT-001: Route a specific defect by ID
 *
 * @param {string} feedbackId - Feedback record ID
 * @returns {Promise<Object>} Routing recommendation
 */
export async function routeDefectById(feedbackId) {
  const db = await getSupabase();

  const { data: defect, error } = await db
    .from('feedback')
    .select('*')
    .eq('id', feedbackId)
    .single();

  if (error || !defect) {
    throw new Error(`Defect not found: ${feedbackId}`);
  }

  return routeDefect({
    title: defect.title,
    description: defect.description,
    failureType: defect.metadata?.failure_type,
    estimatedLOC: defect.metadata?.estimated_loc || 0,
    affectedFiles: defect.metadata?.affected_files || []
  });
}

/**
 * SD-QUALITY-INT-001: Notify Risk Router about high-severity feedback
 * Called from feedback-capture.js when P0 or P1 feedback is created
 *
 * @param {Object} feedbackRecord - The feedback record that was created
 * @returns {Promise<Object>} Routing recommendation and any auto-escalation actions
 */
export async function notifyHighSeverityFeedback(feedbackRecord) {
  const db = await getSupabase();

  // Only process P0 and P1 priority feedback
  if (!['P0', 'P1'].includes(feedbackRecord.priority)) {
    return { processed: false, reason: 'Not high severity' };
  }

  // Assess risk for this feedback
  const assessment = assessRisk({
    title: feedbackRecord.title,
    description: feedbackRecord.description,
    failureType: feedbackRecord.metadata?.failure_type,
    estimatedLOC: feedbackRecord.metadata?.estimated_loc || 0,
    affectedFiles: feedbackRecord.metadata?.affected_files || []
  });

  // Log the risk notification
  console.log(`[RiskRouter] High-severity feedback detected: ${feedbackRecord.priority} - ${feedbackRecord.title}`);
  console.log(`[RiskRouter] Risk assessment: ${assessment.riskLevel} (score: ${assessment.riskScore})`);

  // Auto-escalation actions based on risk
  const escalationActions = [];

  if (feedbackRecord.priority === 'P0') {
    escalationActions.push('IMMEDIATE_ATTENTION_REQUIRED');

    // P0 with HIGH risk factors auto-creates SD notification
    if (assessment.riskLevel === 'HIGH') {
      escalationActions.push('RECOMMEND_FULL_SD');

      // Record escalation in feedback metadata
      try {
        await db
          .from('feedback')
          .update({
            metadata: {
              ...feedbackRecord.metadata,
              risk_assessment: assessment,
              escalation_actions: escalationActions,
              escalated_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', feedbackRecord.id);
      } catch (updateError) {
        console.error('[RiskRouter] Failed to update escalation metadata:', updateError.message);
      }
    }
  }

  // Determine routing recommendation
  const routing = routeDefect({
    title: feedbackRecord.title,
    description: feedbackRecord.description,
    failureType: feedbackRecord.metadata?.failure_type,
    estimatedLOC: feedbackRecord.metadata?.estimated_loc || 0,
    affectedFiles: feedbackRecord.metadata?.affected_files || []
  });

  return {
    processed: true,
    feedbackId: feedbackRecord.id,
    priority: feedbackRecord.priority,
    assessment,
    routing,
    escalationActions,
    timestamp: new Date().toISOString()
  };
}

/**
 * SD-QUALITY-INT-001: Get high-severity feedback awaiting attention
 * Used by /inbox and monitoring dashboards
 *
 * @returns {Promise<Array>} High-severity feedback items with routing
 */
export async function getHighSeverityFeedback() {
  const db = await getSupabase();

  const { data: feedback, error } = await db
    .from('feedback')
    .select('*')
    .in('priority', ['P0', 'P1'])
    .in('status', ['new', 'open', 'triaged'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[RiskRouter] Failed to fetch high-severity feedback:', error.message);
    return [];
  }

  // Add routing recommendations
  return feedback.map(item => ({
    ...item,
    routing: routeDefect({
      title: item.title,
      description: item.description,
      failureType: item.metadata?.failure_type,
      estimatedLOC: item.metadata?.estimated_loc || 0,
      affectedFiles: item.metadata?.affected_files || []
    })
  }));
}

export default {
  assessRisk,
  routeDefect,
  getRoutingOptions,
  checkFileRisk,
  QUICK_FIX_MAX_LOC,
  // SD-QUALITY-INT-001 additions
  getOpenDefects,
  getDefectsNeedingRouting,
  routeDefectById,
  notifyHighSeverityFeedback,
  getHighSeverityFeedback
};
