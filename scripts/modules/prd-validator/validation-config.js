/**
 * Validation Configuration for PRD Validator
 * Contains section definitions, patterns, and requirement patterns
 */

// Critical sections that MUST be present
const REQUIRED_SECTIONS = [
  { name: 'Product Requirements Document', pattern: /^#.*Product Requirements Document|^#.*PRD[-:\s]/m },
  { name: 'Executive Summary', pattern: /^#{1,3}.*Executive Summary|^\*\*Executive Summary\*\*/m },
  { name: 'Problem Statement', pattern: /^#{1,3}.*Problem Statement|^\*\*Problem Statement\*\*/m },
  { name: 'Objectives', pattern: /^#{1,3}.*Objectives|^\*\*Objectives\*\*/m },
  { name: 'User Stories', pattern: /^#{1,3}.*User Stories|^#{1,3}.*User Requirements/m },
  { name: 'Functional Requirements', pattern: /^#{1,3}.*Functional Requirements|^#{1,3}.*Features/m },
  { name: 'Non-Functional Requirements', pattern: /^#{1,3}.*Non-Functional Requirements|^#{1,3}.*NFRs/m },
  { name: 'Success Criteria', pattern: /^#{1,3}.*Success Criteria|^#{1,3}.*Success Metrics/m },
  { name: 'Acceptance Criteria', pattern: /^#{1,3}.*Acceptance Criteria|^#{1,3}.*Definition of Done/m }
];

// Highly recommended sections
const RECOMMENDED_SECTIONS = [
  { name: 'Related Strategic Directive', pattern: /Strategic Directive.*SD-\d{3}|Related SD:|Parent SD:/mi },
  { name: 'Scope', pattern: /^#{1,3}.*Scope|^\*\*Scope\*\*/m },
  { name: 'Out of Scope', pattern: /^#{1,3}.*Out of Scope|^#{1,3}.*Exclusions/m },
  { name: 'User Personas', pattern: /^#{1,3}.*User Personas|^#{1,3}.*Target Users/m },
  { name: 'Technical Requirements', pattern: /^#{1,3}.*Technical Requirements|^#{1,3}.*Technical Specifications/m },
  { name: 'Dependencies', pattern: /^#{1,3}.*Dependencies|^\*\*Dependencies\*\*/m },
  { name: 'Risks', pattern: /^#{1,3}.*Risks|^#{1,3}.*Risk Analysis/m },
  { name: 'Timeline', pattern: /^#{1,3}.*Timeline|^#{1,3}.*Milestones/m },
  { name: 'Testing Strategy', pattern: /^#{1,3}.*Testing Strategy|^#{1,3}.*Test Plan/m },
  { name: 'Vision QA Requirements', pattern: /Vision QA|Visual Testing|UI Testing/mi }
];

// Optional but valuable sections
const OPTIONAL_SECTIONS = [
  { name: 'Mockups/Wireframes', pattern: /^#{1,3}.*Mockups|^#{1,3}.*Wireframes|^#{1,3}.*Design/m },
  { name: 'API Specifications', pattern: /^#{1,3}.*API|^#{1,3}.*Endpoints/m },
  { name: 'Data Model', pattern: /^#{1,3}.*Data Model|^#{1,3}.*Database Schema/m },
  { name: 'Security Requirements', pattern: /^#{1,3}.*Security|^#{1,3}.*Privacy/m },
  { name: 'Performance Requirements', pattern: /^#{1,3}.*Performance|^#{1,3}.*Scalability/m },
  { name: 'Accessibility Requirements', pattern: /^#{1,3}.*Accessibility|WCAG|a11y/mi },
  { name: 'Rollout Plan', pattern: /^#{1,3}.*Rollout|^#{1,3}.*Deployment|^#{1,3}.*Release/m }
];

// User story patterns
const USER_STORY_PATTERNS = [
  /As a .+, I want .+, so that .+/,
  /As an? .+, I need .+, in order to .+/,
  /Given .+, When .+, Then .+/
];

// Requirement ID patterns
const REQUIREMENT_ID_PATTERNS = [
  /FR-\d{3}/,   // Functional Requirement ID
  /NFR-\d{3}/,  // Non-Functional Requirement ID
  /US-\d{3}/,   // User Story ID
  /REQ-\d{3}/,  // Generic Requirement ID
  /TC-\d{3}/    // Test Case ID
];

// Optional section suggestion patterns
const SECTION_SUGGESTION_PATTERNS = {
  'API Specifications': /API|endpoint|REST|GraphQL|webhook/i,
  'Data Model': /database|table|schema|entity|model/i,
  'Security Requirements': /auth|password|encryption|sensitive|PII|GDPR/i,
  'Performance Requirements': /performance|speed|latency|throughput|load/i,
  'Accessibility Requirements': /accessibility|screen reader|keyboard|WCAG/i,
  'Mockups/Wireframes': /UI|interface|design|layout|screen/i
};

export {
  REQUIRED_SECTIONS,
  RECOMMENDED_SECTIONS,
  OPTIONAL_SECTIONS,
  USER_STORY_PATTERNS,
  REQUIREMENT_ID_PATTERNS,
  SECTION_SUGGESTION_PATTERNS
};
