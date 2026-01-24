/**
 * Chairman Console Comprehensive UI/UX Quality Assessment Template
 *
 * REFACTORED: This file now re-exports from modular sections.
 * The template has been split into 8 maintainable section files:
 *
 * - sections/header.js - Metadata and test info
 * - sections/page-intent.js - Purpose and user flow (Section 1)
 * - sections/backend-evaluation.js - Services and data layer (Section 2)
 * - sections/ui-ux-assessment.js - Design system and accessibility (Section 3)
 * - sections/integration-check.js - Frontend-backend mapping (Section 4)
 * - sections/sub-agent-responsibilities.js - Task assignments (Section 5)
 * - sections/testing-scope.js - Manual UAT checklists
 * - sections/summary.js - Priority actions and QA notes
 *
 * Original file: 1252 LOC (single template string)
 * Refactored: 8 section modules + assembler (~150-250 LOC each)
 *
 * @module assessment-template
 */

// Re-export assembled template for backward compatibility
export { comprehensiveAssessment } from './sections/index.js';

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
} from './sections/index.js';
