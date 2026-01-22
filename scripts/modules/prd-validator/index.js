/**
 * PRD Validator Module
 * Main entry point for modular PRD validation
 */

import fs from 'fs';

import {
  REQUIRED_SECTIONS,
  RECOMMENDED_SECTIONS,
  OPTIONAL_SECTIONS
} from './validation-config.js';

import {
  validateMetadata,
  validateUserStories,
  validateRequirements,
  validateTestability,
  validateVisionQA,
  shouldSuggestSection,
  calculateQualityScore
} from './content-validators.js';

import { validateLinkages } from './linkage-validators.js';

import {
  displayResults,
  generateRecommendations,
  saveReport
} from './report-generators.js';

import { autoFix } from './auto-fix.js';
import { generateTemplate } from './template-generator.js';

/**
 * PRD Validator class
 */
class PRDValidator {
  constructor() {
    this.requiredSections = REQUIRED_SECTIONS;
    this.recommendedSections = RECOMMENDED_SECTIONS;
    this.optionalSections = OPTIONAL_SECTIONS;
  }

  /**
   * Validate a PRD file
   * @param {string} filePath - Path to PRD file
   * @returns {boolean} Whether validation passed
   */
  validateFile(filePath) {
    console.log('\n' + '='.repeat(48));
    console.log('        PRD Validator v1.0 - LEO Protocol');
    console.log('='.repeat(48) + '\n');

    console.log(`File: ${filePath}\n`);

    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const results = this.validate(content, filePath);

    displayResults(results);

    if (results.score < 90) {
      generateRecommendations(results);
    }

    const reportPath = saveReport(filePath, results);
    console.log(`\nValidation report saved: ${reportPath}`);

    return results.valid;
  }

  /**
   * Validate PRD content
   * @param {string} content - PRD content
   * @param {string} filePath - Path to PRD file
   * @returns {Object} Validation results
   */
  validate(content, filePath = '') {
    const results = {
      valid: true,
      score: 100,
      errors: [],
      warnings: [],
      suggestions: [],
      sections: {
        required: {},
        recommended: {},
        optional: {}
      },
      metadata: {},
      quality: {
        userStories: { found: 0, wellFormed: 0 },
        requirements: { found: 0, withIds: 0 },
        testability: 0,
        completeness: 0
      }
    };

    // Check required sections
    this.requiredSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.required[section.name] = found;

      if (!found) {
        results.errors.push(`Missing required section: ${section.name}`);
        results.valid = false;
        results.score -= 10;
      }
    });

    // Check recommended sections
    this.recommendedSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.recommended[section.name] = found;

      if (!found) {
        results.warnings.push(`Missing recommended section: ${section.name}`);
        results.score -= 3;
      }
    });

    // Check optional sections
    this.optionalSections.forEach(section => {
      const found = section.pattern.test(content);
      results.sections.optional[section.name] = found;

      if (!found && shouldSuggestSection(section.name, content)) {
        results.suggestions.push(`Consider adding: ${section.name}`);
      }
    });

    // Validate specific content quality
    validateMetadata(content, results);
    validateUserStories(content, results);
    validateRequirements(content, results);
    validateLinkages(content, results, filePath);
    validateTestability(content, results);
    validateVisionQA(content, results);

    // Calculate quality score
    calculateQualityScore(results);

    // Ensure score doesn't go below 0
    results.score = Math.max(0, results.score);

    return results;
  }

  /**
   * Auto-fix common issues
   * @param {string} filePath - Path to PRD file
   * @returns {boolean} Whether fixes were applied
   */
  autoFix(filePath) {
    return autoFix(filePath);
  }

  /**
   * Generate PRD template
   * @param {string} outputPath - Path to save template
   * @returns {string} Generated template
   */
  static generateTemplate(outputPath) {
    return generateTemplate(outputPath);
  }
}

export default PRDValidator;

export {
  PRDValidator,
  REQUIRED_SECTIONS,
  RECOMMENDED_SECTIONS,
  OPTIONAL_SECTIONS,
  validateMetadata,
  validateUserStories,
  validateRequirements,
  validateTestability,
  validateVisionQA,
  validateLinkages,
  shouldSuggestSection,
  calculateQualityScore,
  displayResults,
  generateRecommendations,
  saveReport,
  autoFix,
  generateTemplate
};
