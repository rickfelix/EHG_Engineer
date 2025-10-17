# Context Optimization Guide - Multi-File CLAUDE.md System

**Last Updated**: 2025-10-13
**Status**: ✅ ACTIVE
**Savings**: 83% reduction (123k → 21k chars)

---

## Overview

The LEO Protocol context has been optimized from a single 123k char file into a multi-file system that loads context on-demand based on workflow phase.

## File Structure

### Generated Files

| File | Size | Purpose | When to Load |
|------|------|---------|--------------|
| **CLAUDE.md** | 7k | Router with loading instructions | Always (entry point) |
| **CLAUDE_CORE.md** | 14k | Essential workflow context | Always (after router) |
| **CLAUDE_LEAD.md** | 23k | Core + LEAD operations | LEAD phase tasks |
| **CLAUDE_PLAN.md** | 28k | Core + PLAN operations | PLAN phase tasks |
| **CLAUDE_EXEC.md** | 33k | Core + EXEC operations | EXEC phase tasks |
| **docs/reference/*.md** | 32 files | Detailed patterns | On-demand only |

### Context Budget Impact

**Before Optimization**:
- Session start: 123k chars (62% of 200k budget)
- Remaining budget: 77k chars

**After Optimization**:
- Session start: 7k (router) + 14k (core) = 21k chars (11% of budget)
- Remaining budget: 179k chars
- **Savings**: 102k chars (83% reduction)

**With Phase Loaded**:
- LEAD phase: 21k chars (11% of budget)
- PLAN phase: 28k chars (14% of budget)
- EXEC phase: 33k chars (17% of budget)

---

## How It Works

### 1. Router System (CLAUDE.md)

**Purpose**: AI reads this first, gets explicit instructions on which file to load next

**Decision Tree**:
```
User request contains:
  - "approve", "LEAD", "directive" → Load CLAUDE_LEAD.md
  - "PRD", "PLAN", "validation" → Load CLAUDE_PLAN.md
  - "implement", "EXEC", "code" → Load CLAUDE_EXEC.md
  - Database error → Load docs/reference/database-agent-patterns.md
  - Validation failure → Load docs/reference/validation-enforcement.md
```

### 2. Core Context (CLAUDE_CORE.md)

**Always Load First**: Contains essential context for all sessions

**Sections** (9 core sections):
- Session prologue
- Application architecture (EHG vs EHG_Engineer)
- Execution philosophy
- Git commit guidelines
- Communication & context best practices
- Quick reference commands
- Development workflow
- Database operations overview
- Parallel execution patterns

### 3. Phase Files (Self-Contained)

Each phase file includes:
1. **CORE sections** (9 sections, 14k chars)
2. **Phase-specific sections** (8-9 sections, 9-19k chars)

**Why self-contained?**
- Single file read (more reliable than 2 reads)
- Works even if AI skips router
- Easier for AI to understand full context
- Redundancy is acceptable (14k duplicated × 3 = 42k, but ensures completeness)

### 4. Reference Documentation (On-Demand)

**32 reference files** in `docs/reference/`:
- Load ONLY when specific issues arise
- Examples: database errors, validation failures, test timeouts
- Each file 5-15k chars
- Prevents loading unnecessary context

---

## Database Architecture

### Tables Enhanced

**leo_protocol_sections** - Added 2 columns:
```sql
context_tier TEXT CHECK (context_tier IN ('ROUTER', 'CORE', 'PHASE_LEAD', 'PHASE_PLAN', 'PHASE_EXEC', 'REFERENCE'))
target_file TEXT
```

### Section Classification

**70 total sections** (69 original + 1 router):
- **ROUTER**: 1 section → CLAUDE.md
- **CORE**: 9 sections → CLAUDE_CORE.md
- **PHASE_LEAD**: 8 sections → CLAUDE_LEAD.md
- **PHASE_PLAN**: 9 sections → CLAUDE_PLAN.md
- **PHASE_EXEC**: 8 sections → CLAUDE_EXEC.md
- **REFERENCE**: 32 sections → docs/reference/*.md

---

## Generator Script

### Version 3 (Multi-File)

**File**: `scripts/generate-claude-md-from-db-v3.js`

**Usage**:
```bash
node scripts/generate-claude-md-from-db-v3.js
```

**Output**:
- Generates 5 CLAUDE files
- Extracts 32 reference docs
- Reports context savings
- Verifies all files created

**Execution Time**: ~3 seconds

### Backward Compatibility

**Old generator** (V2):
- File: `scripts/generate-claude-md-from-db.js`
- Still works, generates single 123k CLAUDE.md
- Kept for emergency fallback

**Migration Path**:
- V3 generator is now primary
- Old CLAUDE.md backed up automatically
- Router at CLAUDE.md becomes standard entry point

---

## AI Loading Strategy

### Session Start

1. AI reads CLAUDE.md (router, 7k chars)
2. Router says: "Read CLAUDE_CORE.md first"
3. AI reads CLAUDE_CORE.md (14k chars)
4. **Total loaded**: 21k chars (11% of budget)

### Phase Detection

Router provides decision tree:
- Keywords detected → Load appropriate phase file
- No phase keywords → CORE is sufficient
- Specific error → Load relevant reference doc

### Example Flows

**Example 1: LEAD Approval**
```
User: "Approve SD-EXPORT-001"
AI: Reads CLAUDE.md (7k) → Detects "approve" → Reads CLAUDE_LEAD.md (23k)
Total: 30k chars (15% of budget)
Savings vs old: 93k chars (76% reduction)
```

**Example 2: Database Error**
```
User: "Getting 'column does not exist' error"
AI: Reads CLAUDE.md (7k) → Reads CLAUDE_CORE.md (14k) → Reads database-agent-patterns.md (15k)
Total: 36k chars (18% of budget)
Savings vs old: 87k chars (71% reduction)
```

**Example 3: General Question**
```
User: "What's the git commit format?"
AI: Reads CLAUDE.md (7k) → Reads CLAUDE_CORE.md (14k) → Answer from core
Total: 21k chars (11% of budget)
Savings vs old: 102k chars (83% reduction)
```

---

## Maintenance

### Adding New Sections

1. **Insert into database**:
```sql
INSERT INTO leo_protocol_sections
(protocol_id, section_type, title, content, context_tier, target_file, order_index)
VALUES (...);
```

2. **Regenerate files**:
```bash
node scripts/generate-claude-md-from-db-v3.js
```

3. **Verify sizes**:
```bash
ls -lh CLAUDE*.md
```

### Modifying Existing Sections

1. **Update database**:
```sql
UPDATE leo_protocol_sections
SET content = 'new content'
WHERE section_type = 'section_name';
```

2. **Regenerate files**:
```bash
node scripts/generate-claude-md-from-db-v3.js
```

### Reclassifying Sections

**If section should move to different tier**:

```sql
-- Example: Move section from REFERENCE to CORE
UPDATE leo_protocol_sections
SET context_tier = 'CORE', target_file = 'CLAUDE_CORE.md'
WHERE section_type = 'important_section';
```

Then regenerate.

---

## Troubleshooting

### Files Not Generating

**Check**:
1. Database connection: `node -e "console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)"`
2. Sections exist: Query `leo_protocol_sections` table
3. Columns exist: Check for `context_tier` and `target_file` columns

**Fix**:
```bash
node scripts/add-context-tier-columns.js
node scripts/classify-protocol-sections.js
```

### Router Content Outdated

**Regenerate router section**:
```bash
node scripts/create-router-section.js
```

### Wrong Context Tier

**Reclassify section** (see "Reclassifying Sections" above)

### Reference Docs Missing

**Re-extract**:
```bash
node scripts/generate-claude-md-from-db-v3.js
```

All 32 reference docs will be regenerated in `docs/reference/`

---

## Performance Metrics

### Achieved Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Session start | 123k | 21k | 83% reduction |
| LEAD phase | 123k | 30k | 76% reduction |
| PLAN phase | 123k | 28k | 77% reduction |
| EXEC phase | 123k | 33k | 73% reduction |
| Remaining budget | 77k | 179k | 132% increase |

### Expected Impact

- **Faster responses**: Less context to process
- **Better focus**: AI sees only relevant sections
- **More working memory**: 179k vs 77k remaining budget
- **Clearer guidance**: Router provides explicit instructions

---

## Future Enhancements

### Potential Improvements

1. **Dynamic tier adjustment**: Auto-classify sections based on usage patterns
2. **Context compression**: Further optimize large sections
3. **Smart caching**: Remember which files loaded in session
4. **Usage analytics**: Track which reference docs most accessed

### Monitoring

Track context consumption in handoffs:
```markdown
## Context Health
**Current Usage**: X tokens (Y% of 200K budget)
**Files Loaded**: CLAUDE.md, CLAUDE_CORE.md, CLAUDE_EXEC.md
**Status**: HEALTHY (28% of budget)
```

---

## Scripts Reference

### Classification & Setup
- `scripts/add-context-tier-columns.js` - Add database columns
- `scripts/classify-protocol-sections.js` - Tag 70 sections
- `scripts/create-router-section.js` - Create router section

### Generation
- `scripts/generate-claude-md-from-db-v3.js` - Multi-file generator (PRIMARY)
- `scripts/generate-claude-md-from-db.js` - Single-file generator (BACKUP)

### Verification
```bash
# Check generated files
ls -lh CLAUDE*.md

# Verify section classification
node -e "..." # Query database

# Test context savings
wc -l CLAUDE*.md
```

---

## Success Criteria ✅

- [x] CLAUDE.md (router) ≤ 10k chars **→ 7k chars ✅**
- [x] CLAUDE_CORE.md ≤ 20k chars **→ 14k chars ✅**
- [x] Phase files ≤ 35k chars each **→ 23-33k chars ✅**
- [x] 32 reference docs extracted **→ 32 docs ✅**
- [x] Generator creates all files successfully **→ Works ✅**
- [x] Router contains clear decision tree **→ Complete ✅**
- [x] Context savings measured and verified **→ 83% reduction ✅**

---

## Contact & Support

**Issues**: Report via GitHub issues
**Questions**: Reference this guide first
**Updates**: Regenerate files after database changes

**Last Regenerated**: Check timestamp in each CLAUDE file
**Next Review**: As needed when adding new sections

---

*Part of LEO Protocol v4.2.0 performance optimization*
*Database-first architecture maintained*
*All context sourced from leo_protocol_sections table*
