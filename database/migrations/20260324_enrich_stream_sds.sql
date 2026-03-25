-- Migration: Enrich three child stream SDs with proper descriptions, success criteria,
-- key_changes, delivers_capabilities, and inter-stream dependencies.
-- Date: 2026-03-24
-- SDs: SD-LEO-INFRA-STREAM-VENTURE-EVA-002, SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001, SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001

-- ============================================================
-- STEP 1: Enrich descriptions, success_criteria, key_changes
-- ============================================================

-- Stream A: Venture EVA Foundation
UPDATE strategic_directives_v2 SET
  description = 'Foundation stream. Create venture-level EVA vision records seeded at Stage 1 and architecture records seeded at Stage 13. Add supports_vision_key and supports_plan_key columns to venture_artifacts. Enhance writeArtifact() in artifact-persistence-service.js with conditional EVA upsert (eager synthesis). Modify stage templates 1-15 to pass keys. Restart ventures through new pipeline. Update leo_protocol_sections and regenerate CLAUDE.md files.',
  success_criteria = '[{"criterion":"venture_artifacts has supports_vision_key and supports_plan_key columns with partial indexes","measure":"Migration applied, columns queryable"},{"criterion":"writeArtifact() with visionKey upserts eva_vision_documents","measure":"Unit test passes: EVA record created/updated on write"},{"criterion":"writeArtifact() backward compatible without keys","measure":"Existing test suite passes unchanged"},{"criterion":"EVA upsert failure does not block artifact persistence","measure":"Unit test: try/catch isolation verified"},{"criterion":"Venture pipeline stages 1-5 produce vision record at v5+","measure":"Integration test with version check"},{"criterion":"Venture pipeline stages 13-15 produce arch record at v3+","measure":"Integration test with version check"},{"criterion":"All restarted ventures have EVA records with venture_id","measure":"DB query verification"},{"criterion":"CLAUDE_CORE.md and CLAUDE_LEAD.md regenerated with new sections","measure":"Protocol sections exist in leo_protocol_sections"}]'::jsonb,
  key_changes = '[{"change":"Add supports_vision_key/supports_plan_key to venture_artifacts","impact":"Enables evidence chain linkage from artifacts to EVA records"},{"change":"Enhance writeArtifact() with conditional EVA upsert","impact":"Single write path for both artifact persistence and governance record synthesis"},{"change":"Stage templates 1-15 pass vision/plan keys","impact":"Every stage enriches the venture EVA records automatically"},{"change":"Seed vision at Stage 1, architecture at Stage 13","impact":"Ventures have formal EVA governance identity from birth"}]'::jsonb
WHERE sd_key = 'SD-LEO-INFRA-STREAM-VENTURE-EVA-002';

-- Stream B: Activate Dormant Infrastructure
UPDATE strategic_directives_v2 SET
  description = 'Activation stream. Populate leo_adrs table during Stage 14 technical architecture analysis. Activate version incrementing and addendum logging via artifact-versioning.js. Wire vision_version_aligned_to on architecture plans. Verify cascade invalidation trigger end-to-end. Update leo_protocol_sections and regenerate CLAUDE.md files. Depends on Stream A.',
  success_criteria = '[{"criterion":"Stage 14 produces 3+ ADR entries in leo_adrs","measure":"DB query after Stage 14 execution"},{"criterion":"Architecture plan adr_ids array contains ADR UUIDs","measure":"DB query verification"},{"criterion":"EVA records show version progression with addendum trail","measure":"Version > 1 and addendums array non-empty"},{"criterion":"vision_version_aligned_to set on architecture plans","measure":"DB query: value equals current vision version"},{"criterion":"Cascade invalidation fires on vision update","measure":"Integration test: needs_review_since set on arch plan after vision update"},{"criterion":"ADR superseded_by chain works","measure":"Test: supersede an ADR, verify chain"},{"criterion":"CLAUDE_PLAN.md and CLAUDE_CORE.md regenerated","measure":"Protocol sections exist in leo_protocol_sections"}]'::jsonb,
  key_changes = '[{"change":"Populate leo_adrs during Stage 14","impact":"Architectural decisions formally tracked with context, options, consequences"},{"change":"Activate version incrementing and addendum logging","impact":"Full change history visible for vision and architecture records"},{"change":"Wire cascade invalidation end-to-end","impact":"Vision changes automatically flag downstream architecture plans for review"}]'::jsonb
WHERE sd_key = 'SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001';

-- Stream C: Sprint Bridge
UPDATE strategic_directives_v2 SET
  description = 'Bridge stream. Move convertSprintToSDs() to post-Stage-19 approval. Pass vision/arch keys to created SDs. Add HEAL traceability dimensions with evidence-aware scoring. Implement auto-iterate quality loop. Build chairman batch review UX. Update leo_protocol_sections and regenerate all CLAUDE.md files. Depends on Streams A and B.',
  success_criteria = '[{"criterion":"convertSprintToSDs() fires only after Stage 19 approval","measure":"Integration test: Stage 18 completion does NOT trigger conversion"},{"criterion":"Created SDs have vision_key and plan_key in metadata","measure":"DB query after SD creation"},{"criterion":"HEAL produces traceability scores for SDs/PRDs","measure":"Evidence-aware scoring returns non-null traceability dimensions"},{"criterion":"Auto-iterate re-enriches PRDs below threshold","measure":"Test: thin PRD score improves after iteration"},{"criterion":"Chairman can review full SD/PRD set","measure":"Batch review UI renders with quality scores"},{"criterion":"Complete Stage 1-19-SD-HEAL chain verified end-to-end","measure":"E2E test passes"},{"criterion":"All CLAUDE.md files regenerated with complete pipeline docs","measure":"Protocol sections cover full traceability system"}]'::jsonb,
  key_changes = '[{"change":"Move convertSprintToSDs() to post-Stage-19","impact":"SDs created only after chairman approves the sprint plan"},{"change":"Pass vision/arch keys to sprint-spawned SDs","impact":"Every SD traces back to venture vision and architecture"},{"change":"HEAL evidence-aware traceability dimensions","impact":"PRD quality scored against full artifact evidence chain"},{"change":"Auto-iterate quality loop","impact":"Thin PRDs automatically enriched until traceability threshold met"},{"change":"Chairman batch review UX","impact":"Full SD/PRD set visible in single review surface with quality scores"}]'::jsonb
WHERE sd_key = 'SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001';

-- ============================================================
-- STEP 2: Populate delivers_capabilities (JSONB objects, not strings)
-- ============================================================

UPDATE strategic_directives_v2 SET delivers_capabilities = '[
  {"capability_type":"service","capability_key":"eager-synthesis-pipeline","name":"Eager Synthesis Pipeline","category":"infrastructure"},
  {"capability_type":"database_function","capability_key":"venture-eva-seeding","name":"Venture EVA Record Seeding","category":"infrastructure"},
  {"capability_type":"utility","capability_key":"evidence-chain-linkage","name":"Evidence Chain Linkage Columns","category":"infrastructure"}
]'::jsonb WHERE sd_key = 'SD-LEO-INFRA-STREAM-VENTURE-EVA-002';

UPDATE strategic_directives_v2 SET delivers_capabilities = '[
  {"capability_type":"database_function","capability_key":"leo-adrs-population","name":"ADR Population Pipeline","category":"governance"},
  {"capability_type":"quality_gate","capability_key":"cascade-invalidation","name":"Cascade Invalidation Wiring","category":"governance"},
  {"capability_type":"utility","capability_key":"version-addendum-management","name":"Version and Addendum Management","category":"infrastructure"}
]'::jsonb WHERE sd_key = 'SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001';

UPDATE strategic_directives_v2 SET delivers_capabilities = '[
  {"capability_type":"service","capability_key":"sprint-to-sd-bridge","name":"Sprint-to-SD Bridge","category":"infrastructure"},
  {"capability_type":"quality_gate","capability_key":"heal-traceability-scoring","name":"HEAL Traceability Scoring","category":"governance"},
  {"capability_type":"service","capability_key":"prd-auto-iterate","name":"PRD Auto-Iterate Quality Loop","category":"governance"},
  {"capability_type":"service","capability_key":"chairman-batch-review","name":"Chairman Batch Review","category":"governance"}
]'::jsonb WHERE sd_key = 'SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001';

-- ============================================================
-- STEP 3: Add formal inter-stream dependencies
-- ============================================================

UPDATE strategic_directives_v2 SET dependencies = '[{"sd_key":"SD-LEO-INFRA-STREAM-VENTURE-EVA-002","type":"blocks","reason":"Stream B requires venture EVA records and writeArtifact enhancement from Stream A"}]'::jsonb
WHERE sd_key = 'SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001';

UPDATE strategic_directives_v2 SET dependencies = '[{"sd_key":"SD-LEO-INFRA-STREAM-VENTURE-EVA-002","type":"blocks","reason":"Stream C requires EVA records and evidence linkage from Stream A"},{"sd_key":"SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001","type":"blocks","reason":"Stream C requires ADRs and versioning from Stream B for traceability scoring"}]'::jsonb
WHERE sd_key = 'SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001';

-- ============================================================
-- STEP 4: Verification query
-- ============================================================

SELECT sd_key,
  jsonb_array_length(COALESCE(success_criteria, '[]'::jsonb)) as sc_count,
  jsonb_array_length(COALESCE(key_changes, '[]'::jsonb)) as kc_count,
  jsonb_array_length(COALESCE(delivers_capabilities, '[]'::jsonb)) as cap_count,
  jsonb_array_length(COALESCE(dependencies, '[]'::jsonb)) as dep_count,
  length(description) as desc_len
FROM strategic_directives_v2
WHERE sd_key IN ('SD-LEO-INFRA-STREAM-VENTURE-EVA-002', 'SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001', 'SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001')
ORDER BY sequence_rank;

-- ROLLBACK (manual, if needed):
-- UPDATE strategic_directives_v2 SET description = NULL, success_criteria = NULL, key_changes = NULL, delivers_capabilities = NULL WHERE sd_key IN ('SD-LEO-INFRA-STREAM-VENTURE-EVA-002', 'SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001', 'SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001');
-- UPDATE strategic_directives_v2 SET dependencies = NULL WHERE sd_key IN ('SD-LEO-INFRA-STREAM-ACTIVATE-DORMANT-001', 'SD-LEO-INFRA-STREAM-SPRINT-BRIDGE-001');
