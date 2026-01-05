/**
 * SD Auto-Classifier - Automatic SD Type Detection at Creation Time
 *
 * This helper should be used by all SD creation scripts to automatically
 * detect the correct sd_type based on title, scope, and description.
 *
 * Usage:
 *   import { autoClassifySD } from './lib/sd-auto-classifier.js';
 *   const sdData = autoClassifySD({ title, scope, description, ...otherFields });
 *   // sdData.sd_type is now auto-detected
 *
 * @module sd-auto-classifier
 * @version 1.0.0
 * LEO Protocol v4.3.3 improvement
 */

// Keyword patterns for fast classification (no API call needed)
const TYPE_PATTERNS = {
  // Order matters - more specific types first
  security: {
    keywords: ['auth', 'authentication', 'authorization', 'rls', 'permission',
               'role', 'vulnerability', 'jwt', 'session', 'oauth', 'rbac'],
    weight: 1.3  // Security gets highest priority
  },
  database: {
    keywords: ['schema', 'migration', 'table', 'column', 'index', 'postgres',
               'sql', 'trigger', 'rls policy', 'constraint', 'foreign key'],
    weight: 1.2
  },
  bugfix: {
    keywords: ['bug', 'fix', 'error', 'broken', 'crash', 'regression', 'issue', 'defect'],
    weight: 1.1
  },
  refactor: {
    keywords: ['refactor', 'restructure', 'cleanup', 'technical debt', 'consolidate',
               'extract', 'reorganize', 'simplify', 'decouple'],
    weight: 1.0
  },
  performance: {
    keywords: ['performance', 'optimize', 'cache', 'latency', 'bundle size',
               'speed', 'throughput', 'memory', 'cpu'],
    weight: 1.0
  },
  documentation: {
    // Enhanced to catch research/evaluation SDs
    keywords: ['documentation', 'docs', 'readme', 'guide', 'tutorial',
               'research', 'evaluation', 'analysis', 'triangulation',
               'assessment', 'audit', 'verdict', 'go/no-go', 'investigation',
               'comparison', 'study', 'report', 'findings'],
    weight: 1.0
  },
  infrastructure: {
    keywords: ['ci/cd', 'pipeline', 'github action', 'workflow', 'deploy',
               'docker', 'script', 'tooling', 'automation', 'devops', 'monitoring'],
    weight: 0.9
  },
  implementation: {
    keywords: ['api endpoint', 'backend', 'service layer', 'adapter',
               'implement api', 'rest api', 'graphql', 'existing frontend',
               'frontend already', 'backend only'],
    weight: 0.9
  },
  feature: {
    keywords: ['ui', 'component', 'page', 'form', 'dialog', 'dashboard',
               'frontend', 'react', 'stage', 'user interface', 'ux'],
    weight: 0.8  // Lowest priority - default fallback
  }
};

/**
 * Classify SD type based on text content
 * @param {string} text - Combined title + scope + description
 * @returns {Object} { type, confidence, matchedKeywords }
 */
function classifyFromText(text) {
  const lowerText = text.toLowerCase();
  let bestMatch = { type: 'feature', confidence: 30, matchedKeywords: [] };

  for (const [type, config] of Object.entries(TYPE_PATTERNS)) {
    const matchedKeywords = config.keywords.filter(kw => lowerText.includes(kw));

    if (matchedKeywords.length > 0) {
      // Score based on number of matches and weight
      const baseConfidence = Math.min(matchedKeywords.length / 3, 1) * 100;
      const weightedConfidence = Math.min(baseConfidence * config.weight, 100);

      if (weightedConfidence > bestMatch.confidence) {
        bestMatch = {
          type,
          confidence: Math.round(weightedConfidence),
          matchedKeywords
        };
      }
    }
  }

  return bestMatch;
}

/**
 * Auto-classify an SD and return it with sd_type set
 *
 * @param {Object} sd - SD data object
 * @param {string} sd.title - SD title
 * @param {string} sd.scope - SD scope
 * @param {string} sd.description - SD description
 * @param {string} [sd.sd_type] - Optional pre-set type (will be preserved if explicitly set)
 * @param {Object} options - Options
 * @param {boolean} options.forceReclassify - Force reclassification even if sd_type is set
 * @param {boolean} options.verbose - Log classification details
 * @returns {Object} SD with sd_type set
 */
export function autoClassifySD(sd, options = {}) {
  const { forceReclassify = false, verbose = false } = options;

  // If sd_type is already explicitly set and not 'feature' (default), preserve it
  if (sd.sd_type && sd.sd_type !== 'feature' && !forceReclassify) {
    if (verbose) {
      console.log(`ℹ️  SD type already set: ${sd.sd_type}`);
    }
    return sd;
  }

  // Combine text for classification
  const text = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`;
  const classification = classifyFromText(text);

  if (verbose) {
    console.log('🤖 Auto-classification result:');
    console.log(`   Type: ${classification.type}`);
    console.log(`   Confidence: ${classification.confidence}%`);
    console.log(`   Keywords: ${classification.matchedKeywords.join(', ')}`);
  }

  // Return SD with classified type
  return {
    ...sd,
    sd_type: classification.type,
    // Store classification metadata for auditing
    governance_metadata: {
      ...sd.governance_metadata,
      auto_classified: true,
      classification_confidence: classification.confidence,
      classification_keywords: classification.matchedKeywords,
      classified_at: new Date().toISOString()
    }
  };
}

/**
 * Get classification details without modifying SD
 * @param {Object} sd - SD data object
 * @returns {Object} Classification result
 */
export function getClassification(sd) {
  const text = `${sd.title || ''} ${sd.scope || ''} ${sd.description || ''}`;
  return classifyFromText(text);
}

export default { autoClassifySD, getClassification };
