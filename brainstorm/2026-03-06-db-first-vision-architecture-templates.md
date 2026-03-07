# Brainstorm: Database-First Vision & Architecture Document Templates

## Metadata
- **Date**: 2026-03-06
- **Domain**: Architecture
- **Phase**: Explore
- **Mode**: Conversational
- **Outcome Classification**: Ready for SD
- **Team Analysis**: Yes (3/3 perspectives)
- **Related Ventures**: None (protocol infrastructure)

---

## Problem Statement

The LEO protocol currently generates vision and architecture documents as markdown files in `docs/plans/`, then registers them into Supabase tables (`eva_vision_documents`, `eva_architecture_plans`). This creates duplication: 18 vision docs + 17 arch plans exist as both markdown files and database records. The database `content` column stores the full markdown text, and `extracted_dimensions` stores structured JSONB for scoring. This violates the project's own NC-001 rule ("No Markdown Files as Source of Truth") and means every document is written twice — once as a file, once to the database.

The `/brainstorm` skill (Step 9.5) generates markdown first, then calls `vision-command.mjs upsert` and `archplan-command.mjs upsert` to register. HEAL scoring reads `extracted_dimensions` from the DB, not the files. The files serve no downstream purpose beyond human browsability.

The user's directive: "I don't need a markdown file if all we do is put it in the database and we force the database structure. I'm good with that." And: "Maybe we delete all the markdown files because they are already in the database."

## Discovery Summary

### Current State Analysis
- **eva_vision_documents**: 18 records. Columns: `content` (TEXT — full markdown), `extracted_dimensions` (JSONB — scoring dimensions), `vision_key`, `level`, `status`, `version`, etc.
- **eva_architecture_plans**: 17 records. Columns: `content` (TEXT — full markdown), `extracted_dimensions` (JSONB), `plan_key`, `vision_id`, `status`, etc.
- **docs/plans/**: 35 markdown files — duplicates of DB content
- **Pipeline**: Brainstorm → Write .md file → Register to DB via vision-command.mjs / archplan-command.mjs
- **HEAL scoring**: Reads `extracted_dimensions` from DB only — never reads files
- **Vision docs**: 10 required sections (Executive Summary, Problem Statement, Personas, Information Architecture, Key Decision Points, Integration Patterns, Evolution Plan, Out of Scope, UI/UX Wireframes, Success Criteria)
- **Arch plans**: 8 required sections (Stack & Repository Decisions, Legacy Deprecation Plan, Route & Component Structure, Data Layer, API Surface, Implementation Phases, Testing Strategy, Risk Mitigation)

### Key Insight
The `content` column stores free-text markdown. The `extracted_dimensions` column stores structured JSONB for scoring. These serve different purposes but could be unified: store document sections as structured JSONB (queryable, validatable) while keeping `extracted_dimensions` for scoring weights.

## Analysis

### Arguments For (Database-First Structured JSONB)
1. **Eliminates NC-001 violation** — Database becomes sole source of truth
2. **Removes 35 duplicate files** — Cleaner repository, no sync drift
3. **Enables section-level queries** — `SELECT content->'personas' FROM eva_vision_documents WHERE vision_key = '...'` — targeted reads
4. **Aligns with Universal Planning Completeness Framework** — Structured sections make artifact validation trivial (check key existence + content length)
5. **Dynamic templates become natural** — Store template schemas by domain/sd_type, generate section content directly into structured records
6. **HEAL can score individual sections** — Not just whole-document dimensions, but section-level quality
7. **Single-write pipeline** — Brainstorm → validate schema → write DB record. No async file→DB gap
8. **Version diffs become meaningful** — "Problem Statement changed from [X] to [Y]" instead of "some markdown changed"

### Arguments Against
1. **Migration blast radius** — 35 existing documents need content parsed from markdown into JSONB sections; regex-based heading parsing is error-prone
2. **Loss of GitHub browsability** — Developers can't casually browse `docs/plans/` in GitHub file browser
3. **Schema evolution burden** — Adding/removing JSONB sections requires handling existing records (though JSONB is flexible by nature — missing keys just return null)
4. **Content model rigidity** — Vision docs with unusual sections that don't fit the schema need an escape hatch (e.g., `additional_sections` JSONB field)
5. **LLM extraction fragility** — Current dimension extraction retries ~10-15% of the time; structured section generation needs similar robustness

### Mitigations
- **Discoverability**: Add `npm run vision:list` and `npm run vision:view <key>` CLI commands for developers
- **Migration**: Parse existing markdown by heading (`## Section Name` → JSONB key), with manual review of edge cases
- **Schema flexibility**: Use well-defined required keys + optional `additional_sections` JSONB for overflow
- **No phased approach**: Ship the full change in one SD — DB schema migration, pipeline refactoring, file deletion, and CLI tooling together

## Team Perspectives

### Challenger
- **Blind Spots**: (1) Registration asymmetry — brainstorm writes files first, commands read files; no reconciliation pipeline exists for drift. (2) Search/discoverability collapse — 35 files are currently grep-able in IDE/GitHub; DB-only requires new search tooling. (3) Migration blast radius — broken links in PRs, commit messages, cross-references.
- **Assumptions at Risk**: (1) "DB content = authoritative" — extracted_dimensions populated by LLM with ~10-15% failure rate. (2) "Structured JSONB reduces content loss" — may force content into rigid keys, losing nuance. (3) "Downstream scoring depends only on DB" — unverified assumption that no script reads files directly.
- **Worst Case**: Delete files, discover a hidden file dependency, HEAL scoring fails on missing dimensions, discoverability cliff for developers. Recovery: re-generate files from DB content.

### Visionary
- **Opportunities**: (1) Composable document generation — JSONB fragments can render to markdown, HTML, ADRs, or PRD sections. (2) Measurement transparency — version diffs on structured sections are meaningful. (3) Venture ecosystem integration — structured plans enable real-time capability matrix queries.
- **Synergies**: Universal Planning Completeness Framework validates section existence directly from JSONB. HEAL loop scores individual sections. Venture-to-vision dependency graph becomes queryable.
- **Upside Scenario**: Every vision/arch document is a structured, validated, queryable record. Templates auto-adapt by domain. Planning completeness gate validates section presence directly from DB. Zero markdown file maintenance.

### Pragmatist
- **Feasibility**: 6/10 — Moderate. Core change is straightforward but coordination across 3 pipelines (brainstorm skill, vision-command.mjs, archplan-command.mjs) increases effort.
- **Resource Requirements**: 1 orchestrator SD with 3-4 children. ~3-4 weeks of work.
- **Constraints**: (1) Brainstorm skill dual-write problem — currently writes file then registers. (2) Dynamic template adaptation — conditional section builders need ~40-60 LOC. (3) Approval UX — user currently sees markdown preview; needs to see rendered DB content instead.
- **Recommended Path**: Build JSON section template system, refactor all 3 pipelines to write directly to DB, archive existing files, add CLI search tools.

### Synthesis
- **Consensus Points**: All agree markdown files should be eliminated. All agree DB is already the primary consumer. All agree discoverability tooling is needed.
- **Tension Points**: Challenger wants caution on migration; Visionary wants full JSONB immediately; Pragmatist suggested phasing (overruled by user preference for no phasing).
- **Composite Risk**: Medium — migration parsing is the highest risk item, mitigated by manual review of edge cases.

## Tradeoff Matrix (Architecture Domain)

| Dimension | Weight | Option B: Structured JSONB (All-in) | Option C: Markdown in DB Only |
|-----------|--------|--------------------------------------|-------------------------------|
| Complexity | 20% | 6/10 (parse existing, new schema) | 9/10 (minimal change) |
| Maintainability | 25% | 9/10 (queryable, validated, typed) | 7/10 (still free-text blob) |
| Performance | 20% | 8/10 (targeted section queries) | 7/10 (full content reads) |
| Migration effort | 15% | 4/10 (parse 35 docs to JSONB) | 8/10 (just stop writing files) |
| Future flexibility | 20% | 9/10 (section-level ops, templates, validation) | 5/10 (still parsing markdown for anything) |

**Weighted Scores:**
- **Option B**: (6x0.20) + (9x0.25) + (8x0.20) + (4x0.15) + (9x0.20) = 1.20 + 2.25 + 1.60 + 0.60 + 1.80 = **7.45**
- **Option C**: (9x0.20) + (7x0.25) + (7x0.20) + (8x0.15) + (5x0.20) = 1.80 + 1.75 + 1.40 + 1.20 + 1.00 = **7.15**

**Decision**: Option B wins on weighted score. The migration effort disadvantage is outweighed by maintainability and future flexibility gains. User preference confirms: no phasing, go all-in on structured JSONB.

## Open Questions
1. Should we keep a `content_markdown` TEXT column as a rendered cache (for CLI display), or always render on-the-fly from JSONB sections?
2. What's the escape hatch for sections that don't fit the schema? (`additional_sections` JSONB field? Or extensible keys?)
3. Should the migration parse existing markdown automatically, or manually verify each of the 35 documents?

## Suggested Next Steps
1. Create vision and architecture documents for this initiative
2. Register in EVA for HEAL scoring
3. Create SD via `/leo create` — single orchestrator with children for: DB migration, pipeline refactoring (vision-command, archplan-command, brainstorm skill), CLI tooling, file cleanup
