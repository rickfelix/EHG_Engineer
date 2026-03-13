# Vision: Database-First Vision & Architecture Document Templates

**Vision Key**: `VISION-DB-FIRST-DOCS-L2-001`
**Source Brainstorm**: [brainstorm/2026-03-06-db-first-vision-architecture-templates.md](../../brainstorm/2026-03-06-db-first-vision-architecture-templates.md)
**Brainstorm Session**: `8287b0e5-3630-4109-9766-58ae503886aa`

## Executive Summary

The LEO protocol generates vision and architecture documents as markdown files in `docs/plans/`, then registers them into Supabase tables (`eva_vision_documents`, `eva_architecture_plans`). This creates systemic duplication: 35 markdown files mirror 35 database records. The database is already the authoritative consumer — HEAL scoring, EVA registration, and planning completeness validation all read from DB, never from files. The files serve no downstream purpose.

This vision defines a database-first document generation system that eliminates markdown file duplication, replaces the free-text `content` column with structured JSONB sections, and introduces dynamic section templates that adapt based on domain and sd_type. Documents are written once, directly to the database, with structured sections that enable section-level queries, validation, and scoring. The 35 existing markdown files in `docs/plans/` are deleted after verifying their content exists in the database.

This aligns with the project's NC-001 rule ("No Markdown Files as Source of Truth") and integrates with the Universal Planning Completeness Framework's artifact validation — structured JSONB sections make completeness checks trivial (verify key existence + content length).

## Problem Statement

**Who is affected:** Every brainstorm-to-SD pipeline execution, every HEAL scoring cycle, every vision/architecture document consumer.

**What the problem is:** Vision and architecture documents are written twice — first as markdown files via the Write tool, then registered to the database via `vision-command.mjs` and `archplan-command.mjs`. The `content` TEXT column stores the full markdown as free text. This means:
- 35 files in `docs/plans/` are pure duplication
- No script reads these files after registration — HEAL, EVA, and gates all query the DB
- The free-text `content` column is not queryable at the section level
- Adding a new document requires knowing the markdown template by reading examples
- Sync drift is possible (DB updated, file stale, or vice versa)

**Current impact:**
- Every `/brainstorm` execution writes 2 files + 2 DB registrations (4 writes for 2 documents)
- NC-001 violation: markdown files used as intermediate source of truth
- No section-level queries possible (e.g., "show me all Problem Statements across visions")
- Template knowledge lives in Claude's context, not in a queryable schema
- Planning Completeness Framework cannot validate document sections from DB structure

## Personas

### The Brainstorm Skill (System)
- **Goals:** Generate vision and architecture documents from brainstorm content and register them for HEAL scoring, without intermediate file writes.
- **Mindset:** Pipeline executor. Currently: synthesize → write markdown → call registration command → store in DB. Desired: synthesize → validate against section schema → write structured JSONB to DB.
- **Key activities:** Generate section content from brainstorm Q&A, team perspectives, and evaluation results. Validate all required sections are present. Write to `eva_vision_documents` / `eva_architecture_plans`.
- **Pain points:** Currently must generate full markdown documents from memory of the template. No enforced schema. No section-level validation at write time.

### The HEAL Scoring Engine (System)
- **Goals:** Score vision and architecture documents against their dimensions. Identify quality gaps.
- **Mindset:** Reads `extracted_dimensions` JSONB from DB. Never reads files or free-text `content`.
- **Key activities:** Query dimensions, compute scores, generate corrective SDs for gaps.
- **Pain points:** Currently scores at document level only. Structured JSONB sections would enable section-level scoring (e.g., "Problem Statement is weak" vs "document is weak").

### The Chairman (Human)
- **Goals:** Confidence that planning documents are complete, structured, and queryable. Ability to review specific sections without reading entire documents.
- **Mindset:** Strategic oversight. Wants to query "show me all success criteria across active visions" or "which architectures specify RLS policies?"
- **Key activities:** Review documents, approve visions, check completeness.
- **Pain points:** Currently must read full markdown files or query opaque `content` TEXT columns. No structured access to individual sections.

## Information Architecture

### Document Section Schemas

**Vision Document Sections** (10 required):
```
{
  executive_summary: string,
  problem_statement: string,
  personas: [{ name, goals, mindset, key_activities, pain_points }],
  information_architecture: string,
  key_decision_points: [{ decision, rationale }],
  integration_patterns: string,
  evolution_plan: string,
  out_of_scope: [string],
  ui_ux_wireframes: string,
  success_criteria: [{ criterion, measurement, target }]
}
```

**Architecture Plan Sections** (8 required):
```
{
  stack_and_repository: string,
  legacy_deprecation: string,
  route_and_component_structure: string,
  data_layer: string,
  api_surface: string,
  implementation_phases: [{ phase, description, deliverables }],
  testing_strategy: string,
  risk_mitigation: [{ risk, severity, mitigation }]
}
```

### Data Sources

| Table | Change |
|-------|--------|
| `eva_vision_documents` | Add `sections` JSONB column alongside existing `content` TEXT. Deprecate `content` after migration. |
| `eva_architecture_plans` | Add `sections` JSONB column alongside existing `content` TEXT. Deprecate `content` after migration. |
| `document_section_schemas` (new) | Registry of required/optional sections per document type and domain |

### CLI Access

| Command | Purpose |
|---------|---------|
| `npm run vision:list` | List all vision documents with key, level, status |
| `npm run vision:view <key>` | Display a vision document's sections in rendered markdown |
| `npm run archplan:list` | List all architecture plans with key, status, linked vision |
| `npm run archplan:view <key>` | Display an architecture plan's sections in rendered markdown |

## Key Decision Points

1. **Structured JSONB sections vs. keep free-text content**: Structured JSONB wins — enables section-level queries, validation, and scoring. The free-text `content` column is kept temporarily during migration but deprecated.

2. **No phased approach**: All changes ship together — DB schema migration, pipeline refactoring, file deletion, and CLI tooling. No intermediate state where some documents are structured and others are free-text.

3. **Dynamic section schemas**: Section requirements vary by domain (venture vs protocol vs architecture) and can be stored in a `document_section_schemas` registry table. The brainstorm skill queries this registry to know which sections to generate.

4. **Migration strategy**: Parse existing 35 markdown documents by `## Heading` into structured JSONB sections. Store in new `sections` column. Verify content parity. Delete markdown files.

5. **Backward compatibility for `content` column**: Keep `content` TEXT column populated (auto-generated from `sections` JSONB via trigger or application code) during transition. Downstream consumers that read `content` continue to work. Deprecate after all consumers migrate to `sections`.

## Integration Patterns

### Brainstorm Skill (Step 9.5) Refactoring
```
Current:  Synthesize → Write .md file → Register via vision-command.mjs → DB
Proposed: Synthesize → Build sections object → Validate against schema → Write to DB directly
```

### HEAL Scoring Integration
- Currently reads `extracted_dimensions` JSONB — unchanged
- Future: Can score individual sections (e.g., "personas section is incomplete")
- Scoring dimensions can reference specific section keys

### Universal Planning Completeness Framework
- Artifact validation checks section existence in `sections` JSONB
- Section content length validates against `min_content_length` from artifact registry
- Anti-dummy detection runs on individual section text, not whole document

### EVA Registration Commands
- `vision-command.mjs` refactored to accept `--sections <json>` instead of `--source <file>`
- `archplan-command.mjs` refactored similarly
- Both commands validate sections against `document_section_schemas` before insert

## Evolution Plan

### Phase 1: Ship (This SD)
- Add `sections` JSONB column to `eva_vision_documents` and `eva_architecture_plans`
- Create `document_section_schemas` registry table with per-domain section definitions
- Migrate existing 35 documents: parse markdown → structured JSONB sections
- Refactor `vision-command.mjs` and `archplan-command.mjs` to accept structured sections
- Refactor `/brainstorm` skill Step 9.5 to write directly to DB
- Add CLI commands: `vision:list`, `vision:view`, `archplan:list`, `archplan:view`
- Delete 35 markdown files from `docs/plans/`
- Auto-generate `content` TEXT from `sections` JSONB for backward compatibility

### Phase 2: Section-Level Scoring (Future)
- HEAL scoring at section level (not just document level)
- Section quality trends over time
- Cross-document section comparison (e.g., "compare Problem Statements across all active visions")

### Phase 3: AI-Assisted Section Generation (Future)
- Template section content pre-populated from brainstorm answers
- Section-specific quality suggestions
- Auto-fill from related documents (e.g., pull personas from venture vision into child vision)

## Out of Scope

- **UI for document management** — CLI and database only
- **Quality scoring of section content** — structural validation only; quality is for HEAL
- **Cross-document coherence checking** — deferred to future phase
- **Automated section generation from brainstorm** — templates provide structure, not content
- **Version diffing UI** — DB versioning exists but no visual diff tool

## UI/UX Wireframes

N/A — no UI component. This is protocol infrastructure operating through CLI commands and database tables. Documents are viewed via `npm run vision:view <key>` which renders structured JSONB sections as formatted terminal output.

## Success Criteria

1. **Zero markdown files in `docs/plans/` for vision/architecture documents** — all content lives in DB `sections` JSONB column
2. **All 35 existing documents successfully migrated** to structured JSONB sections with content parity verified
3. **Brainstorm skill writes directly to DB** — no intermediate file writes in Step 9.5
4. **Section-level queries work** — `SELECT sections->'personas' FROM eva_vision_documents` returns structured data
5. **CLI commands provide discoverability** — `vision:list` and `vision:view` replace file browsing
6. **HEAL scoring unaffected** — `extracted_dimensions` continues to work identically
7. **Planning Completeness Framework can validate sections** — section existence checks from JSONB keys
8. **NC-001 fully satisfied** — database is sole source of truth for all planning documents
