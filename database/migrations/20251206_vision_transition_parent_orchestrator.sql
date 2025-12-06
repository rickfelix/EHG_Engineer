-- Migration: SD-VISION-TRANSITION-001 Parent Orchestrator Structure
-- Purpose: Convert SD-VISION-TRANSITION-001 to parent orchestrator with 5 direct children (A-E) and 6 grandchildren (D1-D6)
-- Total: 1 parent + 5 children + 6 grandchildren = 12 SD records
-- Reference: ADR-002-VENTURE-FACTORY-ARCHITECTURE.md

-- =============================================================================
-- STEP 1: UPDATE PARENT SD TO ORCHESTRATOR
-- =============================================================================
UPDATE strategic_directives_v2
SET
  relationship_type = 'parent',
  title = 'Venture Vision v2.0 Migration (PARENT ORCHESTRATOR)',
  description = 'Parent orchestrator for migrating EHG from legacy 40-stage workflow to streamlined 25-stage Venture Vision v2.0. This parent SD coordinates 5 direct children (A-E) plus 6 grandchildren (D1-D6) for a total of 11 child SDs. Reference: ADR-002-VENTURE-FACTORY-ARCHITECTURE.md',
  scope = 'ORCHESTRATOR SCOPE: Coordinates child SDs for complete vision transition. Does not contain implementation work directly - all work delegated to children.',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'),
    '{child_sd_structure}',
    '{"direct_children": ["001A", "001B", "001C", "001D", "001E"], "grandchildren_under_D": ["001D1", "001D2", "001D3", "001D4", "001D5", "001D6"], "total_children": 11}'
  )
WHERE id = 'SD-VISION-TRANSITION-001';

-- =============================================================================
-- STEP 2: INSERT 5 DIRECT CHILD SDs (A, B, C, D, E)
-- =============================================================================

-- CHILD A: Documentation Archive
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale,
  scope, current_phase, sequence_rank, created_by, version,
  strategic_objectives, success_criteria, is_active
) VALUES (
  'SD-VISION-TRANSITION-001A',
  'vision-transition-001a',
  'Documentation Archive (40-Stage Legacy Files)',
  'draft',
  'infrastructure',
  'critical',
  'documentation',
  'moderate',
  'child_phase',
  'SD-VISION-TRANSITION-001',
  'EHG_Engineer',
  'Archive 412+ legacy documentation files from the 40-stage workflow to docs/archive/v1-40-stage-workflow/. Create archive manifest with metadata.',
  'Preserves historical context while cleaning active documentation.',
  'IN SCOPE: 36 stage directories (~396 files), 10 delta logs, stages.yaml, review reports. Create README manifest. OUT OF SCOPE: Code changes, database changes.',
  'LEAD_APPROVAL',
  2,
  'LEAD',
  '1.0',
  '["Create archive directory structure", "Copy all dossier files", "Archive stages.yaml", "Create manifest README.md", "Verify file counts"]',
  '["Archive directory exists", "396+ files archived", "Manifest created with metadata", "Original locations cleared"]',
  true
);

-- CHILD B: SD Database Cleanup
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale,
  scope, current_phase, sequence_rank, created_by, version,
  strategic_objectives, success_criteria, is_active
) VALUES (
  'SD-VISION-TRANSITION-001B',
  'vision-transition-001b',
  'SD Database Cleanup (Archive Stage SDs, Delete Test SDs)',
  'draft',
  'infrastructure',
  'critical',
  'database',
  'moderate',
  'child_phase',
  'SD-VISION-TRANSITION-001',
  'EHG_Engineer',
  'Archive 38 stage-workflow SDs (SD-STAGE-13-001 through SD-STAGE-40-001) and delete 139 orphaned test SDs from the database.',
  'Cleans SD queue to show only active, relevant SDs.',
  'IN SCOPE: Archive 38 SD-STAGE-* records with metadata, delete 139 SD-TEST-* records. OUT OF SCOPE: File changes, constraint changes.',
  'LEAD_APPROVAL',
  3,
  'LEAD',
  '1.0',
  '["Archive 38 stage-workflow SDs with vision transition reason", "Delete 139 test SDs", "Verify SD queue is clean"]',
  '["38 SDs archived with archived_reason metadata", "139 test SDs deleted", "No orphaned stage references remain"]',
  true
);

-- CHILD C: Code Integration Updates
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale,
  scope, current_phase, sequence_rank, created_by, version,
  strategic_objectives, success_criteria, risks, is_active
) VALUES (
  'SD-VISION-TRANSITION-001C',
  'vision-transition-001c',
  'Code Integration Updates (40→25 Constraints & Schemas)',
  'draft',
  'infrastructure',
  'critical',
  'infrastructure',
  'moderate',
  'child_phase',
  'SD-VISION-TRANSITION-001',
  'EHG_Engineer',
  'Update all hardcoded 40-stage references: 3 database CHECK constraints, 3 API validation schemas (leo-schemas.ts), 2 scripts (compliance-check.js, generate-stage-7-40-sds.mjs).',
  'Prevents runtime errors when stages 26-40 no longer exist.',
  'IN SCOPE: Update CHECK constraints to BETWEEN 1 AND 25, update .max(40) to .max(25) in Zod schemas, update array length 40 to 25 in scripts. OUT OF SCOPE: New stage definitions.',
  'LEAD_APPROVAL',
  4,
  'LEAD',
  '1.0',
  '["Update 3 database CHECK constraints", "Update 3 Zod validators in leo-schemas.ts", "Update compliance-check.js array length", "Archive generate-stage-7-40-sds.mjs"]',
  '["All CHECK constraints limit to 25", "API rejects stage > 25", "Compliance checks correct range", "Build passes"]',
  '[{"risk": "Constraint update fails on existing data", "mitigation": "Run after SD cleanup (001B)"}]',
  true
);

-- CHILD D: Stage Configuration (SUB-PARENT)
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale,
  scope, current_phase, sequence_rank, created_by, version,
  strategic_objectives, success_criteria, metadata, is_active
) VALUES (
  'SD-VISION-TRANSITION-001D',
  'vision-transition-001d',
  'Stage Configuration v2.0 (SUB-PARENT for 25 Stages)',
  'draft',
  'infrastructure',
  'critical',
  'infrastructure',
  'complex',
  'child_phase',
  'SD-VISION-TRANSITION-001',
  'EHG_Engineer',
  'Sub-parent orchestrator for defining all 25 venture lifecycle stages. Coordinates 6 grandchildren (D1-D6), one per phase. Creates lifecycle_stage_config table and stages_v2.yaml.',
  'Establishes the complete 25-stage venture lifecycle configuration.',
  'ORCHESTRATOR SCOPE: Coordinates D1-D6 for stage definitions. Creates base table structure.',
  'LEAD_APPROVAL',
  5,
  'LEAD',
  '1.0',
  '["Create lifecycle_stage_config table", "Generate stages_v2.yaml", "Coordinate 6 phase children"]',
  '["Table created with 25 rows", "stages_v2.yaml validates", "All 6 phase children complete"]',
  '{"is_sub_parent": true, "grandchildren": ["001D1", "001D2", "001D3", "001D4", "001D5", "001D6"]}',
  true
);

-- CHILD E: Verification & Validation
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale,
  scope, current_phase, sequence_rank, created_by, version,
  strategic_objectives, success_criteria, dependencies, is_active
) VALUES (
  'SD-VISION-TRANSITION-001E',
  'vision-transition-001e',
  'Verification & Validation (Migration Complete)',
  'draft',
  'infrastructure',
  'critical',
  'infrastructure',
  'simple',
  'child_phase',
  'SD-VISION-TRANSITION-001',
  'EHG_Engineer',
  'Execute full verification checklist to confirm vision transition is complete. Verify zero broken references, all systems functional.',
  'Ensures migration quality before marking parent complete.',
  'IN SCOPE: Archive integrity check, database verification, code validation, functional tests (npm run sd:next). OUT OF SCOPE: New development.',
  'LEAD_APPROVAL',
  10,
  'LEAD',
  '1.0',
  '["Verify archive integrity", "Verify database state", "Verify code changes", "Run functional tests", "Document completion"]',
  '["Archive has 420+ files", "No stage > 25 in database", "Build passes", "npm run sd:next works", "Zero broken links"]',
  '[{"id": "001A", "required": true}, {"id": "001B", "required": true}, {"id": "001C", "required": true}, {"id": "001D", "required": true}]',
  true
);

-- =============================================================================
-- STEP 3: INSERT 6 GRANDCHILDREN UNDER D (D1-D6)
-- =============================================================================

-- GRANDCHILD D1: Phase 1 (THE TRUTH) Stages 1-5
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale, scope,
  current_phase, sequence_rank, created_by, version, strategic_objectives, success_criteria, is_active
) VALUES (
  'SD-VISION-TRANSITION-001D1',
  'vision-transition-001d1',
  'Phase 1 Stages: THE TRUTH (Stages 1-5)',
  'draft', 'infrastructure', 'high', 'infrastructure', 'moderate',
  'child_phase', 'SD-VISION-TRANSITION-001D', 'EHG_Engineer',
  'Define stages 1-5 in lifecycle_stage_config: Draft Idea, AI Critique, Market Validation, Competitive Intelligence, Profitability Forecasting.',
  'Phase 1 establishes market truth and viability through rigorous validation.',
  'Stages 1-5 with gates, inputs, outputs, metrics, substages per ADR-002.',
  'LEAD_APPROVAL', 6, 'LEAD', '1.0',
  '["Define Stage 1: Draft Idea", "Define Stage 2: AI Critique", "Define Stage 3: Market Validation (Decision Gate)", "Define Stage 4: Competitive Intelligence", "Define Stage 5: Profitability Forecasting (Decision Gate)"]',
  '["5 stages in lifecycle_stage_config", "Decision gates configured for stages 3 and 5", "All required fields populated"]',
  true
);

-- GRANDCHILD D2: Phase 2 (THE ENGINE) Stages 6-9
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale, scope,
  current_phase, sequence_rank, created_by, version, strategic_objectives, success_criteria, is_active
) VALUES (
  'SD-VISION-TRANSITION-001D2',
  'vision-transition-001d2',
  'Phase 2 Stages: THE ENGINE (Stages 6-9)',
  'draft', 'infrastructure', 'high', 'infrastructure', 'moderate',
  'child_phase', 'SD-VISION-TRANSITION-001D', 'EHG_Engineer',
  'Define stages 6-9 in lifecycle_stage_config: Risk Evaluation, Pricing Strategy, Business Model Canvas, Exit-Oriented Design.',
  'Phase 2 builds the business model engine for sustainable growth and exit.',
  'Stages 6-9 with gates, inputs, outputs, metrics per ADR-002.',
  'LEAD_APPROVAL', 7, 'LEAD', '1.0',
  '["Define Stage 6: Risk Evaluation", "Define Stage 7: Pricing Strategy", "Define Stage 8: Business Model Canvas", "Define Stage 9: Exit-Oriented Design"]',
  '["4 stages in lifecycle_stage_config", "All required fields populated"]',
  true
);

-- GRANDCHILD D3: Phase 3 (THE IDENTITY) Stages 10-12
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale, scope,
  current_phase, sequence_rank, created_by, version, strategic_objectives, success_criteria, metadata, is_active
) VALUES (
  'SD-VISION-TRANSITION-001D3',
  'vision-transition-001d3',
  'Phase 3 Stages: THE IDENTITY (Stages 10-12)',
  'draft', 'infrastructure', 'high', 'infrastructure', 'moderate',
  'child_phase', 'SD-VISION-TRANSITION-001D', 'EHG_Engineer',
  'Define stages 10-12: Strategic Narrative & Positioning (story BEFORE name per Chairman override), Strategic Naming, Go-to-Market Strategy.',
  'Phase 3 establishes market identity through narrative, name, and GTM strategy.',
  'Stages 10-12 with strategic_narrative artifact requirement. Stage 10 must produce narrative BEFORE Stage 11 naming.',
  'LEAD_APPROVAL', 8, 'LEAD', '1.0',
  '["Define Stage 10: Strategic Narrative & Positioning", "Define Stage 11: Strategic Naming", "Define Stage 12: Go-to-Market Strategy"]',
  '["3 stages in lifecycle_stage_config", "Stage 10 requires strategic_narrative artifact", "Stage 11 depends on Stage 10 completion"]',
  '{"chairman_override": "Story before name - ADR-002-012"}',
  true
);

-- GRANDCHILD D4: Phase 4 (THE BLUEPRINT) Stages 13-16
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale, scope,
  current_phase, sequence_rank, created_by, version, strategic_objectives, success_criteria, metadata, is_active
) VALUES (
  'SD-VISION-TRANSITION-001D4',
  'vision-transition-001d4',
  'Phase 4 Stages: THE BLUEPRINT (Stages 13-16) - Kochel Firewall',
  'draft', 'infrastructure', 'high', 'infrastructure', 'complex',
  'child_phase', 'SD-VISION-TRANSITION-001D', 'EHG_Engineer',
  'Define stages 13-16: Tech Stack Interrogation, Data Model & Architecture, Epic/Story Breakdown, Spec-Driven Schema Generation. This is the "Kochel Firewall" that prevents ambiguous specs from reaching code.',
  'Phase 4 creates complete technical specifications before any code is written (Kochel Firewall).',
  'Stages 13-16 with Schema Completeness Checklist at Stage 16 (Decision Gate).',
  'LEAD_APPROVAL', 9, 'LEAD', '1.0',
  '["Define Stage 13: Tech Stack Interrogation", "Define Stage 14: Data Model & Architecture", "Define Stage 15: Epic & User Story Breakdown", "Define Stage 16: Spec-Driven Schema Generation (Decision Gate)"]',
  '["4 stages in lifecycle_stage_config", "Stage 16 decision gate configured", "Schema completeness checklist defined"]',
  '{"kochel_firewall": true, "decision_gate_stage": 16}',
  true
);

-- GRANDCHILD D5: Phase 5 (THE BUILD) Stages 17-20
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale, scope,
  current_phase, sequence_rank, created_by, version, strategic_objectives, success_criteria, is_active
) VALUES (
  'SD-VISION-TRANSITION-001D5',
  'vision-transition-001d5',
  'Phase 5 Stages: THE BUILD LOOP (Stages 17-20)',
  'draft', 'infrastructure', 'high', 'infrastructure', 'moderate',
  'child_phase', 'SD-VISION-TRANSITION-001D', 'EHG_Engineer',
  'Define stages 17-20: Environment & Agent Config, MVP Development Loop, Integration & API Layer, Security & Performance.',
  'Phase 5 executes spec-driven development with all requirements fully defined.',
  'Stages 17-20 where actual code generation begins. All stages require SDs.',
  'LEAD_APPROVAL', 10, 'LEAD', '1.0',
  '["Define Stage 17: Environment & Agent Config", "Define Stage 18: MVP Development Loop", "Define Stage 19: Integration & API Layer", "Define Stage 20: Security & Performance"]',
  '["4 stages in lifecycle_stage_config", "All stages marked sd_required=true"]',
  true
);

-- GRANDCHILD D6: Phase 6 (LAUNCH & LEARN) Stages 21-25
INSERT INTO strategic_directives_v2 (
  id, sd_key, title, status, category, priority, sd_type, complexity_level,
  relationship_type, parent_sd_id, target_application, description, rationale, scope,
  current_phase, sequence_rank, created_by, version, strategic_objectives, success_criteria, is_active
) VALUES (
  'SD-VISION-TRANSITION-001D6',
  'vision-transition-001d6',
  'Phase 6 Stages: LAUNCH & LEARN (Stages 21-25)',
  'draft', 'infrastructure', 'high', 'infrastructure', 'moderate',
  'child_phase', 'SD-VISION-TRANSITION-001D', 'EHG_Engineer',
  'Define stages 21-25: QA & UAT, Deployment & Infrastructure, Production Launch, Analytics & Feedback, Optimization & Scale.',
  'Phase 6 launches product and establishes continuous improvement loop.',
  'Stages 21-25 covering launch and post-launch optimization.',
  'LEAD_APPROVAL', 11, 'LEAD', '1.0',
  '["Define Stage 21: QA & UAT", "Define Stage 22: Deployment & Infrastructure", "Define Stage 23: Production Launch", "Define Stage 24: Analytics & Feedback", "Define Stage 25: Optimization & Scale"]',
  '["5 stages in lifecycle_stage_config", "All required fields populated"]',
  true
);

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

-- Verify parent SD update
SELECT id, title, relationship_type, metadata->'child_sd_structure' as child_structure
FROM strategic_directives_v2
WHERE id = 'SD-VISION-TRANSITION-001';

-- Verify direct children (A-E)
SELECT id, title, relationship_type, parent_sd_id, sequence_rank
FROM strategic_directives_v2
WHERE parent_sd_id = 'SD-VISION-TRANSITION-001'
ORDER BY sequence_rank;

-- Verify grandchildren (D1-D6)
SELECT id, title, relationship_type, parent_sd_id, sequence_rank
FROM strategic_directives_v2
WHERE parent_sd_id = 'SD-VISION-TRANSITION-001D'
ORDER BY sequence_rank;

-- Count total hierarchy
SELECT
  'Total SDs in hierarchy' as metric,
  COUNT(*) as count
FROM strategic_directives_v2
WHERE id IN (
  'SD-VISION-TRANSITION-001',
  'SD-VISION-TRANSITION-001A',
  'SD-VISION-TRANSITION-001B',
  'SD-VISION-TRANSITION-001C',
  'SD-VISION-TRANSITION-001D',
  'SD-VISION-TRANSITION-001E',
  'SD-VISION-TRANSITION-001D1',
  'SD-VISION-TRANSITION-001D2',
  'SD-VISION-TRANSITION-001D3',
  'SD-VISION-TRANSITION-001D4',
  'SD-VISION-TRANSITION-001D5',
  'SD-VISION-TRANSITION-001D6'
);
