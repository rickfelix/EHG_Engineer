/**
 * UAT Assessment Template - Section Assembler
 * Combines all modular sections into the comprehensive assessment
 *
 * @module uat-assessment/sections
 */

import { headerSection } from './header.js';
import { pageIntentSection } from './page-intent.js';
import { backendEvaluationSection } from './backend-evaluation.js';
import { uiUxAssessmentSection } from './ui-ux-assessment.js';
import { integrationCheckSection } from './integration-check.js';
import { subAgentResponsibilitiesSection } from './sub-agent-responsibilities.js';
import { testingScopeSection } from './testing-scope.js';
import { summarySection } from './summary.js';

/**
 * Complete comprehensive assessment template
 * Assembled from modular sections for maintainability
 *
 * Section Order:
 * 1. Header - Metadata and test info
 * 2. Page Intent - Purpose and user flow
 * 3. Backend Evaluation - Services and data layer
 * 4. UI/UX Assessment - Design system and accessibility
 * 5. Integration Check - Frontend-backend mapping
 * 6. Sub-Agent Responsibilities - Task assignments
 * 7. Testing Scope - Manual UAT checklists
 * 8. Summary - Priority actions and QA notes
 */
export const comprehensiveAssessment = `${headerSection}

${pageIntentSection}

${backendEvaluationSection}

${uiUxAssessmentSection}

${integrationCheckSection}

${subAgentResponsibilitiesSection}

${testingScopeSection}

${summarySection}`;

// Re-export individual sections for granular access
export {
  headerSection,
  pageIntentSection,
  backendEvaluationSection,
  uiUxAssessmentSection,
  integrationCheckSection,
  subAgentResponsibilitiesSection,
  testingScopeSection,
  summarySection,
};
