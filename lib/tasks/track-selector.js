/**
 * LEO 5.0 Track Selector
 *
 * Maps SD types to execution tracks with automatic escalation logic.
 *
 * Tracks:
 * - FULL: Maximum governance (infrastructure, security, orchestrator)
 * - STANDARD: Default workflow (feature, enhancement, refactor)
 * - FAST: Lightweight (fix, documentation)
 * - HOTFIX: Emergency (hotfix, typo, config)
 */

// Track mapping by SD type
const TRACK_MAP = {
  // FULL Track - Maximum governance (5 phases, 5 walls)
  'infrastructure': 'FULL',
  'security': 'FULL',
  'orchestrator': 'FULL',

  // STANDARD Track - Default workflow (4 phases, 4 walls)
  'feature': 'STANDARD',
  'enhancement': 'STANDARD',
  'refactor': 'STANDARD',

  // FAST Track - Lightweight (3 phases, 3 walls)
  'fix': 'FAST',
  'documentation': 'FAST',
  'bugfix': 'FAST',

  // HOTFIX Track - Emergency (2 phases, 2 walls)
  'hotfix': 'HOTFIX',
  'typo': 'HOTFIX',
  'config': 'HOTFIX'
};

// Track upgrade path
const UPGRADE_PATH = {
  'HOTFIX': 'FAST',
  'FAST': 'STANDARD',
  'STANDARD': 'FULL',
  'FULL': 'FULL'
};

// Track characteristics
const TRACK_CONFIG = {
  FULL: {
    phases: ['LEAD', 'PLAN', 'EXEC', 'VERIFY', 'FINAL'],
    walls: ['LEAD-WALL', 'PLAN-WALL', 'EXEC-WALL', 'VERIFY-WALL', 'FINAL-APPROVE'],
    prdType: 'full',
    subAgentsRequired: true,
    bmadValidation: true,
    bmadThreshold: 85,
    verifyPhase: 'dedicated',
    typicalDuration: 'days-weeks'
  },
  STANDARD: {
    phases: ['LEAD', 'PLAN', 'EXEC', 'FINAL'],
    walls: ['LEAD-WALL', 'PLAN-WALL', 'EXEC-WALL', 'FINAL-APPROVE'],
    prdType: 'standard',
    subAgentsRequired: false,
    bmadValidation: true,
    bmadThreshold: 75,
    verifyPhase: 'merged-into-final',
    typicalDuration: 'hours-days'
  },
  FAST: {
    phases: ['LEAD', 'EXEC', 'FINAL'],
    walls: ['LEAD-WALL', 'EXEC-WALL', 'FINAL-APPROVE'],
    prdType: 'mini-spec',
    subAgentsRequired: false,
    bmadValidation: false,
    bmadThreshold: null,
    verifyPhase: 'none',
    typicalDuration: 'hours'
  },
  HOTFIX: {
    phases: ['EXEC', 'SAFETY', 'FINAL'],
    walls: ['EXEC-WALL', 'SAFETY-WALL', 'FINAL-APPROVE'],
    prdType: null,
    subAgentsRequired: false,
    bmadValidation: false,
    bmadThreshold: null,
    verifyPhase: 'safety-wall',
    typicalDuration: 'minutes'
  }
};

// Type-aware sub-agent requirements
const SUBAGENT_REQUIREMENTS = {
  byType: {
    feature: { required: ['TESTING', 'DESIGN', 'STORIES'], recommended: ['UAT', 'API'] },
    infrastructure: { required: ['GITHUB', 'DOCMON'], recommended: ['VALIDATION'] },
    database: { required: ['DATABASE', 'SECURITY'], recommended: ['REGRESSION'] },
    security: { required: ['SECURITY', 'DATABASE'], recommended: ['TESTING', 'RCA'] },
    bugfix: { required: ['RCA', 'REGRESSION', 'TESTING'], recommended: ['UAT'] },
    fix: { required: ['TESTING'], recommended: ['REGRESSION'] },
    refactor: { required: ['REGRESSION', 'VALIDATION'], recommended: ['TESTING'] },
    documentation: { required: ['DOCMON'], recommended: ['VALIDATION'] },
    orchestrator: { required: [], recommended: ['RETRO'] },
    enhancement: { required: ['TESTING'], recommended: ['DESIGN', 'STORIES'] },
    hotfix: { required: [], recommended: ['TESTING'] },
    typo: { required: [], recommended: [] },
    config: { required: [], recommended: ['VALIDATION'] }
  },
  byCategory: {
    'Quality Assurance': ['TESTING', 'UAT', 'VALIDATION'],
    'security': ['SECURITY', 'RISK'],
    'database': ['DATABASE', 'SECURITY'],
    'database_schema': ['DATABASE', 'SECURITY'],
    'ux_improvement': ['DESIGN', 'UAT'],
    'product_feature': ['DESIGN', 'STORIES', 'API']
  }
};

// Sub-agent timing rules
const SUBAGENT_TIMING = {
  // After LEAD-TO-PLAN, before PLAN-TO-EXEC
  PLAN_PHASE: ['DESIGN', 'STORIES', 'API', 'DATABASE'],
  // Before EXEC-TO-PLAN
  EXEC_PHASE: ['TESTING', 'UAT', 'VALIDATION', 'REGRESSION'],
  // After PLAN-TO-LEAD (universal)
  FINAL_PHASE: ['RETRO'],
  // Any phase
  ANY_PHASE: ['SECURITY', 'RISK', 'RCA', 'DOCMON', 'GITHUB']
};

/**
 * Upgrade a track to the next level
 * @param {string} currentTrack - Current track
 * @returns {string} Upgraded track
 */
function upgradeTrack(currentTrack) {
  return UPGRADE_PATH[currentTrack] || currentTrack;
}

/**
 * Select the appropriate execution track for an SD
 * @param {Object} sd - Strategic Directive object
 * @param {string} sd.sd_type - Type of the SD
 * @param {number} [sd.estimated_loc] - Estimated lines of code
 * @param {boolean} [sd.security_relevant] - Whether SD is security-relevant
 * @param {Array} [sd.categories] - SD categories for additional sub-agent requirements
 * @returns {Object} Track selection result
 */
function selectTrack(sd) {
  // Get base track from SD type
  let track = TRACK_MAP[sd.sd_type] || 'STANDARD';
  let escalationReason = null;

  // Scope-based ESCALATION (large changes force upgrade)
  if (sd.estimated_loc && sd.estimated_loc > 200) {
    const previousTrack = track;
    track = upgradeTrack(track);
    if (track !== previousTrack) {
      escalationReason = `LOC exceeds 200 (${sd.estimated_loc})`;
    }
  }

  // Security flag forces FULL
  if (sd.security_relevant && track !== 'FULL') {
    track = 'FULL';
    escalationReason = 'Security-relevant SD requires FULL track';
  }

  // Get track configuration
  const config = TRACK_CONFIG[track];

  // Get sub-agent requirements
  const subAgentReqs = getSubAgentRequirements(sd.sd_type, sd.categories || []);

  return {
    track,
    escalated: escalationReason !== null,
    escalationReason,
    config,
    subAgents: subAgentReqs,
    phases: config.phases,
    walls: config.walls
  };
}

/**
 * Get sub-agent requirements for an SD
 * @param {string} sdType - SD type
 * @param {Array} categories - SD categories
 * @returns {Object} Sub-agent requirements
 */
function getSubAgentRequirements(sdType, categories = []) {
  const typeReqs = SUBAGENT_REQUIREMENTS.byType[sdType] || { required: [], recommended: [] };

  // Start with type-based requirements
  const required = new Set(typeReqs.required);
  const recommended = new Set(typeReqs.recommended);

  // Add category-based requirements
  for (const category of categories) {
    const categoryAgents = SUBAGENT_REQUIREMENTS.byCategory[category] || [];
    for (const agent of categoryAgents) {
      if (!required.has(agent)) {
        required.add(agent);
      }
    }
  }

  return {
    required: Array.from(required),
    recommended: Array.from(recommended),
    timing: getSubAgentTiming(Array.from(required).concat(Array.from(recommended)))
  };
}

/**
 * Get timing information for sub-agents
 * @param {Array} agents - List of agent codes
 * @returns {Object} Timing map
 */
function getSubAgentTiming(agents) {
  const timing = {};

  for (const agent of agents) {
    if (SUBAGENT_TIMING.PLAN_PHASE.includes(agent)) {
      timing[agent] = { phase: 'PLAN', runAfter: 'LEAD-TO-PLAN', runBefore: 'PLAN-TO-EXEC' };
    } else if (SUBAGENT_TIMING.EXEC_PHASE.includes(agent)) {
      timing[agent] = { phase: 'EXEC', runAfter: 'PLAN-TO-EXEC', runBefore: 'EXEC-TO-PLAN' };
    } else if (SUBAGENT_TIMING.FINAL_PHASE.includes(agent)) {
      timing[agent] = { phase: 'FINAL', runAfter: 'PLAN-TO-LEAD', runBefore: null };
    } else {
      timing[agent] = { phase: 'ANY', runAfter: null, runBefore: null };
    }
  }

  return timing;
}

/**
 * Check if a track requires a specific phase
 * @param {string} track - Track name
 * @param {string} phase - Phase name
 * @returns {boolean} Whether the track requires the phase
 */
function trackRequiresPhase(track, phase) {
  const config = TRACK_CONFIG[track];
  return config ? config.phases.includes(phase) : false;
}

/**
 * Get the next phase for a track
 * @param {string} track - Track name
 * @param {string} currentPhase - Current phase
 * @returns {string|null} Next phase or null if at end
 */
function getNextPhase(track, currentPhase) {
  const config = TRACK_CONFIG[track];
  if (!config) return null;

  const currentIndex = config.phases.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex >= config.phases.length - 1) {
    return null;
  }

  return config.phases[currentIndex + 1];
}

/**
 * Get the handoff type for transitioning between phases
 * @param {string} fromPhase - Source phase
 * @param {string} toPhase - Target phase
 * @returns {string} Handoff type
 */
function getHandoffType(fromPhase, toPhase) {
  return `${fromPhase}-TO-${toPhase}`;
}

/**
 * Validate that an SD can use a specific track
 * @param {Object} sd - Strategic Directive
 * @param {string} requestedTrack - Requested track
 * @returns {Object} Validation result
 */
function validateTrackSelection(sd, requestedTrack) {
  const autoSelected = selectTrack(sd);

  // Can always use a higher governance track
  const trackOrder = ['HOTFIX', 'FAST', 'STANDARD', 'FULL'];
  const autoIndex = trackOrder.indexOf(autoSelected.track);
  const requestedIndex = trackOrder.indexOf(requestedTrack);

  if (requestedIndex < autoIndex) {
    return {
      valid: false,
      reason: `Cannot downgrade track from ${autoSelected.track} to ${requestedTrack}. SD type "${sd.sd_type}" requires minimum ${autoSelected.track} track.`,
      suggested: autoSelected.track
    };
  }

  return {
    valid: true,
    track: requestedTrack,
    config: TRACK_CONFIG[requestedTrack]
  };
}

export {
  selectTrack,
  upgradeTrack,
  getSubAgentRequirements,
  getSubAgentTiming,
  trackRequiresPhase,
  getNextPhase,
  getHandoffType,
  validateTrackSelection,
  TRACK_MAP,
  TRACK_CONFIG,
  SUBAGENT_REQUIREMENTS,
  SUBAGENT_TIMING
};
