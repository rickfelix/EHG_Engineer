/**
 * Handoff Validation Module
 * Extracted from verify-handoff-lead-to-plan.js for modularity
 *
 * Part of SD-REFACTOR-2025-001-P2-003: verify-handoff-lead-to-plan Refactoring
 *
 * Contains SD type detection and feasibility validation logic.
 * @module HandoffValidation
 * @version 1.0.0
 */

// =============================================================================
// SD REQUIREMENTS
// =============================================================================

/**
 * Strategic Directive Quality Requirements (LEO Protocol v4.3.3)
 */
export const SD_REQUIREMENTS = {
  minimumScore: 90,
  requiredFields: [
    'title',
    'description',
    'scope',
    'strategic_objectives',
    'key_principles',
    'priority'
  ],
  alternateFields: {
    success_metrics: 'success_criteria'
  },
  minimumObjectives: 2,
  minimumMetrics: 3,
  minimumConstraints: 1
};

// =============================================================================
// SD TYPE DETECTION
// =============================================================================

/**
 * Keyword patterns for each SD type
 */
export const TYPE_PATTERNS = {
  security: {
    keywords: ['auth', 'authentication', 'authorization', 'rls', 'row level security',
               'permission', 'role', 'rbac', 'vulnerability', 'cve', 'owasp',
               'encryption', 'credential', 'secret', 'token', 'jwt', 'session'],
    weight: 1.2
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
    weight: 0.9
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
    weight: 0.8
  }
};

/**
 * Auto-detect SD type based on scope, title, and description keywords
 * @param {Object} sd - Strategic Directive
 * @returns {Object} { type: string, confidence: number, matchedKeywords: string[] }
 */
export function autoDetectSdType(sd) {
  const text = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`.toLowerCase();

  let bestMatch = { type: 'feature', confidence: 0, matchedKeywords: [] };

  for (const [type, config] of Object.entries(TYPE_PATTERNS)) {
    const matchedKeywords = config.keywords.filter(kw => text.includes(kw));

    if (matchedKeywords.length > 0) {
      const baseConfidence = Math.min(matchedKeywords.length / 3, 1);
      const weightedConfidence = baseConfidence * config.weight;

      if (weightedConfidence > bestMatch.confidence) {
        bestMatch = {
          type,
          confidence: Math.min(weightedConfidence, 1),
          matchedKeywords
        };
      }
    }
  }

  // Default to feature with low confidence if no strong match
  if (bestMatch.confidence < 0.3) {
    bestMatch = {
      type: 'feature',
      confidence: 0.3,
      matchedKeywords: ['(default - no strong keyword matches)']
    };
  }

  return bestMatch;
}

// =============================================================================
// FEASIBILITY VALIDATION
// =============================================================================

/**
 * Validate strategic feasibility
 * @param {Object} sd - Strategic Directive
 * @returns {Object} { passed: boolean, issues: string[] }
 */
export function validateFeasibility(sd) {
  const check = {
    passed: true,
    issues: []
  };

  // Check for unrealistic timelines in key principles
  if (sd.key_principles) {
    try {
      const principles = typeof sd.key_principles === 'string'
        ? JSON.parse(sd.key_principles)
        : sd.key_principles;

      const timelineConstraint = Array.isArray(principles)
        ? principles.find(c => c.type === 'timeline' || c.title?.toLowerCase().includes('time'))
        : null;

      if (timelineConstraint && timelineConstraint.value) {
        const timeline = timelineConstraint.value.toLowerCase();
        if (timeline.includes('1 day') || timeline.includes('immediate')) {
          check.issues.push('Timeline constraint may be unrealistic for comprehensive implementation');
        }
      }
    } catch (e) {
      // Ignore JSON parsing errors for feasibility check
    }
  }

  // Check priority vs complexity alignment
  if (sd.priority === 'LOW' && sd.description?.length > 500) {
    check.issues.push('Low priority directive with high complexity description - consider priority adjustment');
  }

  // Validate risk mitigation
  if (sd.risks) {
    try {
      const risks = typeof sd.risks === 'string' ? JSON.parse(sd.risks) : sd.risks;
      if (Array.isArray(risks)) {
        const highRisks = risks.filter(r => r.level === 'HIGH' || r.severity === 'HIGH');
        const withMitigation = highRisks.filter(r => r.mitigation || r.response);

        if (highRisks.length > 0 && withMitigation.length < highRisks.length) {
          check.issues.push('High-risk items lack mitigation strategies');
        }
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }
  }

  // Only fail for critical feasibility issues
  if (check.issues.some(issue => issue.includes('unrealistic') || issue.includes('lack mitigation'))) {
    check.passed = false;
  }

  return check;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  SD_REQUIREMENTS,
  TYPE_PATTERNS,
  autoDetectSdType,
  validateFeasibility
};
