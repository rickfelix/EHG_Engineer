/**
 * Per-artifact quality rubric definitions for all 11 blueprint artifact types.
 * Each rubric defines weighted scoring dimensions with criteria and scoring levels.
 *
 * Keys use the centralized artifact naming convention from artifact-types.js.
 *
 * @module lib/eva/blueprint-scoring/rubric-definitions
 */

import { ARTIFACT_TYPES } from '../artifact-types.js';

function dim(name, weight, criteria, levels = defaultLevels()) {
  return { name, weight, criteria, scoring_levels: levels };
}

function defaultLevels() {
  return [
    { score: 0, label: 'Missing', description: 'Not present or empty' },
    { score: 25, label: 'Minimal', description: 'Stub or placeholder content' },
    { score: 50, label: 'Partial', description: 'Some content but incomplete' },
    { score: 75, label: 'Good', description: 'Meets expectations with minor gaps' },
    { score: 100, label: 'Excellent', description: 'Comprehensive and well-structured' },
  ];
}

/** @type {Record<string, {dimensions: Array, version: number, min_pass_score: number}>} */
export const RUBRIC_DEFINITIONS = {
  [ARTIFACT_TYPES.BLUEPRINT_DATA_MODEL]: {
    version: 1,
    min_pass_score: 60,
    dimensions: [
      dim('entity_coverage', 0.3, 'All domain entities identified with attributes and types'),
      dim('relationship_clarity', 0.3, 'Relationships clearly defined with cardinality'),
      dim('normalization', 0.2, 'Appropriate normalization level for use case'),
      dim('naming_conventions', 0.2, 'Consistent, descriptive naming throughout'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_ERD_DIAGRAM]: {
    version: 1,
    min_pass_score: 60,
    dimensions: [
      dim('completeness', 0.35, 'All entities and relationships from data model represented'),
      dim('readability', 0.35, 'Diagram is clear and well-organized'),
      dim('syntax_validity', 0.3, 'Valid Mermaid erDiagram syntax'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_TECHNICAL_ARCHITECTURE]: {
    version: 1,
    min_pass_score: 65,
    dimensions: [
      dim('layer_coverage', 0.25, 'All architectural layers addressed (presentation, app, data, infra)'),
      dim('technology_justification', 0.25, 'Tech choices explained with rationale'),
      dim('scalability', 0.25, 'Scalability considerations documented'),
      dim('security', 0.25, 'Security architecture addressed'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_API_CONTRACT]: {
    version: 1,
    min_pass_score: 65,
    dimensions: [
      dim('endpoint_coverage', 0.3, 'All required CRUD and business endpoints defined'),
      dim('request_response_spec', 0.25, 'Request/response schemas fully specified'),
      dim('auth_handling', 0.2, 'Authentication and authorization documented'),
      dim('error_handling', 0.25, 'Error codes and responses documented'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_SCHEMA_SPEC]: {
    version: 1,
    min_pass_score: 65,
    dimensions: [
      dim('ddl_completeness', 0.3, 'All tables with columns, types, and constraints'),
      dim('type_safety', 0.25, 'TypeScript interfaces match DDL definitions'),
      dim('index_strategy', 0.2, 'Appropriate indexes for query patterns'),
      dim('constraint_coverage', 0.25, 'Foreign keys, checks, and NOT NULLs applied'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_USER_STORY_PACK]: {
    version: 1,
    min_pass_score: 55,
    dimensions: [
      dim('story_quality', 0.3, 'Stories follow As/I want/So that format with clear acceptance criteria'),
      dim('coverage', 0.3, 'All features represented with epics grouping'),
      dim('estimation', 0.2, 'Story points assigned with reasonable estimates'),
      dim('testability', 0.2, 'Each story has testable acceptance criteria'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_RISK_REGISTER]: {
    version: 1,
    min_pass_score: 55,
    dimensions: [
      dim('risk_identification', 0.3, 'Comprehensive risk identification across categories'),
      dim('mitigation_quality', 0.35, 'Actionable mitigations with owners and timelines'),
      dim('categorization', 0.15, 'Risks properly categorized (market, tech, financial, ops, exec)'),
      dim('scoring', 0.2, 'Impact and probability scores assigned consistently'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_FINANCIAL_PROJECTION]: {
    version: 1,
    min_pass_score: 60,
    dimensions: [
      dim('revenue_model', 0.3, 'Revenue streams and pricing clearly modeled'),
      dim('cost_structure', 0.25, 'Cost categories with realistic estimates'),
      dim('unit_economics', 0.25, 'LTV, CAC, payback period calculated'),
      dim('timeline_coverage', 0.2, '12-month projection with monthly granularity'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_LAUNCH_READINESS]: {
    version: 1,
    min_pass_score: 60,
    dimensions: [
      dim('dimension_coverage', 0.3, 'All 6 readiness dimensions assessed'),
      dim('evidence_backing', 0.35, 'Assessments backed by artifact evidence'),
      dim('go_nogo_clarity', 0.35, 'Clear recommendation with rationale'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_SPRINT_PLAN]: {
    version: 1,
    min_pass_score: 55,
    dimensions: [
      dim('sprint_structure', 0.3, '2-week sprints with clear goals and story assignments'),
      dim('dependency_ordering', 0.25, 'Stories ordered respecting dependencies'),
      dim('velocity_realism', 0.25, 'Velocity assumptions documented and realistic'),
      dim('coverage', 0.2, 'All stories from user_story_pack assigned to sprints'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_PROMOTION_GATE]: {
    version: 1,
    min_pass_score: 70,
    dimensions: [
      dim('completeness', 0.3, 'All artifacts present and non-trivial'),
      dim('coherence', 0.25, 'Cross-artifact consistency, no contradictions'),
      dim('viability', 0.25, 'Financial projections show sustainability path'),
      dim('risk_awareness', 0.2, 'Risks identified with actionable mitigations'),
    ],
  },
  [ARTIFACT_TYPES.BLUEPRINT_WIREFRAMES]: {
    version: 1,
    min_pass_score: 55,
    dimensions: [
      dim('screen_coverage', 0.3, 'All MVP user journeys represented with screens'),
      dim('navigation_clarity', 0.25, 'Navigation flows connect all screens with clear triggers'),
      dim('persona_mapping', 0.25, 'Each screen maps to relevant personas'),
      dim('layout_quality', 0.2, 'ASCII layouts show clear component placement and hierarchy'),
    ],
  },
};

/** All artifact type keys */
export const ARTIFACT_TYPES = Object.keys(RUBRIC_DEFINITIONS);
