# Architecture Plan: Database-First Vision & Architecture Document Templates

**Plan Key**: `ARCH-DB-FIRST-DOCS-001`
**Vision**: `VISION-DB-FIRST-DOCS-L2-001` → [Vision Document](./db-first-vision-architecture-templates-vision.md)
**Source Brainstorm**: [brainstorm/2026-03-06-db-first-vision-architecture-templates.md](../../brainstorm/2026-03-06-db-first-vision-architecture-templates.md)

## Stack & Repository Decisions

- **Repository**: `EHG_Engineer` (backend protocol infrastructure)
- **Database**: Supabase PostgreSQL — 1 new table, 2 table alterations, migration of 35 existing records
- **Runtime**: Node.js ESM modules — consistent with existing EVA/HEAL infrastructure
- **Templates**: JSONB section schemas stored in database — no static template files
- **CLI**: New npm scripts wrapping Node.js query/render modules

## Legacy Deprecation Plan

| Existing Component | Change |
|-------------------|--------|
| `eva_vision_documents.content` (TEXT) | Deprecated — replaced by `sections` JSONB. Kept temporarily, auto-populated from sections for backward compat. |
| `eva_architecture_plans.content` (TEXT) | Same deprecation path as above. |
| `docs/plans/*-vision.md` (17 files) | Deleted after migration verification. Content lives in DB. |
| `docs/plans/*-architecture.md` (18 files) | Deleted after migration verification. Content lives in DB. |
| `vision-command.mjs --source <file>` | Refactored to accept `--sections <json>` or `--sections-file <path>`. `--source` kept as deprecated alias that parses markdown. |
| `archplan-command.mjs --source <file>` | Same refactoring as vision-command. |
| `/brainstorm` skill Step 9.5 | Refactored to write sections directly to DB, no intermediate markdown file. |

## Route & Component Structure

### New Modules

```
scripts/eva/
  ├── document-section-registry.mjs     # Query section schemas from document_section_schemas table
  ├── markdown-to-sections-parser.mjs   # Parse existing markdown docs into structured JSONB sections
  ├── sections-to-markdown-renderer.mjs # Render JSONB sections back to markdown for CLI display
  └── vision-list-command.mjs           # CLI: npm run vision:list
  └── vision-view-command.mjs           # CLI: npm run vision:view <key>
  └── archplan-list-command.mjs         # CLI: npm run archplan:list
  └── archplan-view-command.mjs         # CLI: npm run archplan:view <key>
```

### Modified Modules

```
scripts/eva/
  ├── vision-command.mjs                # Accept --sections, write JSONB directly
  └── archplan-command.mjs              # Accept --sections, write JSONB directly

.claude/commands/
  └── brainstorm.md                     # Step 9.5: generate sections object, write to DB, no file
```

## Data Layer

### New Table: `document_section_schemas`

Registry of required/optional sections per document type and domain.

```sql
CREATE TABLE document_section_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,           -- 'vision' or 'architecture_plan'
  domain TEXT,                           -- NULL = default, 'venture', 'protocol', 'integration', 'architecture'
  section_key TEXT NOT NULL,             -- e.g., 'executive_summary', 'personas'
  section_name TEXT NOT NULL,            -- Human-readable: 'Executive Summary'
  description TEXT,                      -- What this section should contain
  section_order INTEGER NOT NULL,        -- Display ordering
  is_required BOOLEAN NOT NULL DEFAULT true,
  min_content_length INTEGER DEFAULT 50, -- Minimum character count
  json_schema JSONB,                     -- Optional: structural schema for array/object sections
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_type, domain, section_key)
);

-- Index for common query pattern
CREATE INDEX idx_dss_type_domain ON document_section_schemas(document_type, domain) WHERE is_active = true;

-- RLS: service role only
ALTER TABLE document_section_schemas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON document_section_schemas
  FOR ALL USING (auth.role() = 'service_role');
```

### Seed Data: Vision Document Sections

```sql
-- Default vision sections (domain = NULL, applies to all)
INSERT INTO document_section_schemas (document_type, section_key, section_name, section_order, is_required, min_content_length, json_schema)
VALUES
  ('vision', 'executive_summary', 'Executive Summary', 1, true, 100, NULL),
  ('vision', 'problem_statement', 'Problem Statement', 2, true, 100, NULL),
  ('vision', 'personas', 'Personas', 3, true, 100,
   '{"type": "array", "items": {"required": ["name", "goals", "mindset", "key_activities", "pain_points"]}}'),
  ('vision', 'information_architecture', 'Information Architecture', 4, true, 50, NULL),
  ('vision', 'key_decision_points', 'Key Decision Points', 5, true, 50, NULL),
  ('vision', 'integration_patterns', 'Integration Patterns', 6, true, 50, NULL),
  ('vision', 'evolution_plan', 'Evolution Plan', 7, true, 50, NULL),
  ('vision', 'out_of_scope', 'Out of Scope', 8, true, 30, NULL),
  ('vision', 'ui_ux_wireframes', 'UI/UX Wireframes', 9, true, 10, NULL),
  ('vision', 'success_criteria', 'Success Criteria', 10, true, 50, NULL);
```

### Seed Data: Architecture Plan Sections

```sql
INSERT INTO document_section_schemas (document_type, section_key, section_name, section_order, is_required, min_content_length)
VALUES
  ('architecture_plan', 'stack_and_repository', 'Stack & Repository Decisions', 1, true, 50),
  ('architecture_plan', 'legacy_deprecation', 'Legacy Deprecation Plan', 2, true, 30),
  ('architecture_plan', 'route_and_component_structure', 'Route & Component Structure', 3, true, 50),
  ('architecture_plan', 'data_layer', 'Data Layer', 4, true, 50),
  ('architecture_plan', 'api_surface', 'API Surface', 5, true, 50),
  ('architecture_plan', 'implementation_phases', 'Implementation Phases', 6, true, 50),
  ('architecture_plan', 'testing_strategy', 'Testing Strategy', 7, true, 50),
  ('architecture_plan', 'risk_mitigation', 'Risk Mitigation', 8, true, 50);
```

### Table Alterations

```sql
-- Add sections JSONB column to eva_vision_documents
ALTER TABLE eva_vision_documents
  ADD COLUMN sections JSONB;

-- Add sections JSONB column to eva_architecture_plans
ALTER TABLE eva_architecture_plans
  ADD COLUMN sections JSONB;

-- Fix brainstorm_sessions stage check constraint to include all domain stages
ALTER TABLE brainstorm_sessions
  DROP CONSTRAINT IF EXISTS brainstorm_sessions_stage_check;
ALTER TABLE brainstorm_sessions
  ADD CONSTRAINT brainstorm_sessions_stage_check
  CHECK (stage IS NULL OR stage IN (
    'ideation', 'validation', 'mvp', 'growth', 'scale',
    'discovery', 'design', 'implement',
    'intake', 'process', 'output',
    'explore', 'decide', 'execute'
  ));
```

### Migration: Existing Documents

```sql
-- Migration script parses existing content TEXT into sections JSONB
-- Run via Node.js script: scripts/eva/migrate-content-to-sections.mjs
-- Algorithm:
--   1. Read content TEXT column
--   2. Split by ## headings
--   3. Map heading text to section_key via lookup table
--   4. Store as { section_key: "content text" } in sections JSONB
--   5. Verify section count matches expected (warn if mismatch)
--   6. After verification: content column can be dropped in future migration
```

## API Surface

### Internal Module API

```javascript
// document-section-registry.mjs
export async function getSectionSchema(supabase, documentType, domain = null) → Array<SectionSchema>
export async function validateSections(sections, schema) → { valid: boolean, missing: string[], errors: string[] }

// markdown-to-sections-parser.mjs
export function parseMarkdownToSections(markdownContent, sectionKeyMapping) → Record<string, string>

// sections-to-markdown-renderer.mjs
export function renderSectionsToMarkdown(sections, schema) → string

// vision-command.mjs (updated)
export async function upsertVision(supabase, { visionKey, level, sections, dimensions, ... }) → VisionRecord
// --sections flag: JSON object of section_key → content
// --source flag: (deprecated) path to markdown file, auto-parsed to sections

// archplan-command.mjs (updated)
export async function upsertArchPlan(supabase, { planKey, visionKey, sections, dimensions, ... }) → ArchPlanRecord
```

### CLI Commands

```
npm run vision:list                    # List all vision documents
npm run vision:view <vision-key>       # View vision sections as formatted markdown
npm run archplan:list                  # List all architecture plans
npm run archplan:view <plan-key>       # View architecture plan sections as formatted markdown
```

## Implementation Phases

### Child A: Database Schema & Migration
- Create `document_section_schemas` table with seed data
- Add `sections` JSONB column to `eva_vision_documents` and `eva_architecture_plans`
- Fix `brainstorm_sessions` stage check constraint
- Create migration script `migrate-content-to-sections.mjs`
- Run migration on all 35 existing documents
- Verify content parity (section count + content length comparison)
- RLS policies on new table

### Child B: Section Registry & Validation Engine
- `document-section-registry.mjs` — query section schemas, validate sections object
- `markdown-to-sections-parser.mjs` — parse markdown by `## Heading` into JSONB sections
- `sections-to-markdown-renderer.mjs` — render JSONB sections back to markdown for CLI display
- Section validation: required keys present, min content length, optional json_schema validation for structured sections (personas, success_criteria)

### Child C: EVA Command Refactoring
- Refactor `vision-command.mjs` to accept `--sections <json>` flag
- Refactor `archplan-command.mjs` to accept `--sections <json>` flag
- Keep `--source` as deprecated alias (parses markdown → sections internally)
- Auto-populate `content` TEXT from `sections` JSONB for backward compatibility
- Update dimension extraction to read from sections if available

### Child D: Brainstorm Skill & CLI Tooling
- Update `/brainstorm` skill Step 9.5 to build sections object directly and write to DB
- Remove markdown file generation from Step 9.5A (vision) and Step 9.5C (architecture)
- Add CLI commands: `vision:list`, `vision:view`, `archplan:list`, `archplan:view`
- Add npm scripts in `package.json`

### Child E: File Cleanup & Documentation
- Delete 35 markdown files from `docs/plans/` (vision + architecture files)
- Update any cross-references in existing docs that link to deleted files
- Update CLAUDE.md if it references `docs/plans/` for vision/arch docs
- Verify no scripts read from `docs/plans/` for vision/arch content

### Child F: Testing
- Unit tests for section parser (markdown → JSONB)
- Unit tests for section renderer (JSONB → markdown)
- Unit tests for section validation (required keys, min length, json_schema)
- Integration tests for vision-command.mjs with --sections flag
- Integration tests for archplan-command.mjs with --sections flag
- Migration verification: all 35 documents have sections JSONB with correct section count
- HEAL scoring regression: extracted_dimensions still works identically

## Testing Strategy

### Unit Tests
- Section parser: test with well-formed markdown, malformed headings, missing sections, extra sections
- Section renderer: round-trip test (parse → render → parse = same output)
- Section validation: test required vs optional, min length, json_schema for array sections
- Section registry: test domain-specific schemas override defaults

### Integration Tests
- Full pipeline: brainstorm sections → validate → write to DB → read back → render
- Migration: parse each of 35 existing documents, verify section count matches expected
- HEAL scoring: run scoring before and after migration, verify identical extracted_dimensions
- CLI commands: vision:list shows all records, vision:view renders correctly

### Regression Tests
- Existing EVA registration pipeline still works
- HEAL scoring reads extracted_dimensions unchanged
- brainstorm skill Step 9.5 end-to-end produces valid vision + architecture records

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| Migration parsing corrupts content | High | Parse by `## Heading` with fallback. Manual review of any document with unexpected section count. Keep `content` TEXT column as backup during transition. |
| No script actually reads markdown files but assumption is wrong | High | Grep entire codebase for `docs/plans/` references before deleting files. Add file references to migration checklist. |
| HEAL scoring regression from schema change | Medium | Run HEAL scoring on 10 documents before and after migration. Compare extracted_dimensions byte-for-byte. |
| Discoverability loss for developers | Medium | CLI commands (`vision:list`, `vision:view`) provide equivalent access. `npm run vision:view VISION-KEY` replaces `cat docs/plans/key-vision.md`. |
| Section schema too rigid for unusual documents | Low | `additional_sections` JSONB overflow field for content that doesn't fit schema keys. JSONB is inherently flexible — missing keys return null, extra keys are preserved. |
| Brainstorm skill markdown preview changes | Low | Render sections to markdown for `AskUserQuestion` preview. User sees same formatted content, different storage. |
