/**
 * SD Context Loader
 * SD-PLAN-MODE-003 - Intelligent Plan Mode Integration
 *
 * Loads SD context from database to generate intelligent, type-aware plans.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

/**
 * SD Type definitions with workflow characteristics
 */
export const SD_TYPE_PROFILES = {
  feature: {
    name: 'Feature',
    description: 'New functionality or capability',
    workflow: 'full', // Full LEAD→PLAN→EXEC→VERIFY flow
    requiresPRD: true,
    requiresSubAgents: ['RISK', 'VALIDATION', 'STORIES'],
    testingLevel: 'comprehensive',
    prSizeTarget: 100,
    prSizeMax: 400
  },
  enhancement: {
    name: 'Enhancement',
    description: 'Improvement to existing functionality',
    workflow: 'standard',
    requiresPRD: true,
    requiresSubAgents: ['VALIDATION'],
    testingLevel: 'standard',
    prSizeTarget: 75,
    prSizeMax: 200
  },
  bug: {
    name: 'Bug Fix',
    description: 'Fix for existing defect',
    workflow: 'fast', // Streamlined flow
    requiresPRD: false,
    requiresSubAgents: ['RCA'],
    testingLevel: 'regression',
    prSizeTarget: 50,
    prSizeMax: 100
  },
  infrastructure: {
    name: 'Infrastructure',
    description: 'DevOps, CI/CD, tooling changes',
    workflow: 'careful', // Extra verification
    requiresPRD: true,
    requiresSubAgents: ['RISK', 'GITHUB', 'REGRESSION'],
    testingLevel: 'comprehensive',
    prSizeTarget: 50,
    prSizeMax: 150
  },
  documentation: {
    name: 'Documentation',
    description: 'Documentation updates',
    workflow: 'light', // Minimal EXEC
    requiresPRD: false,
    requiresSubAgents: ['DOCMON'],
    testingLevel: 'minimal',
    prSizeTarget: null, // No limit for docs
    prSizeMax: null
  },
  refactor: {
    name: 'Refactor',
    description: 'Code restructuring without behavior change',
    workflow: 'careful',
    requiresPRD: true,
    requiresSubAgents: ['REGRESSION', 'VALIDATION'],
    testingLevel: 'comprehensive',
    prSizeTarget: 100,
    prSizeMax: 300
  },
  security: {
    name: 'Security',
    description: 'Security fix or improvement',
    workflow: 'careful',
    requiresPRD: true,
    requiresSubAgents: ['SECURITY', 'RISK'],
    testingLevel: 'comprehensive',
    prSizeTarget: 50,
    prSizeMax: 150
  },
  uat: {
    name: 'UAT',
    description: 'User acceptance testing',
    workflow: 'testing',
    requiresPRD: false,
    requiresSubAgents: ['UAT', 'TESTING'],
    testingLevel: 'uat',
    prSizeTarget: null,
    prSizeMax: null
  }
};

/**
 * Complexity level profiles
 */
export const COMPLEXITY_PROFILES = {
  simple: {
    riskLevel: 'low',
    reviewRequired: false,
    subAgentDepth: 'shallow',
    planDetail: 'minimal'
  },
  moderate: {
    riskLevel: 'medium',
    reviewRequired: true,
    subAgentDepth: 'standard',
    planDetail: 'standard'
  },
  complex: {
    riskLevel: 'high',
    reviewRequired: true,
    subAgentDepth: 'deep',
    planDetail: 'comprehensive'
  }
};

/**
 * Create Supabase client for database access
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key);
}

/**
 * Load SD context from database
 */
export async function loadSDContext(sdId) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return {
      success: false,
      error: 'Database not configured',
      sd: createFallbackContext(sdId)
    };
  }

  try {
    // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
    // Try id first, then sd_key
    let { data, error } = await supabase
      .from('strategic_directives_v2')
      .select(`
        id,
        sd_key,
        title,
        description,
        rationale,
        scope,
        key_changes,
        status,
        current_phase,
        sd_type,
        complexity_level,
        priority,
        success_criteria,
        dependencies,
        risks,
        metadata,
        progress_percentage,
        parent_sd_id
      `)
      .or(`id.ilike.%${sdId}%,sd_key.ilike.%${sdId}%`)
      .limit(1)
      .single();

    if (error || !data) {
      // Try partial match on title
      const titleResult = await supabase
        .from('strategic_directives_v2')
        .select('*')
        .ilike('title', `%${sdId.replace(/SD-/i, '').replace(/-/g, '%')}%`)
        .limit(1)
        .single();

      if (titleResult.data) {
        data = titleResult.data;
      } else {
        return {
          success: false,
          error: 'SD not found',
          sd: createFallbackContext(sdId)
        };
      }
    }

    // Enrich with type profile
    const typeProfile = SD_TYPE_PROFILES[data.sd_type] || SD_TYPE_PROFILES.feature;
    const complexityProfile = COMPLEXITY_PROFILES[data.complexity_level] || COMPLEXITY_PROFILES.moderate;

    return {
      success: true,
      sd: {
        // SD-LEO-GEN-RENAME-COLUMNS-SELF-001-D1: Removed legacy_id (column dropped 2026-01-24)
        id: data.sd_key || data.id || sdId,
        title: data.title,
        description: data.description,
        rationale: data.rationale,
        scope: data.scope,
        keyChanges: Array.isArray(data.key_changes) ? data.key_changes : [],
        status: data.status,
        currentPhase: data.current_phase,
        type: data.sd_type || 'feature',
        typeProfile,
        complexity: data.complexity_level || 'moderate',
        complexityProfile,
        priority: data.priority,
        successCriteria: data.success_criteria || [],
        dependencies: data.dependencies || [],
        risks: data.risks || [],
        progress: data.progress_percentage || 0,
        hasParent: !!data.parent_sd_id,
        metadata: data.metadata || {}
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      sd: createFallbackContext(sdId)
    };
  }
}

/**
 * Create fallback context when database is unavailable
 */
function createFallbackContext(sdId) {
  // Infer type from SD ID pattern
  const idLower = sdId.toLowerCase();
  let inferredType = 'feature';

  if (idLower.includes('bug') || idLower.includes('fix')) {
    inferredType = 'bug';
  } else if (idLower.includes('doc')) {
    inferredType = 'documentation';
  } else if (idLower.includes('infra') || idLower.includes('ci') || idLower.includes('cd')) {
    inferredType = 'infrastructure';
  } else if (idLower.includes('refactor')) {
    inferredType = 'refactor';
  } else if (idLower.includes('security') || idLower.includes('auth')) {
    inferredType = 'security';
  } else if (idLower.includes('uat') || idLower.includes('test')) {
    inferredType = 'uat';
  } else if (idLower.includes('enhance') || idLower.includes('improve')) {
    inferredType = 'enhancement';
  }

  const typeProfile = SD_TYPE_PROFILES[inferredType];

  return {
    id: sdId,
    title: sdId,
    description: null,
    type: inferredType,
    typeProfile,
    complexity: 'moderate',
    complexityProfile: COMPLEXITY_PROFILES.moderate,
    fromFallback: true
  };
}

/**
 * Get recommended sub-agents for an SD
 */
export function getRecommendedSubAgents(sdContext) {
  const agents = new Set();

  // Add type-specific agents
  if (sdContext.typeProfile?.requiresSubAgents) {
    sdContext.typeProfile.requiresSubAgents.forEach(a => agents.add(a));
  }

  // Add complexity-based agents
  if (sdContext.complexityProfile?.riskLevel === 'high') {
    agents.add('RISK');
  }

  // Add based on keywords in description/scope
  const text = `${sdContext.description || ''} ${sdContext.scope || ''}`.toLowerCase();

  if (text.includes('database') || text.includes('schema') || text.includes('migration')) {
    agents.add('DATABASE');
  }
  if (text.includes('api') || text.includes('endpoint') || text.includes('rest')) {
    agents.add('API');
  }
  if (text.includes('ui') || text.includes('component') || text.includes('design')) {
    agents.add('DESIGN');
  }
  if (text.includes('performance') || text.includes('optimize')) {
    agents.add('PERFORMANCE');
  }
  if (text.includes('security') || text.includes('auth') || text.includes('permission')) {
    agents.add('SECURITY');
  }

  return Array.from(agents);
}

/**
 * Determine workflow intensity for an SD
 */
export function getWorkflowIntensity(sdContext) {
  const workflow = sdContext.typeProfile?.workflow || 'standard';
  const complexity = sdContext.complexity || 'moderate';

  const intensityMatrix = {
    'fast-simple': 'minimal',
    'fast-moderate': 'light',
    'fast-complex': 'standard',
    'light-simple': 'minimal',
    'light-moderate': 'light',
    'light-complex': 'standard',
    'standard-simple': 'light',
    'standard-moderate': 'standard',
    'standard-complex': 'comprehensive',
    'full-simple': 'standard',
    'full-moderate': 'comprehensive',
    'full-complex': 'exhaustive',
    'careful-simple': 'standard',
    'careful-moderate': 'comprehensive',
    'careful-complex': 'exhaustive',
    'testing-simple': 'testing-light',
    'testing-moderate': 'testing-standard',
    'testing-complex': 'testing-comprehensive'
  };

  return intensityMatrix[`${workflow}-${complexity}`] || 'standard';
}

export default {
  loadSDContext,
  getRecommendedSubAgents,
  getWorkflowIntensity,
  SD_TYPE_PROFILES,
  COMPLEXITY_PROFILES
};
