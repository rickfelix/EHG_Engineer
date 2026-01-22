/**
 * Report Generators for PRD Validator
 * Handles displaying results and generating reports
 */

import fs from 'fs';
import path from 'path';

/**
 * Get letter grade for score
 * @param {number} score - Validation score
 * @returns {string} Letter grade with icon
 */
function getGrade(score) {
  if (score >= 95) return '[EXCELLENT] A+';
  if (score >= 90) return '[GREAT] A';
  if (score >= 85) return '[GOOD] B+';
  if (score >= 80) return '[OK] B';
  if (score >= 75) return '[FAIR] C+';
  if (score >= 70) return '[NEEDS WORK] C';
  if (score >= 60) return '[POOR] D';
  return '[FAIL] F';
}

/**
 * Display validation results
 * @param {Object} results - Validation results
 */
function displayResults(results) {
  console.log('='.repeat(47));
  console.log(`VALIDATION SCORE: ${results.score}/100 ${getGrade(results.score)}`);
  console.log(`STATUS: ${results.valid ? '[VALID]' : '[INVALID]'}`);
  console.log('='.repeat(47) + '\n');

  // Metadata
  if (Object.keys(results.metadata).length > 0) {
    console.log('Document Metadata:');
    if (results.metadata.prdId) console.log(`   PRD ID: ${results.metadata.prdId}`);
    if (results.metadata.relatedSD) console.log(`   Related SD: ${results.metadata.relatedSD}`);
    if (results.metadata.version) console.log(`   Version: ${results.metadata.version}`);
    if (results.metadata.status) console.log(`   Status: ${results.metadata.status}`);
    if (results.metadata.author) console.log(`   Author: ${results.metadata.author}`);
    console.log();
  }

  // Required sections
  console.log('Required Sections:');
  Object.entries(results.sections.required).forEach(([section, found]) => {
    console.log(`   ${found ? '[OK]' : '[MISSING]'} ${section}`);
  });

  // Recommended sections
  console.log('\nRecommended Sections:');
  Object.entries(results.sections.recommended).forEach(([section, found]) => {
    console.log(`   ${found ? '[OK]' : '[WARN]'} ${section}`);
  });

  // Optional sections (only show present ones)
  const presentOptional = Object.entries(results.sections.optional).filter(([_, found]) => found);
  if (presentOptional.length > 0) {
    console.log('\nOptional Sections Present:');
    presentOptional.forEach(([section]) => {
      console.log(`   [OK] ${section}`);
    });
  }

  // Quality metrics
  console.log('\nQuality Metrics:');
  console.log(`   User Stories: ${results.quality.userStories.wellFormed}/${results.quality.userStories.found} well-formed`);
  console.log(`   Requirements: ${results.quality.requirements.withIds}/${results.quality.requirements.found} with IDs`);
  console.log(`   Testability: ${results.quality.testability}/100`);
  console.log(`   Completeness: ${results.quality.completeness}%`);

  // Errors
  if (results.errors.length > 0) {
    console.log('\nErrors (must fix):');
    results.errors.forEach(error => {
      console.log(`   - ${error}`);
    });
  }

  // Warnings
  if (results.warnings.length > 0) {
    console.log('\nWarnings (should fix):');
    results.warnings.forEach(warning => {
      console.log(`   - ${warning}`);
    });
  }

  // Suggestions
  if (results.suggestions.length > 0) {
    console.log('\nSuggestions (nice to have):');
    results.suggestions.forEach(suggestion => {
      console.log(`   - ${suggestion}`);
    });
  }
}

/**
 * Generate specific recommendations
 * @param {Object} results - Validation results
 */
function generateRecommendations(results) {
  console.log('\nRecommendations for Improvement:');
  console.log('-'.repeat(47));

  if (results.quality.userStories.wellFormed < results.quality.userStories.found) {
    console.log(`
User Story Format:
   Use: "As a [role], I want [feature], so that [benefit]"
   Example: "As a user, I want to reset my password, so that I can regain access to my account"`);
  }

  if (results.quality.requirements.withIds < results.quality.requirements.found / 2) {
    console.log(`
Requirement IDs:
   Use consistent IDs like:
   - FR-001: Functional Requirement
   - NFR-001: Non-Functional Requirement
   - US-001: User Story`);
  }

  if (results.quality.testability < 50) {
    console.log(`
Improve Testability:
   - Add specific acceptance criteria for each user story
   - Use measurable metrics (e.g., "within 2 seconds")
   - Include error scenarios and edge cases
   - Define clear success/failure conditions`);
  }

  if (!results.metadata.relatedSD) {
    console.log(`
Link to Strategic Directive:
   Add: "Related Strategic Directive: SD-XXX"
   This ensures PRD aligns with strategic goals`);
  }

  if (results.metadata.hasUIWork && !results.metadata.hasVisionQAConfig) {
    console.log(`
Vision QA Configuration:
   Since this PRD includes UI work, add:
   \`\`\`json
   {
     "visionQA": {
       "status": "REQUIRED",
       "testGoals": ["List specific UI test goals"],
       "maxIterations": 30,
       "costLimit": 2.00
     }
   }
   \`\`\``);
  }
}

/**
 * Generate recommendations as JSON
 * @param {Object} results - Validation results
 * @returns {Array} Array of recommendation objects
 */
function generateRecommendationsJSON(results) {
  const recommendations = [];

  results.errors.forEach(error => {
    recommendations.push({
      type: 'error',
      priority: 'critical',
      message: error,
      action: 'Must fix before approval'
    });
  });

  results.warnings.forEach(warning => {
    recommendations.push({
      type: 'warning',
      priority: 'high',
      message: warning,
      action: 'Should fix for quality'
    });
  });

  results.suggestions.forEach(suggestion => {
    recommendations.push({
      type: 'suggestion',
      priority: 'medium',
      message: suggestion,
      action: 'Consider for completeness'
    });
  });

  return recommendations;
}

/**
 * Save validation report
 * @param {string} filePath - Path to PRD file
 * @param {Object} results - Validation results
 * @returns {string} Path to saved report
 */
function saveReport(filePath, results) {
  const reportDir = path.join('docs', 'validation-reports', 'prd');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const basename = path.basename(filePath, '.md');
  const reportPath = path.join(reportDir, `${basename}-validation-${timestamp}.json`);

  const report = {
    file: filePath,
    timestamp: new Date().toISOString(),
    results,
    recommendations: generateRecommendationsJSON(results)
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

export {
  getGrade,
  displayResults,
  generateRecommendations,
  generateRecommendationsJSON,
  saveReport
};
