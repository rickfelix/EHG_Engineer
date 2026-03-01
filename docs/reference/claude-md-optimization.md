---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# CLAUDE.md File Size Optimization


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Background](#background)
  - [The Problem](#the-problem)
  - [The Solution](#the-solution)
- [Optimization Strategy](#optimization-strategy)
  - [1. Identify Space Consumers](#1-identify-space-consumers)
  - [2. Categorize Sections](#2-categorize-sections)
  - [3. Preservation Principles](#3-preservation-principles)
- [Implementation Process](#implementation-process)
  - [Step 1: Create Update Script](#step-1-create-update-script)
  - [Step 2: Update Database Sections](#step-2-update-database-sections)
  - [Step 3: Deprecate Redundant Sections](#step-3-deprecate-redundant-sections)
  - [Step 4: Regenerate CLAUDE Files](#step-4-regenerate-claude-files)
  - [Step 5: Verify and Cleanup](#step-5-verify-and-cleanup)
- [Results Achieved](#results-achieved)
  - [Size Reduction](#size-reduction)
  - [Sections Updated](#sections-updated)
  - [Deprecated Sections](#deprecated-sections)
- [Techniques Used](#techniques-used)
  - [1. Table Compression](#1-table-compression)
  - [2. Reference Documentation Links](#2-reference-documentation-links)
  - [Scoring Scale Philosophy](#scoring-scale-philosophy)
  - [Scoring Scale](#scoring-scale)
  - [3. Workflow Diagram Simplification](#3-workflow-diagram-simplification)
  - [4. Section Consolidation](#4-section-consolidation)
- [Best Practices](#best-practices)
  - [When to Condense](#when-to-condense)
  - [How to Preserve Value](#how-to-preserve-value)
  - [Validation Checklist](#validation-checklist)
- [Maintenance](#maintenance)
  - [When to Re-optimize](#when-to-re-optimize)
  - [How to Monitor Size](#how-to-monitor-size)
  - [Future Opportunities](#future-opportunities)
- [Related Documentation](#related-documentation)
- [Version History](#version-history)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: Documentation Agent
- **Last Updated**: 2026-01-25
- **Tags**: claude, optimization, context, protocol-sections, performance

## Overview

This document describes the process and techniques used to reduce the size of CLAUDE_CORE.md (and other CLAUDE files) by 40% while preserving all functional value. The optimization improves context budget efficiency in LEO Protocol sessions.

## Background

### The Problem
- **Original size**: CLAUDE_CORE.md was 2,505 lines (~29,508 tokens / 77.3 KB)
- **Target**: Reduce to ~15-20k characters as stated in file header
- **Constraint**: All content is generated from `leo_protocol_sections` database table
- **Impact**: Large context files reduce available token budget for actual work

### The Solution
Database-driven content condensation with strategic moves to reference documentation.

## Optimization Strategy

### 1. Identify Space Consumers

Analyze sections by size:

```bash
node -e "
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const { data } = await supabase
    .from('leo_protocol_sections')
    .select('section_type, content')
    .order('section_type');

  const coreSections = data.filter(s => CORE_TYPES.includes(s.section_type));
  coreSections.sort((a, b) => (b.content?.length || 0) - (a.content?.length || 0));

  coreSections.slice(0, 15).forEach(s => {
    const len = s.content?.length || 0;
    console.log(String(len).padStart(6) + ' chars - ' + s.section_type);
  });
}
main();
"
```

### 2. Categorize Sections

| Category | Action | Example |
|----------|--------|---------|
| **Verbose Examples** | Condense to tables | AI Quality Rubrics (13,402 → 1,666 chars) |
| **ASCII Diagrams** | Remove or simplify | Plan Mode architecture (6,734 → 1,637 chars) |
| **Duplicative Content** | Consolidate | SD Type sections (3 merged into 1) |
| **Detailed Workflows** | Convert to checklists | Parent-Child hierarchy (4,236 → 1,479 chars) |

### 3. Preservation Principles

Always preserve:
- All functional commands and queries
- Essential workflow steps
- Key decision tables
- Links to detailed documentation

Always remove/condense:
- Verbose prose explanations
- Duplicate information across sections
- ASCII art and diagrams
- Extensive code examples (keep one representative example)

## Implementation Process

### Step 1: Create Update Script

```javascript
// scripts/temp-update-sections.js
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const condensedSection = `## Section Title

Condensed content here...
`;

async function main() {
  const { error } = await supabase
    .from('leo_protocol_sections')
    .update({ content: condensedSection })
    .eq('id', SECTION_ID);

  if (!error) {
    console.log('✅ Updated section');
  }
}

main().catch(console.error);
```

### Step 2: Update Database Sections

Run the update script for each section:

```bash
node scripts/temp-update-sections.js
```

### Step 3: Deprecate Redundant Sections

Instead of deleting, mark as deprecated by renaming `section_type`:

```javascript
const { error } = await supabase
  .from('leo_protocol_sections')
  .update({ section_type: section.section_type + '_deprecated' })
  .eq('id', DEPRECATED_ID);
```

This preserves content while removing from generated files.

### Step 4: Regenerate CLAUDE Files

```bash
node scripts/generate-claude-md-from-db.js
```

### Step 5: Verify and Cleanup

```bash
# Check new size
wc -l CLAUDE_CORE.md

# Remove temporary scripts
rm scripts/temp-update-sections*.js
```

## Results Achieved

### Size Reduction

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| **Lines** | 2,505 | 1,513 | -40% |
| **Size** | 77.3 KB | 59.0 KB | -24% |
| **Tokens** | ~29,508 | ~18,000 | ~39% |

### Sections Updated

| Section | Before | After | Saved |
|---------|--------|-------|-------|
| ai_quality_russian_judge | 13,402 | 1,666 | 11,736 |
| infrastructure (Plan Mode) | 6,734 | 1,637 | 5,097 |
| skill_integration | 6,352 | 1,711 | 4,641 |
| parent_child_overview | 4,236 | 1,479 | 2,757 |
| execution_philosophy | 3,426 | 1,327 | 2,099 |
| mandatory_phase_transitions | 3,251 | 1,449 | 1,802 |
| pattern_search_guide | 2,893 | 1,101 | 1,792 |
| application_architecture | 2,774 | 889 | 1,885 |
| weighted_keyword_scoring | 2,624 | 1,001 | 1,623 |
| communication_context | 2,638 | 714 | 1,924 |
| **Total** | - | - | **~35,000 chars** |

### Deprecated Sections

Consolidated into single sections:
- `conditional_handoffs` → `conditional_handoffs_deprecated`
- `sd_type_validation_requirements` → `sd_type_validation_requirements_deprecated`

## Techniques Used

### 1. Table Compression

**Before** (verbose paragraph):
```markdown
The Strategic Directive (SD) Quality Rubric evaluates content on four criteria:
Description Quality (weighted at 35%) assesses whether the SD includes WHAT,
WHY, business value, and technical approach. A score of 0-3 indicates missing
or generic content like "implement feature" or pure boilerplate...
```

**After** (compact table):
```markdown
| Content Type | Phase | Key Criteria (Weight) |
|--------------|-------|----------------------|
| **SD** | LEAD | Description (35%), Objectives (30%), Metrics (25%), Risks (10%) |
```

### 2. Reference Documentation Links

**Before** (inline detailed rubrics):
```markdown
### Scoring Scale Philosophy

**0-3: Completely inadequate** (missing, boilerplate, or unusable)
- Use for placeholder text, missing sections, pure boilerplate
- Example: "To be defined" in requirements

[... 50+ more lines of detailed examples]
```

**After** (reference link):
```markdown
### Scoring Scale
- **0-3**: Inadequate (placeholder text, boilerplate, missing)
- **4-6**: Needs improvement (generic, lacks specificity)
- **7-8**: Good quality (specific, actionable)
- **9-10**: Excellent (rare - comprehensive with measurement methods)

Full documentation: `docs/reference/ai-quality-rubrics.md`
```

### 3. Workflow Diagram Simplification

**Before** (ASCII diagram):
```
┌─────────────────────────────────────────────────────────────┐
│                    LEO Protocol                              │
│  (Phase: LEAD → PLAN → EXEC → VERIFY → FINAL)              │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┴──────────────┐
         │                            │
    Phase Boundary              Session Start
[... 15+ more lines of boxes and arrows]
```

**After** (table):
```markdown
| Phase | Pre-approved Actions |
|-------|---------------------|
| LEAD | SD queue commands, handoff scripts, git status |
| PLAN | PRD generation, sub-agent orchestration, git branches |
| EXEC | Tests, builds, git commit/push, handoff scripts |
```

### 4. Section Consolidation

**Before**: 3 separate sections covering SD type validation
- `conditional_handoffs` (2,412 chars)
- `sd_type_workflow_paths` (2,302 chars)
- `sd_type_validation_requirements` (3,490 chars)

**After**: 1 consolidated section
- `sd_type_workflow_paths` (1,870 chars with all content)

## Best Practices

### When to Condense

✅ **Condense when**:
- Multiple sections cover same topic
- Verbose examples repeat the same pattern
- ASCII diagrams can be replaced with tables
- Detailed content has a reference doc home
- Content is rarely referenced during sessions

❌ **Do NOT condense when**:
- Information is frequently needed during workflow
- Commands/queries need to be copy-paste ready
- Tables would become harder to read than prose
- Content provides critical decision-making context

### How to Preserve Value

1. **Keep one example** of each pattern (remove duplicates)
2. **Convert workflows to checklists** with [ ] markers
3. **Use tables for structured data** instead of paragraphs
4. **Link to reference docs** for deep dives
5. **Preserve all commands** and code snippets exactly

### Validation Checklist

After any optimization:

- [ ] All original functionality preserved
- [ ] No broken references to condensed sections
- [ ] Commands still copy-paste ready
- [ ] Tables maintain clarity
- [ ] Reference links point to valid files
- [ ] CLAUDE.md regenerates without errors
- [ ] File size reduction measured and reported

## Maintenance

### When to Re-optimize

Monitor and re-optimize when:
- CLAUDE_CORE.md grows beyond 70 KB
- New protocol sections added without review
- Context budget warnings appear in sessions
- File takes >3 seconds to read during startup

### How to Monitor Size

```bash
# Check current size
wc -l CLAUDE_CORE.md
du -h CLAUDE_CORE.md

# Check largest sections
node scripts/check-section-sizes.js
```

### Future Opportunities

Areas for potential future optimization:
- Sub-agent keyword lists (consider code-only storage)
- Hot patterns section (move older patterns to archive)
- Recent lessons (auto-expire after 90 days)
- Deprecated sections cleanup (delete after 6 months)

## Related Documentation

- [Database Schema](../01_architecture/database_schema.md) - leo_protocol_sections table
- [CLAUDE File Generator](../reference/claude-md-generation.md) - Generation process
- [Documentation Standards](../03_protocols_and_standards/documentation-standards.md) - File organization

## Version History

- **v1.0.0** (2026-01-25): Initial documentation of optimization process
  - 40% size reduction achieved
  - 10 sections condensed
  - 2 sections deprecated
  - No functional value lost
