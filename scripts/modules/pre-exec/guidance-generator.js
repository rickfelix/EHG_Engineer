/**
 * GuidanceGenerator Module
 * SD-PRE-EXEC-ANALYSIS-001
 *
 * Purpose: Generate actionable implementation guidance for EXEC agents
 */

export class GuidanceGenerator {
  /**
   * Generate implementation guidance
   * @param {Object} discoveredFiles - Files from FileDiscoveryEngine
   * @param {Object} patterns - Patterns from PatternRecognizer
   * @param {Object} dependencies - Dependencies from DependencyAnalyzer
   * @returns {Object} Implementation guidance
   */
  generate(discoveredFiles, patterns, dependencies) {
    const guidance = {
      reusable_utilities: this.identifyReusableUtilities(patterns.existing_utilities, dependencies),
      avoid_reinventing: this.generateReinventionWarnings(patterns.existing_utilities),
      recommended_approach: this.suggestApproach(patterns.architecture_style),
      example_patterns: this.extractExamplePatterns(discoveredFiles, patterns)
    };

    return guidance;
  }

  /**
   * Identify utilities to reuse
   * @param {Array} utilities - Discovered utilities
   * @param {Object} dependencies - Dependency analysis
   * @returns {Array} Utilities with recommendations
   */
  identifyReusableUtilities(utilities, _dependencies) {
    return utilities.map(util => ({
      path: util.path,
      name: util.name,
      category: util.category,
      recommendation: `Consider using ${util.name} from ${util.path}`
    }));
  }

  /**
   * Generate warnings against reinventing existing solutions
   * @param {Array} utilities - Discovered utilities
   * @returns {Array} Warnings
   */
  generateReinventionWarnings(utilities) {
    const warnings = [];

    // Check for common patterns
    const hasToast = utilities.some(u => u.name.includes('toast') || u.name.includes('Toast'));
    if (hasToast) {
      warnings.push('Toast system already exists - use existing instead of creating new');
    }

    const hasAuth = utilities.some(u => u.name.includes('auth') || u.name.includes('Auth'));
    if (hasAuth) {
      warnings.push('Authentication utilities exist - reuse existing auth patterns');
    }

    const hasForms = utilities.some(u => u.name.includes('form') || u.name.includes('Form'));
    if (hasForms) {
      warnings.push('Form utilities exist - leverage existing form helpers');
    }

    return warnings;
  }

  /**
   * Suggest implementation approach
   * @param {string} architectureStyle - Detected architecture
   * @returns {string} Recommendation
   */
  suggestApproach(architectureStyle) {
    const recommendations = {
      'Feature-based': 'Organize new components within relevant feature directory',
      'Component-based': 'Add new components to /components directory, group by domain',
      'Page-based (Next.js/Remix style)': 'Follow Next.js conventions: components in /components, pages in /pages or /app',
      'Unknown': 'Follow existing directory structure patterns'
    };

    return recommendations[architectureStyle] || recommendations['Unknown'];
  }

  /**
   * Extract example patterns from similar components
   * @param {Object} discoveredFiles - Discovered files
   * @param {Object} patterns - Pattern analysis
   * @returns {Array} Example patterns
   */
  extractExamplePatterns(discoveredFiles, patterns) {
    const examples = [];

    // Naming convention example
    examples.push({
      pattern: 'Naming Convention',
      example: `Use ${patterns.naming_convention} for new files`,
      rationale: 'Matches existing codebase style'
    });

    // Architecture example
    examples.push({
      pattern: 'Architecture',
      example: patterns.architecture_style,
      rationale: 'Follow established project structure'
    });

    return examples;
  }
}

export function createGuidanceGenerator() {
  return new GuidanceGenerator();
}

export default GuidanceGenerator;
