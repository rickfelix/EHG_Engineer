/**
 * Route Context Resolver
 * SD-MAN-GEN-INTELLIGENT-ROUTE-AWARE-001 - FR-1, FR-2
 *
 * Purpose: Fetch route development status from nav_routes and nav_preferences
 * to annotate UAT output with route context for intelligent test prioritization.
 *
 * Features:
 * - Fetches route maturity status (draft/development/complete)
 * - Applies nav_preferences filters for route selection
 * - Annotates UAT scenarios with route context
 * - Supports persona-based route filtering
 */

import { createSupabaseServiceClient } from '../../scripts/lib/supabase-connection.js';

let supabase = null;

/**
 * Initialize Supabase client
 * @returns {Promise<Object>} Supabase client
 */
async function getClient() {
  if (!supabase) {
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  }
  return supabase;
}

/**
 * Route maturity levels with testing priority
 */
export const MATURITY_PRIORITY = {
  draft: { priority: 1, label: 'Draft', testingFocus: 'exploratory' },
  development: { priority: 2, label: 'Development', testingFocus: 'regression' },
  complete: { priority: 3, label: 'Complete', testingFocus: 'smoke' }
};

/**
 * Fetch all routes with their development status
 * @param {Object} options - Fetch options
 * @param {string} options.section - Filter by section
 * @param {string} options.maturity - Filter by maturity
 * @param {boolean} options.enabledOnly - Only return enabled routes
 * @returns {Promise<Object>} Routes with status
 */
export async function fetchRoutes(options = {}) {
  const client = await getClient();
  const { section, maturity, enabledOnly = true } = options;

  let query = client
    .from('nav_routes')
    .select('id, path, title, description, section, maturity, is_enabled, personas, persona_priority, venture_stage, sort_index')
    .order('section')
    .order('sort_index');

  if (section) {
    query = query.eq('section', section);
  }

  if (maturity) {
    query = query.eq('maturity', maturity);
  }

  if (enabledOnly) {
    query = query.eq('is_enabled', true);
  }

  const { data: routes, error } = await query;

  if (error) {
    console.error('[RouteContextResolver] Error fetching routes:', error.message);
    return { routes: [], error: error.message };
  }

  // Group by maturity for summary
  const summary = {
    total: routes.length,
    byMaturity: {
      draft: routes.filter(r => r.maturity === 'draft').length,
      development: routes.filter(r => r.maturity === 'development').length,
      complete: routes.filter(r => r.maturity === 'complete').length
    },
    bySection: {}
  };

  // Group by section
  for (const route of routes) {
    if (!summary.bySection[route.section]) {
      summary.bySection[route.section] = [];
    }
    summary.bySection[route.section].push(route);
  }

  return { routes, summary, error: null };
}

/**
 * Fetch user navigation preferences
 * @param {string} userId - User ID (optional, uses current session if not provided)
 * @returns {Promise<Object>} User preferences
 */
export async function fetchNavPreferences(userId = null) {
  const client = await getClient();

  let query = client
    .from('nav_preferences')
    .select('*');

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data: preferences, error } = await query.maybeSingle();

  if (error) {
    console.error('[RouteContextResolver] Error fetching preferences:', error.message);
    return {
      preferences: getDefaultPreferences(),
      isDefault: true,
      error: error.message
    };
  }

  if (!preferences) {
    return {
      preferences: getDefaultPreferences(),
      isDefault: true,
      error: null
    };
  }

  return {
    preferences,
    isDefault: false,
    error: null
  };
}

/**
 * Get default navigation preferences
 * @returns {Object} Default preferences
 */
function getDefaultPreferences() {
  return {
    default_maturity: 'complete',
    show_draft: true,
    show_development: true,
    show_complete: true
  };
}

/**
 * Filter routes based on user preferences
 * @param {Array} routes - Routes to filter
 * @param {Object} preferences - User preferences
 * @returns {Array} Filtered routes
 */
export function applyPreferencesFilter(routes, preferences) {
  return routes.filter(route => {
    if (route.maturity === 'draft' && !preferences.show_draft) return false;
    if (route.maturity === 'development' && !preferences.show_development) return false;
    if (route.maturity === 'complete' && !preferences.show_complete) return false;
    return true;
  });
}

/**
 * Get route context for a specific path
 * @param {string} path - Route path to lookup
 * @returns {Promise<Object>} Route context
 */
export async function getRouteContext(path) {
  const client = await getClient();

  const { data: route, error } = await client
    .from('nav_routes')
    .select('*')
    .eq('path', path)
    .single();

  if (error || !route) {
    return {
      found: false,
      path,
      error: error?.message || 'Route not found'
    };
  }

  const maturityInfo = MATURITY_PRIORITY[route.maturity] || MATURITY_PRIORITY.complete;

  return {
    found: true,
    path: route.path,
    title: route.title,
    description: route.description,
    section: route.section,
    maturity: route.maturity,
    maturityLabel: maturityInfo.label,
    testingFocus: maturityInfo.testingFocus,
    personas: route.personas,
    isEnabled: route.is_enabled,
    error: null
  };
}

/**
 * Annotate UAT scenarios with route context
 * @param {Array} scenarios - UAT scenarios
 * @param {Object} _options - Annotation options (for future use)
 * @returns {Promise<Array>} Annotated scenarios
 */
export async function annotateWithRouteContext(scenarios, _options = {}) {
  const { routes: allRoutes } = await fetchRoutes();

  // Create path lookup map
  const routeMap = new Map();
  for (const route of allRoutes) {
    routeMap.set(route.path, route);
  }

  // Annotate each scenario
  const annotated = scenarios.map(scenario => {
    // Try to match scenario to a route (if scenario has path info)
    let routeContext = null;

    // Check if scenario has a URL/path hint
    const pathHint = extractPathFromScenario(scenario);
    if (pathHint && routeMap.has(pathHint)) {
      const route = routeMap.get(pathHint);
      const maturityInfo = MATURITY_PRIORITY[route.maturity];
      routeContext = {
        path: route.path,
        title: route.title,
        maturity: route.maturity,
        maturityLabel: maturityInfo.label,
        testingFocus: maturityInfo.testingFocus,
        section: route.section
      };
    }

    return {
      ...scenario,
      routeContext,
      hasRouteContext: !!routeContext
    };
  });

  return annotated;
}

/**
 * Extract path from scenario description
 * @param {Object} scenario - UAT scenario
 * @returns {string|null} Extracted path or null
 */
function extractPathFromScenario(scenario) {
  // Look for URL patterns in various scenario fields
  const textToSearch = [
    scenario.given,
    scenario.when,
    scenario.then,
    scenario.description,
    scenario.steps?.join(' ')
  ].filter(Boolean).join(' ');

  // Match paths like /dashboard, /settings/profile, etc.
  const pathMatch = textToSearch.match(/(?:navigate to|visit|go to|on)\s+(?:.*?)(\/[a-z0-9-/]+)/i);
  if (pathMatch) {
    return pathMatch[1];
  }

  // Match localhost URLs
  const urlMatch = textToSearch.match(/localhost:\d+(\/?[a-z0-9-/]*)/i);
  if (urlMatch) {
    return urlMatch[1] || '/';
  }

  return null;
}

/**
 * Get route development summary for UAT report header
 * @returns {Promise<Object>} Development summary
 */
export async function getRouteDevelopmentSummary() {
  const { routes, summary } = await fetchRoutes();

  // Calculate percentages
  const total = summary.total || 1;
  const completionRate = Math.round((summary.byMaturity.complete / total) * 100);
  const developmentRate = Math.round((summary.byMaturity.development / total) * 100);
  const draftRate = Math.round((summary.byMaturity.draft / total) * 100);

  // Find routes that need attention (draft or development)
  const needsAttention = routes
    .filter(r => r.maturity !== 'complete')
    .map(r => ({
      path: r.path,
      title: r.title,
      maturity: r.maturity,
      section: r.section
    }));

  return {
    total: summary.total,
    complete: summary.byMaturity.complete,
    development: summary.byMaturity.development,
    draft: summary.byMaturity.draft,
    completionRate,
    developmentRate,
    draftRate,
    needsAttention,
    sections: Object.keys(summary.bySection)
  };
}

/**
 * Prioritize scenarios based on route maturity
 * Routes in development/draft get higher priority for testing
 * @param {Array} scenarios - Annotated scenarios
 * @returns {Array} Prioritized scenarios
 */
export function prioritizeByRouteMaturity(scenarios) {
  return [...scenarios].sort((a, b) => {
    // Scenarios with route context come first
    if (a.hasRouteContext && !b.hasRouteContext) return -1;
    if (!a.hasRouteContext && b.hasRouteContext) return 1;

    // If both have context, sort by maturity (draft first, complete last)
    if (a.routeContext && b.routeContext) {
      const aPriority = MATURITY_PRIORITY[a.routeContext.maturity]?.priority || 3;
      const bPriority = MATURITY_PRIORITY[b.routeContext.maturity]?.priority || 3;
      return aPriority - bPriority;
    }

    return 0;
  });
}

export default {
  fetchRoutes,
  fetchNavPreferences,
  applyPreferencesFilter,
  getRouteContext,
  annotateWithRouteContext,
  getRouteDevelopmentSummary,
  prioritizeByRouteMaturity,
  MATURITY_PRIORITY
};
