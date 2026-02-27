/**
 * Content-Based Rubric for SD Type Classification
 *
 * Analyzes SD content dimensions (scope deliverables, key_changes,
 * success_criteria, PRD content) to produce a structured type recommendation.
 *
 * Each dimension scores 0-100 and maps to an SD type signal.
 * Used as a secondary signal alongside LLM classification in SDTypeClassifier.
 *
 * @module sd-type-content-rubric
 * @version 1.0.0
 * @sd SD-LEO-INFRA-TYPE-CONTENT-BASED-001
 */

// Type signal patterns - keywords that indicate specific SD types
const TYPE_SIGNALS = {
  feature: {
    scope: ['ui', 'component', 'page', 'form', 'dialog', 'dashboard', 'frontend', 'react', 'button', 'modal', 'sidebar', 'navigation', 'user-facing', 'user interface'],
    keyChanges: ['build component', 'create page', 'add form', 'implement ui', 'design layout', 'add route', 'frontend', 'react component'],
    prdIndicators: ['ui_ux_requirements', 'api_specifications']
  },
  implementation: {
    scope: ['api endpoint', 'backend', 'service layer', 'adapter', 'rest api', 'graphql', 'existing frontend', 'server-side'],
    keyChanges: ['implement api', 'add endpoint', 'create service', 'build adapter', 'backend integration'],
    prdIndicators: ['api_specifications']
  },
  infrastructure: {
    scope: ['script', 'tooling', 'ci/cd', 'pipeline', 'automation', 'workflow', 'deploy', 'build tool', 'cli', 'protocol', 'handoff', 'gate', 'validator', 'hook'],
    keyChanges: ['add script', 'create tool', 'update pipeline', 'automate', 'build workflow', 'enhance gate', 'add validator', 'update hook'],
    prdIndicators: []
  },
  database: {
    scope: ['schema', 'migration', 'table', 'column', 'index', 'rls', 'trigger', 'stored procedure', 'postgres', 'supabase'],
    keyChanges: ['create table', 'add column', 'add index', 'create migration', 'alter table', 'add trigger', 'rls policy'],
    prdIndicators: ['data_model']
  },
  security: {
    scope: ['auth', 'authentication', 'authorization', 'rls', 'permission', 'role', 'vulnerability', 'jwt', 'session', 'csrf', 'xss', 'owasp'],
    keyChanges: ['implement auth', 'add rls', 'fix vulnerability', 'secure endpoint', 'add permission'],
    prdIndicators: []
  },
  documentation: {
    scope: ['documentation', 'docs', 'readme', 'guide', 'tutorial', 'reference', 'research', 'evaluation', 'analysis', 'audit'],
    keyChanges: ['write docs', 'update readme', 'create guide', 'document api', 'add tutorial'],
    prdIndicators: []
  },
  bugfix: {
    scope: ['bug', 'fix', 'error', 'broken', 'crash', 'regression', 'not working', 'failing'],
    keyChanges: ['fix bug', 'resolve error', 'patch', 'correct behavior', 'fix regression'],
    prdIndicators: []
  },
  refactor: {
    scope: ['refactor', 'restructure', 'cleanup', 'simplify', 'extract', 'technical debt', 'reorganize'],
    keyChanges: ['refactor', 'extract module', 'simplify', 'restructure', 'reduce complexity'],
    prdIndicators: []
  },
  performance: {
    scope: ['optimize', 'performance', 'cache', 'latency', 'bundle size', 'load time', 'lighthouse', 'core web vitals'],
    keyChanges: ['optimize query', 'add cache', 'reduce bundle', 'improve load time', 'optimize performance'],
    prdIndicators: []
  }
};

/**
 * Score how well SD scope matches a given type's signal patterns
 * @param {string} text - Combined text to analyze
 * @param {string[]} patterns - Pattern keywords to match
 * @returns {number} Score 0-100
 */
function scorePatternMatch(text, patterns) {
  if (!text || !patterns.length) return 0;
  const normalizedText = text.toLowerCase();
  const matches = patterns.filter(p => normalizedText.includes(p.toLowerCase()));
  // Score: proportion of patterns matched, scaled to 100
  // At least 1 match = 30, 2 = 50, 3+ = 70+
  if (matches.length === 0) return 0;
  if (matches.length === 1) return 30;
  if (matches.length === 2) return 50;
  return Math.min(100, 50 + matches.length * 10);
}

export class ContentBasedRubric {
  /**
   * Score an SD across all type dimensions
   *
   * @param {Object} sd - Strategic Directive object
   * @param {string} sd.title - SD title
   * @param {string} sd.scope - SD scope
   * @param {string} sd.description - SD description
   * @param {Array} sd.key_changes - Array of key change strings
   * @param {Array} sd.success_criteria - Array of success criteria strings
   * @param {string} sd.sd_type - Currently declared type
   * @param {Object} [prd] - Optional PRD object from product_requirements_v2
   * @returns {Object} Rubric result with scores per type and recommendation
   */
  score(sd, prd = null) {
    const scopeText = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`;
    const keyChangesText = Array.isArray(sd.key_changes) ? sd.key_changes.join(' ') : '';
    const combinedText = `${scopeText} ${keyChangesText}`;

    const typeScores = {};

    for (const [type, signals] of Object.entries(TYPE_SIGNALS)) {
      const scopeScore = scorePatternMatch(scopeText, signals.scope);
      const keyChangesScore = scorePatternMatch(keyChangesText, signals.keyChanges);
      const prdScore = prd ? this._scorePRDIndicators(prd, signals.prdIndicators) : 0;

      // Weighted average: scope 50%, key_changes 30%, PRD 20%
      const weighted = Math.round(
        scopeScore * 0.5 +
        keyChangesScore * 0.3 +
        prdScore * 0.2
      );

      typeScores[type] = {
        scope: scopeScore,
        keyChanges: keyChangesScore,
        prd: prdScore,
        total: weighted
      };
    }

    // Find the top recommendation
    const sorted = Object.entries(typeScores)
      .sort((a, b) => b[1].total - a[1].total);

    const topType = sorted[0];
    const runnerUp = sorted[1];

    return {
      recommendedType: topType[0],
      confidence: topType[1].total,
      runnerUpType: runnerUp[0],
      runnerUpConfidence: runnerUp[1].total,
      scores: typeScores,
      source: 'content_rubric'
    };
  }

  /**
   * Score PRD content indicators for a type
   * @param {Object} prd - PRD object
   * @param {string[]} indicators - Field names that indicate this type
   * @returns {number} Score 0-100
   */
  _scorePRDIndicators(prd, indicators) {
    if (!indicators.length) return 0;

    let score = 0;
    for (const field of indicators) {
      const value = prd[field];
      if (value) {
        if (Array.isArray(value) && value.length > 0) score += 50;
        else if (typeof value === 'object' && Object.keys(value).length > 0) score += 50;
        else if (typeof value === 'string' && value.length > 10) score += 50;
      }
    }

    return Math.min(100, score);
  }
}

export default ContentBasedRubric;
