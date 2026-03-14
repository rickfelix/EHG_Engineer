# Brainstorm: Vision & Architecture Documents — Database-Only Migration

## Metadata
- **Date**: 2026-03-13
- **Domain**: Architecture
- **Phase**: Decide
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (cross-cutting infrastructure)
- **Chairman Review**: 3 items reviewed, 3 accepted, 0 flagged, 0 research-needed

---

## Problem Statement
The LEO protocol's vision and architecture documents are supposed to live in the database (`eva_vision_documents`, `eva_architecture_plans`) as the single source of truth. However, the `/brainstorm` skill protocol explicitly creates markdown files in `docs/plans/`, then is supposed to register them in the DB via `vision-command.mjs` and `archplan-command.mjs`. The registration step has been consistently failing or getting skipped, resulting in:
- **110 orphaned markdown files** in `docs/plans/` (55 vision + 51 architecture + 4 unpaired)
- **0 rows** in both database tables
- **All downstream consumers** (HEAL scoring, dimension extraction, strategic context, cascade invalidation) returning empty results

## Discovery Summary

### Key Insights
1. **Database tables are fully designed** — `content` TEXT NOT NULL, `extracted_dimensions` JSONB, `sections` JSONB, version tracking, cascade invalidation triggers — all dormant due to empty tables
2. **Production code reads exclusively from DB** — no production path reads markdown files from disk
3. **The brainstorm skill is the sole creator** of these markdown files (Steps 9.5A/9.5C)
4. **Registration commands exist** (`vision-command.mjs upsert`, `archplan-command.mjs upsert`) and correctly ingest markdown to DB, but `archplan-command` requires a `--source` file path (no direct content input)
5. **No external repos** (including the EHG app) reference `docs/plans/` files
6. **40+ code references** to `docs/plans/` exist but most are comments, tmp scripts, or sweep scripts
7. **GitHub Actions** watches `docs/plans/PLAN-PARENT-CHILD-*.md` (different pattern, unaffected)

### User Decision
- **Option B: DB + Archive Markdown** — migrate all content to DB, archive markdown files to `docs/plans/archived/`
- Content is authoritative in the database; archive is a git-history safety net

## Analysis

### Arguments For
1. **Activates a dormant system** — HEAL scoring, dimension extraction, cascade invalidation, and cross-document search all already query the DB and get nothing back
2. **Eliminates a broken dual-write** — the current "write markdown then register" pipeline fails silently, producing 110 orphaned files
3. **Enables structured querying** — section-level search across documents becomes a JSONB query instead of grep
4. **Existing tooling handles it** — vision-command.mjs and archplan-command.mjs already do the ingestion

### Arguments Against
1. **Status value reconciliation needed** — ingested docs may get `active` but consumers filter on `approved`/`published`
2. **FK constraint blocks orphaned arch plans** — architecture files without a paired vision can't be ingested without stubs
3. **Brainstorm content stays hybrid** — moving vision/arch to DB while brainstorm content stays markdown creates a new inconsistency (separate future brainstorm topic)
4. **Bulk LLM extraction cost** — 103 dimension extraction calls during migration

## Architecture: Tradeoff Matrix

| Dimension | Weight | A: Full DB Migration | B: DB + Archive Markdown | C: Hybrid |
|-----------|--------|----------------------|--------------------------|-----------|
| Complexity | 20% | 7 | 8 | 4 |
| Maintainability | 25% | 9 | 8 | 4 |
| Performance | 20% | 8 | 8 | 5 |
| Migration effort | 15% | 6 | 5 | 9 |
| Future flexibility | 20% | 9 | 8 | 3 |
| **Weighted Score** | | **8.05** | **7.55** | **4.75** |

**Selected: Option B** — DB primary + archive for safety net

## Team Perspectives

### Challenger
- **Blind Spots**: `source_file_path` becomes dangling reference after migration; brainstorm content stays markdown-only creating hybrid inconsistency; `plan-archiver.js` writes to `docs/plans/archived/`
- **Assumptions at Risk**: "Production reads from DB" masks status value mismatches; 110 files can't all cleanly ingest (FK orphans); git history/PR references to paths
- **Worst Case**: Half-migrated corpus (neither complete markdown nor complete DB), silent empty results from status mismatch, orphaned arch plans dropped

### Visionary
- **Opportunities**: Structured section querying across documents; version-controlled evolution with cascade invalidation (already built, just needs data); full brainstorm→vision→arch→SD traceability chain
- **Synergies**: Activates HEAL loop, orchestrator creation, doc health audit, chairman review pipeline — all currently returning empty
- **Upside Scenario**: EVA becomes self-healing strategic alignment engine with cross-document search, automatic staleness detection, and full provenance chains

### Pragmatist
- **Feasibility**: 4/10 (moderate — tooling exists, scale is the challenge)
- **Resource Requirements**: ~3-4 hours, 1 session, ~103 LLM calls for dimension extraction
- **Constraints**: archplan-command lacks direct-content input; 3 unpaired files need manual handling; LLM extraction is sequential bottleneck
- **Recommended Path**: Migrate first → update brainstorm skill → archive files

### Synthesis
- **Consensus Points**: DB-only is correct end state; migrate before updating skill; infrastructure already exists
- **Tension Points**: Status value mismatches could cause silent failures; FK orphans may block significant portion of migration
- **Composite Risk**: Medium

## Open Questions
- Should brainstorm content (`brainstorm/*.md`) also migrate to DB? (Separate brainstorm topic)
- What status value should migrated documents receive? (`approved`? `published`?)
- How to handle the 3-4 unpaired files (arch without vision, vision without arch)?

## Suggested Next Steps
1. Create SD via `/leo create` for the migration work
2. Implementation phases: batch migration script → archplan-command update → brainstorm skill rewrite → archive files
3. Separate brainstorm for brainstorm-content-to-DB question
