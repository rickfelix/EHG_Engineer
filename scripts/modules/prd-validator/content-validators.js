/**
 * Content Validators for PRD Validator
 * Validates specific content sections like metadata, user stories, requirements
 */

import {
  USER_STORY_PATTERNS,
  REQUIREMENT_ID_PATTERNS,
  SECTION_SUGGESTION_PATTERNS
} from './validation-config.js';

/**
 * Validate PRD metadata
 * @param {string} content - PRD content
 * @param {Object} results - Results object to update
 */
function validateMetadata(content, results) {
  // Check for PRD ID
  const prdIdMatch = content.match(/PRD[-_]([A-Z0-9-]+)/i);
  if (prdIdMatch) {
    results.metadata.prdId = prdIdMatch[0];
  } else {
    results.errors.push('No PRD ID found (expected format: PRD-XXX or PRD_XXX)');
    results.valid = false;
    results.score -= 10;
  }

  // Check for related SD
  const sdMatch = content.match(/SD-(\d{3,4}[A-Z]?)/);
  if (sdMatch) {
    results.metadata.relatedSD = sdMatch[0];
  } else {
    results.warnings.push('No Strategic Directive reference found');
    results.score -= 5;
  }

  // Check for version
  const versionMatch = content.match(/Version[:\s]+(\d+\.\d+(?:\.\d+)?)/i);
  if (versionMatch) {
    results.metadata.version = versionMatch[1];
  } else {
    results.suggestions.push('Consider adding version number');
  }

  // Check for author/owner
  const authorMatch = content.match(/Author[:\s]+([^\n]+)|Owner[:\s]+([^\n]+)|Created by[:\s]+([^\n]+)/i);
  if (authorMatch) {
    results.metadata.author = authorMatch[1] || authorMatch[2] || authorMatch[3];
  }

  // Check for dates
  const dateMatch = content.match(/Date[:\s]+(\d{4}-\d{2}-\d{2})|Created[:\s]+(\d{4}-\d{2}-\d{2})/i);
  if (dateMatch) {
    results.metadata.date = dateMatch[1] || dateMatch[2];
  }

  // Check for status
  const statusMatch = content.match(/Status[:\s]+(Draft|Review|Approved|Final|In Progress)/i);
  if (statusMatch) {
    results.metadata.status = statusMatch[1];
  } else {
    results.suggestions.push('Consider adding document status (Draft/Review/Approved)');
  }
}

/**
 * Validate user stories
 * @param {string} content - PRD content
 * @param {Object} results - Results object to update
 */
function validateUserStories(content, results) {
  const userStoriesMatch = content.match(/#{1,3}.*User Stories[\s\S]*?(?=^#{1,3}|\z)/m);
  if (!userStoriesMatch) return;

  const storiesSection = userStoriesMatch[0];

  const storyLines = storiesSection.match(/^[\s]*[-*]\s+.+$/gm) || [];
  results.quality.userStories.found = storyLines.length;

  let wellFormedCount = 0;
  storyLines.forEach(line => {
    const isWellFormed = USER_STORY_PATTERNS.some(pattern => pattern.test(line));
    if (isWellFormed) wellFormedCount++;
  });

  results.quality.userStories.wellFormed = wellFormedCount;

  if (results.quality.userStories.found === 0) {
    results.errors.push('No user stories found in User Stories section');
    results.score -= 10;
  } else if (wellFormedCount < results.quality.userStories.found / 2) {
    results.warnings.push(`Only ${wellFormedCount}/${results.quality.userStories.found} user stories follow standard format (As a... I want... So that...)`);
    results.score -= 5;
  }

  const hasAcceptanceCriteria = /acceptance criteria|AC:|Given.*When.*Then/i.test(storiesSection);
  if (!hasAcceptanceCriteria && results.quality.userStories.found > 0) {
    results.suggestions.push('Consider adding acceptance criteria to user stories');
  }
}

/**
 * Validate requirements
 * @param {string} content - PRD content
 * @param {Object} results - Results object to update
 */
function validateRequirements(content, results) {
  const funcReqMatch = content.match(/#{1,3}.*Functional Requirements[\s\S]*?(?=^#{1,3}|\z)/m);
  if (funcReqMatch) {
    const reqSection = funcReqMatch[0];
    const reqLines = reqSection.match(/^[\s]*[-*\d.]+\s+.+$/gm) || [];
    results.quality.requirements.found = reqLines.length;

    let withIds = 0;
    reqLines.forEach(line => {
      const hasId = REQUIREMENT_ID_PATTERNS.some(pattern => pattern.test(line));
      if (hasId) withIds++;
    });
    results.quality.requirements.withIds = withIds;

    if (results.quality.requirements.found > 5 && withIds < results.quality.requirements.found / 2) {
      results.warnings.push('Most requirements lack unique IDs (FR-XXX, REQ-XXX)');
      results.score -= 3;
    }
  }

  const measurableKeywords = /must|shall|will|should|within \d+|less than|greater than|between \d+/gi;
  const measurableMatches = content.match(measurableKeywords) || [];

  if (measurableMatches.length < 5) {
    results.suggestions.push('Requirements should be more measurable (use: must, shall, within X seconds, etc.)');
  }

  const hasPriority = /Priority[:\s]|MoSCoW|P0|P1|P2|P3|High|Medium|Low/i.test(content);
  if (!hasPriority) {
    results.suggestions.push('Consider adding requirement prioritization (MoSCoW, P0/P1/P2, High/Medium/Low)');
  }
}

/**
 * Validate testability
 * @param {string} content - PRD content
 * @param {Object} results - Results object to update
 */
function validateTestability(content, results) {
  let testabilityScore = 0;
  const maxScore = 100;

  const acceptanceCriteriaCount = (content.match(/acceptance criteria|AC:|Given.*When.*Then/gi) || []).length;
  if (acceptanceCriteriaCount > 0) {
    testabilityScore += Math.min(30, acceptanceCriteriaCount * 10);
  }

  const measurableCount = (content.match(/\d+%|\d+ seconds|\d+ users|\d+ requests/gi) || []).length;
  if (measurableCount > 0) {
    testabilityScore += Math.min(20, measurableCount * 5);
  }

  const testCaseRefs = (content.match(/TC-\d+|test case|test scenario/gi) || []).length;
  if (testCaseRefs > 0) {
    testabilityScore += Math.min(20, testCaseRefs * 5);
  }

  const hasInScope = /in scope|included/i.test(content);
  const hasOutScope = /out of scope|excluded|not included/i.test(content);
  if (hasInScope && hasOutScope) {
    testabilityScore += 15;
  }

  const hasErrorCases = /error|exception|failure|invalid|edge case/i.test(content);
  if (hasErrorCases) {
    testabilityScore += 15;
  }

  results.quality.testability = Math.min(maxScore, testabilityScore);

  if (results.quality.testability < 50) {
    results.warnings.push(`Low testability score (${results.quality.testability}/100) - add more specific acceptance criteria`);
    results.score -= 5;
  }
}

/**
 * Validate Vision QA requirements for UI work
 * @param {string} content - PRD content
 * @param {Object} results - Results object to update
 */
function validateVisionQA(content, results) {
  const hasUIWork = /UI|user interface|frontend|screen|page|component|button|form|layout|responsive/i.test(content);
  const hasVisionQA = /Vision QA|Visual Testing|visual regression|screenshot|UI testing/i.test(content);

  if (hasUIWork) {
    results.metadata.hasUIWork = true;

    if (!hasVisionQA) {
      results.warnings.push('UI work detected but no Vision QA requirements specified');
      results.suggestions.push('Add Vision QA requirements section with test goals and configuration');
      results.score -= 5;
    } else {
      const vqConfigMatch = content.match(/```json[^`]*vision[^`]*```/i);
      if (vqConfigMatch) {
        results.metadata.hasVisionQAConfig = true;
      } else {
        results.suggestions.push('Consider adding Vision QA configuration JSON for UI testing');
      }
    }
  }
}

/**
 * Determine if a section should be suggested
 * @param {string} sectionName - Section name
 * @param {string} content - PRD content
 * @returns {boolean} Whether to suggest the section
 */
function shouldSuggestSection(sectionName, content) {
  const pattern = SECTION_SUGGESTION_PATTERNS[sectionName];
  return pattern ? pattern.test(content) : false;
}

/**
 * Calculate overall quality score
 * @param {Object} results - Results object to update
 */
function calculateQualityScore(results) {
  let completeness = 0;
  const totalSections = Object.keys(results.sections.required).length +
                       Object.keys(results.sections.recommended).length;

  const foundSections = Object.values(results.sections.required).filter(v => v).length +
                       Object.values(results.sections.recommended).filter(v => v).length;

  completeness = Math.round((foundSections / totalSections) * 100);
  results.quality.completeness = completeness;

  if (results.quality.userStories.found === 0) {
    results.quality.completeness -= 10;
  }

  if (results.quality.requirements.found === 0) {
    results.quality.completeness -= 10;
  }

  results.quality.completeness = Math.max(0, results.quality.completeness);
}

export {
  validateMetadata,
  validateUserStories,
  validateRequirements,
  validateTestability,
  validateVisionQA,
  shouldSuggestSection,
  calculateQualityScore
};
