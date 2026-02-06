/**
 * SD Type Detection for LEAD-TO-PLAN Verifier
 *
 * Auto-detects SD type based on scope, title, and description keywords.
 *
 * Extracted from scripts/verify-handoff-lead-to-plan.js for maintainability.
 * Part of SD-LEO-REFACTOR-HANDOFF-001
 */

/**
 * Keyword patterns for each SD type (ordered by specificity)
 */
export const TYPE_PATTERNS = {
  security: {
    keywords: ['auth', 'authentication', 'authorization', 'rls', 'row level security',
               'permission', 'role', 'rbac', 'vulnerability', 'cve', 'owasp',
               'encryption', 'credential', 'secret', 'token', 'jwt', 'session'],
    weight: 1.2 // Higher weight for security (specific domain)
  },
  database: {
    keywords: ['schema', 'migration', 'table', 'column', 'index', 'postgres', 'supabase',
               'sql', 'query', 'rls policy', 'foreign key', 'constraint', 'trigger',
               'stored procedure', 'function', 'view', 'materialized'],
    weight: 1.1
  },
  infrastructure: {
    keywords: ['ci/cd', 'pipeline', 'github action', 'workflow', 'deploy', 'docker',
               'script', 'tooling', 'automation', 'build', 'bundle', 'lint', 'prettier',
               'eslint', 'pre-commit', 'hook', 'protocol', 'handoff', 'agent system',
               'mcp', 'leo protocol', 'devops', 'monitoring', 'logging'],
    weight: 1.0
  },
  documentation: {
    keywords: ['documentation', 'docs', 'readme', 'guide', 'tutorial', 'comment',
               'jsdoc', 'api doc', 'changelog', 'contributing', 'onboarding'],
    weight: 0.9 // Lower weight - easily confused with other types
  },
  uat: {
    keywords: ['uat', 'user acceptance', 'acceptance testing', 'test campaign',
               'manual test', 'test execution', 'test scenarios', 'test plan'],
    weight: 1.1  // Renamed from qa: UAT-specific keywords
  },
  bugfix: {
    keywords: ['bug', 'fix', 'error', 'issue', 'broken', 'crash', 'regression',
               'hotfix', 'patch', 'resolve', 'repair'],
    weight: 1.0
  },
  refactor: {
    keywords: ['refactor', 'restructure', 'reorganize', 'cleanup', 'technical debt',
               'code quality', 'architecture', 'modularize', 'extract', 'simplify'],
    weight: 1.0
  },
  performance: {
    keywords: ['performance', 'optimize', 'speed', 'latency', 'cache', 'memory',
               'cpu', 'load time', 'bundle size', 'lazy load', 'memoize', 'index'],
    weight: 1.0
  },
  feature: {
    keywords: ['feature', 'ui', 'component', 'page', 'form', 'dialog', 'modal',
               'dashboard', 'button', 'input', 'frontend', 'react', 'user interface',
               'ux', 'user experience', 'screen', 'view', 'layout', 'stage'],
    weight: 0.8 // Lower weight - default fallback
  }
};

/**
 * Auto-detect SD type based on scope, title, and description keywords
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {Object} - { type: string, confidence: number (0-1), matchedKeywords: string[] }
 */
export function autoDetectSdType(sd) {
  const text = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  let bestMatch = { type: 'feature', confidence: 0, matchedKeywords: [] };

  for (const [type, config] of Object.entries(TYPE_PATTERNS)) {
    const matchedKeywords = config.keywords.filter(kw => text.includes(kw));

    if (matchedKeywords.length > 0) {
      // Calculate confidence based on matches and weight
      const baseConfidence = Math.min(matchedKeywords.length / 3, 1); // Cap at 3 keywords = 100%
      const weightedConfidence = baseConfidence * config.weight;

      if (weightedConfidence > bestMatch.confidence) {
        bestMatch = {
          type,
          confidence: Math.min(weightedConfidence, 1), // Cap at 1.0
          matchedKeywords
        };
      }
    }
  }

  // If no strong match, default to feature with low confidence
  if (bestMatch.confidence < 0.3) {
    bestMatch = {
      type: 'feature',
      confidence: 0.3,
      matchedKeywords: ['(default - no strong keyword matches)']
    };
  }

  return bestMatch;
}

/**
 * Validate sd_type classification matches actual content
 *
 * @param {Object} sd - Strategic Directive object
 * @returns {string[]} - Array of warnings
 */
export function validateSdTypeClassification(sd) {
  const warnings = [];

  if (sd.sd_type && sd.scope) {
    const detectedType = autoDetectSdType(sd);

    if (detectedType.type !== sd.sd_type && detectedType.confidence >= 0.70) {
      const confidencePercent = Math.round(detectedType.confidence * 100);
      warnings.push(
        `sd_type is '${sd.sd_type}' but scope suggests '${detectedType.type}' (${confidencePercent}% confidence). ` +
        `Matched keywords: ${detectedType.matchedKeywords.join(', ')}. ` +
        'Verify sd_type is correct - wrong classification affects validation requirements.'
      );
    }
  }

  return warnings;
}
