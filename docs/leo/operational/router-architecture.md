---
category: protocol
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [protocol, auto-generated]
---
# CLAUDE.md Router Architecture



## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Problem Solved](#problem-solved)
- [File Structure](#file-structure)
  - [1. CLAUDE.md (Router) - 9,116 chars (4.6%)](#1-claudemd-router---9116-chars-46)
  - [2. CLAUDE_CORE.md - 12,244 chars (6.1%)](#2-claude_coremd---12244-chars-61)
  - [3. CLAUDE_LEAD.md - 13,434 chars (6.7%)](#3-claude_leadmd---13434-chars-67)
  - [4. CLAUDE_PLAN.md - 49,262 chars (24.6%)](#4-claude_planmd---49262-chars-246)
  - [5. CLAUDE_EXEC.md - 10,794 chars (5.4%)](#5-claude_execmd---10794-chars-54)
- [Loading Strategy](#loading-strategy)
  - [Step 1: Always Load Core](#step-1-always-load-core)
  - [Step 2: Detect Phase and Load](#step-2-detect-phase-and-load)
  - [Step 3: Load Reference Docs (If Needed)](#step-3-load-reference-docs-if-needed)
- [Context Budget Impact](#context-budget-impact)
- [Generation Process](#generation-process)
  - [Files Involved](#files-involved)
  - [How to Regenerate](#how-to-regenerate)
  - [Generation Logic](#generation-logic)
  - [Section-to-File Mapping](#section-to-file-mapping)
- [Maintenance](#maintenance)
  - [Adding New Sections](#adding-new-sections)
  - [Modifying Existing Sections](#modifying-existing-sections)
  - [Moving Sections Between Files](#moving-sections-between-files)
  - [Debugging](#debugging)
- [Benefits](#benefits)
- [Future Enhancements](#future-enhancements)
  - [Potential Improvements](#potential-improvements)
- [Related Documentation](#related-documentation)

## Metadata
- **Category**: Architecture
- **Status**: Draft
- **Version**: 1.0.0
- **Author**: DOCMON
- **Last Updated**: 2026-01-20
- **Tags**: database, testing, e2e, unit

**Last Updated**: 2025-10-30
**Version**: V3 (Router Architecture)
**Status**: ✅ IMPLEMENTED

## Overview

The CLAUDE.md file system uses a **router architecture** to dramatically reduce initial context consumption while maintaining full protocol access.

## Problem Solved

**Before** (Monolithic):
- Single CLAUDE.md file: 175,057 characters (87.5% of 200k context budget)
- Entire protocol loaded on every session start
- 87% context consumed before any work begins

**After** (Router Architecture):
- Initial load: 21,360 characters (10.7% of 200k budget)
- **76.8% reduction in initial context consumption**
- Phase-specific content loaded on-demand

## File Structure

### 1. CLAUDE.md (Router) - 9,116 chars (4.6%)
**Purpose**: Minimal router file that directs agents to load appropriate files
**Contents**:
- File warning (auto-generated, do not edit)
- Session prologue (6-point checklist)
- Protocol version info
- Loading strategy instructions
- Quick decision tree
- Context budget tracking
- File descriptions

**Always Loaded**: Yes

### 2. CLAUDE_CORE.md - 12,244 chars (6.1%)
**Purpose**: Essential context for ALL sessions
**Contents**:
- Application architecture (EHG vs EHG_Engineer)
- Execution philosophy
- Git commit guidelines
- PR size guidelines
- Communication & context best practices
- Parallel execution patterns
- Development workflow
- Database operations overview
- Agent responsibilities table

**Always Loaded**: Yes (Step 1 in loading strategy)

### 3. CLAUDE_LEAD.md - 13,434 chars (6.7%)
**Purpose**: LEAD phase operations
**Contents**:
- LEAD agent operations
- Directive submission review process
- Over-engineering evaluation rubric
- Simplicity-first enforcement
- Strategic validation gate
- Code review requirements for UI/UX SDs
- SD evaluation checklist
- Knowledge retrieval (historical context)

**Loaded When**: User mentions LEAD, approval, strategic validation, over-engineering, directive review

### 4. CLAUDE_PLAN.md - 49,262 chars (24.6%)
**Purpose**: PLAN phase operations
**Contents**:
- PLAN pre-EXEC checklist
- Testing tier strategy
- CI/CD pipeline verification
- Component sizing guidelines
- BMAD enhancements
- Multi-application testing architecture
- QA Engineering Director v2.0 guide
- Database migration validation
- Context management proactive monitoring
- Design→Database validation gates (large section)
- Schema documentation references
- Handoff templates
- Validation rules

**Loaded When**: User mentions PLAN, PRD, validation, testing strategy, schema, pre-EXEC

**Note**: Larger than target (30-35k) due to comprehensive validation gates and testing documentation. Acceptable because only loaded when needed.

### 5. CLAUDE_EXEC.md - 10,794 chars (5.4%)
**Purpose**: EXEC phase operations
**Contents**:
- EXEC implementation requirements
- Pre-implementation checklist
- Dual test requirement (unit + E2E MANDATORY)
- TODO comment standard
- Component sizing guidelines
- Edge case testing checklist
- Testing tools and frameworks
- E2E testing mode configuration

**Loaded When**: User mentions EXEC, implementation, coding, testing, component

## Loading Strategy

### Step 1: Always Load Core
```
CLAUDE.md (router) + CLAUDE_CORE.md = 21,360 chars (10.7%)
```

### Step 2: Detect Phase and Load
Based on user keywords, load appropriate phase file:
- **LEAD keywords** → +13,434 chars (total: 34,794 chars, 17.4%)
- **PLAN keywords** → +49,262 chars (total: 70,622 chars, 35.3%)
- **EXEC keywords** → +10,794 chars (total: 32,154 chars, 16.1%)

### Step 3: Load Reference Docs (If Needed)
Only when specific errors or issues arise:
- Database errors → database-agent-patterns.md
- Validation failures → validation-enforcement.md
- Test timeouts → qa-director-guide.md
- Context high → context-monitoring.md

## Context Budget Impact

| Scenario | Old System | New System | Savings |
|----------|-----------|------------|---------|
| Initial Load | 175k (87.5%) | 21k (10.7%) | 154k (76.8%) |
| With LEAD | 175k (87.5%) | 35k (17.4%) | 140k (70.1%) |
| With PLAN | 175k (87.5%) | 71k (35.3%) | 104k (52.2%) |
| With EXEC | 175k (87.5%) | 32k (16.1%) | 143k (71.4%) |

## Generation Process

### Files Involved
1. **Database**: `leo_protocol_sections` table (83 sections, 168k chars total)
2. **Mapping**: `scripts/section-file-mapping.json` (section-to-file assignments)
3. **Generator**: `scripts/generate-claude-md-from-db.js` (V3 - Router Architecture)

### How to Regenerate

```bash
node scripts/generate-claude-md-from-db.js
```

**Output**:
```
✓ CLAUDE.md               8.8 KB (9040 chars)
✓ CLAUDE_CORE.md         11.8 KB (12126 chars)
✓ CLAUDE_LEAD.md         13.0 KB (13360 chars)
✓ CLAUDE_PLAN.md         47.7 KB (48816 chars)
✓ CLAUDE_EXEC.md         10.4 KB (10698 chars)
```

### Generation Logic

1. **Load Mapping**: Read `section-file-mapping.json` to determine which sections go in which files
2. **Query Database**: Fetch all sections from `leo_protocol_sections` table
3. **Filter by Mapping**: Each file generator filters sections based on mapping
4. **Format Sections**: Remove duplicate headers, add metadata
5. **Write Files**: Generate all 5 files simultaneously

### Section-to-File Mapping

See `scripts/section-file-mapping.json` for complete mapping. Key mappings:

**Router**:
- file_warning
- smart_router
- session_prologue

**Core**:
- application_architecture
- execution_philosophy
- git_commit_guidelines
- pr_size_guidelines
- communication_context
- parallel_execution
- development_workflow
- database_first_enforcement_expanded
- supabase_operations

**LEAD**:
- lead_operations
- directive_submission_review
- lead_code_review_requirement
- simplicity_first_enforcement
- lead_pre_approval_simplicity_gate
- sd_evaluation
- knowledge_retrieval

**PLAN**:
- PHASE_2_PLANNING
- plan_pre_exec_checklist
- testing_tier_strategy
- plan_cicd_verification
- plan_presentation_template
- PHASE_4_VERIFICATION
- bmad_enhancements
- design_database_validation_gates
- qa_engineering_enhanced
- schema_documentation_access
- database_schema_overview

**EXEC**:
- exec_implementation_requirements
- exec_component_sizing_guidelines
- exec_todo_comment_standard
- exec_dual_test_requirement
- exec_edge_case_testing_checklist
- testing_tools
- e2e_testing_mode_configuration

## Maintenance

### Adding New Sections

1. **Add to Database**: Insert new section in `leo_protocol_sections` table
   ```sql
   INSERT INTO leo_protocol_sections (
     protocol_id, section_type, title, content, order_index
   ) VALUES (
     'leo-v4-2-0-story-gates',
     'new_section_type',
     'Section Title',
     'Section content...',
     100
   );
   ```

2. **Update Mapping**: Add section_type to appropriate file in `section-file-mapping.json`
   ```json
   {
     "CLAUDE_CORE.md": {
       "sections": [
         "existing_section",
         "new_section_type"
       ]
     }
   }
   ```

3. **Regenerate Files**: Run generation script
   ```bash
   node scripts/generate-claude-md-from-db.js
   ```

### Modifying Existing Sections

1. **Update Database**: Edit content in `leo_protocol_sections` table
2. **Regenerate Files**: Run generation script (no mapping changes needed)

### Moving Sections Between Files

1. **Update Mapping**: Move section_type from one file to another in mapping.json
2. **Regenerate Files**: Run generation script

### Debugging

**File Too Large**:
- Check which sections are included: Review mapping.json
- Consider moving reference content to docs/reference/ instead

**Section Not Appearing**:
- Verify section exists in database: Query `leo_protocol_sections`
- Check mapping includes section_type: Review section-file-mapping.json
- Regenerate files: Run generation script

**Duplicate Content**:
- Check if section appears in multiple mappings
- Verify section_type is unique in database

## Benefits

1. **Performance**: 76.8% reduction in initial context consumption
2. **Scalability**: Can add more sections without impacting initial load
3. **Flexibility**: Load only what's needed for current phase
4. **Maintainability**: Database-first, easy to update
5. **Clarity**: Phase-specific guidance grouped logically

## Future Enhancements

### Potential Improvements

1. **Redistribute CLAUDE_PLAN.md sections**: Currently 49k chars (target was 30-35k)
   - Move some quick-reference sections to SHARED or reference docs
   - Split large validation gates into separate reference doc

2. **Add CLAUDE_REFERENCE.md**: Catch-all for general reference content
   - Quick reference commands
   - Database operations
   - Testing tools
   - Sub-agent documentation

3. **Dynamic Section Loading**: Instead of loading entire files, load individual sections on-demand
   - Would require changes to how Claude Code loads context
   - Could reduce phase-specific loads by 30-40%

4. **Context Compression**: Further optimize section content
   - Remove redundant information
   - Use more concise formatting
   - Link to external docs instead of inline content

## Related Documentation

- **Generation Script**: `scripts/generate-claude-md-from-db.js`
- **Section Mapping**: `scripts/section-file-mapping.json`
- **Database Schema**: `database/schema/007_leo_protocol_schema_fixed.sql`
- **LEO Protocol**: Main CLAUDE.md router file
- **Context Monitoring**: `docs/reference/context-monitoring.md`

---

*This architecture was implemented on 2025-10-30 to address performance issues with the 173k char monolithic CLAUDE.md file.*
