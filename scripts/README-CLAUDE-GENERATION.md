# CLAUDE.md Generation Script - Quick Reference

## Overview

The `generate-claude-md-from-db.js` script creates 5 modular CLAUDE files from the database, implementing a router architecture that reduces initial context consumption by **76.8%**.

## Quick Start

```bash
# Regenerate all CLAUDE files from database
node scripts/generate-claude-md-from-db.js
```

**Output**:
```
✓ CLAUDE.md               8.8 KB (9040 chars)    - Router
✓ CLAUDE_CORE.md         11.8 KB (12126 chars)   - Always loaded
✓ CLAUDE_LEAD.md         13.0 KB (13360 chars)   - LEAD phase
✓ CLAUDE_PLAN.md         47.7 KB (48816 chars)   - PLAN phase
✓ CLAUDE_EXEC.md         10.4 KB (10698 chars)   - EXEC phase
```

## Architecture

### Before (V2 - Monolithic)
- Single CLAUDE.md: **175,057 chars** (87.5% of 200k budget)
- All content loaded on every session
- Performance impact: Severe

### After (V3 - Router)
- Initial load: **21,360 chars** (10.7% of budget)
- Phase-specific files loaded on-demand
- Performance impact: Minimal

## Files Generated

| File | Size | Purpose | Load Strategy |
|------|------|---------|---------------|
| **CLAUDE.md** | 9k | Router with loading instructions | Always |
| **CLAUDE_CORE.md** | 12k | Essential context for all sessions | Always (Step 1) |
| **CLAUDE_LEAD.md** | 13k | LEAD phase operations | On-demand (keywords) |
| **CLAUDE_PLAN.md** | 49k | PLAN phase operations | On-demand (keywords) |
| **CLAUDE_EXEC.md** | 11k | EXEC phase operations | On-demand (keywords) |

## How It Works

### 1. Load Mapping
```javascript
// scripts/section-file-mapping.json
{
  "CLAUDE.md": { "sections": ["file_warning", "smart_router", "session_prologue"] },
  "CLAUDE_CORE.md": { "sections": ["application_architecture", ...] },
  "CLAUDE_LEAD.md": { "sections": ["lead_operations", ...] },
  "CLAUDE_PLAN.md": { "sections": ["plan_pre_exec_checklist", ...] },
  "CLAUDE_EXEC.md": { "sections": ["exec_implementation_requirements", ...] }
}
```

### 2. Query Database
```javascript
const { data: sections } = await supabase
  .from('leo_protocol_sections')
  .select('*')
  .eq('protocol_id', protocol.id)
  .order('order_index');
```

### 3. Filter & Generate
```javascript
// For each file
const coreSections = this.getSectionsByMapping(sections, 'CLAUDE_CORE.md');
const content = coreSections.map(s => this.formatSection(s)).join('\n\n');
fs.writeFileSync('CLAUDE_CORE.md', content);
```

## Common Tasks

### Add New Section

**Step 1**: Add to database
```sql
INSERT INTO leo_protocol_sections (
  protocol_id, section_type, title, content, order_index
) VALUES (
  'leo-v4-2-0-story-gates',
  'my_new_section',
  'My New Section Title',
  'Section content here...',
  150  -- Order index determines position
);
```

**Step 2**: Update mapping
```json
// scripts/section-file-mapping.json
{
  "CLAUDE_CORE.md": {
    "sections": [
      "application_architecture",
      "my_new_section"  // Add here
    ]
  }
}
```

**Step 3**: Regenerate
```bash
node scripts/generate-claude-md-from-db.js
```

### Move Section Between Files

**Step 1**: Update mapping only
```json
// Move from CLAUDE_CORE.md to CLAUDE_LEAD.md
{
  "CLAUDE_CORE.md": {
    "sections": [
      // Remove from here
    ]
  },
  "CLAUDE_LEAD.md": {
    "sections": [
      "lead_operations",
      "my_section"  // Add here
    ]
  }
}
```

**Step 2**: Regenerate
```bash
node scripts/generate-claude-md-from-db.js
```

### Update Existing Section

**Step 1**: Update database only
```sql
UPDATE leo_protocol_sections
SET content = 'Updated content...'
WHERE section_type = 'my_section';
```

**Step 2**: Regenerate
```bash
node scripts/generate-claude-md-from-db.js
```

## Troubleshooting

### File Too Large

**Problem**: CLAUDE_PLAN.md is 49k (target was 30-35k)

**Solutions**:
1. Review sections in mapping: Check which sections contribute most
2. Move reference content: Move guides to `docs/reference/` instead
3. Split large sections: Break validation gates into separate docs

```bash
# Check what's in a file
grep "^## " CLAUDE_PLAN.md

# Find large sections in database
node -e "
import('dotenv').then(d => d.default.config());
import('@supabase/supabase-js').then(({ createClient }) => {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  supabase.from('leo_protocol_sections').select('section_type, title, content').then(({ data }) => {
    data.sort((a, b) => b.content.length - a.content.length);
    data.slice(0, 10).forEach(s => console.log(\`\${s.content.length.toString().padStart(6)} chars: \${s.section_type}\`));
  });
});
"
```

### Section Not Appearing

**Problem**: Added section to database but not showing in generated file

**Check**:
1. Section exists in database?
   ```sql
   SELECT * FROM leo_protocol_sections WHERE section_type = 'my_section';
   ```

2. Section in mapping?
   ```bash
   grep "my_section" scripts/section-file-mapping.json
   ```

3. Regenerated files?
   ```bash
   node scripts/generate-claude-md-from-db.js
   ```

### Duplicate Content

**Problem**: Same content appearing in multiple files

**Check**:
1. Section listed in multiple mappings?
   ```bash
   grep -A 10 '"sections"' scripts/section-file-mapping.json | grep "my_section"
   ```

2. Multiple sections with similar content?
   ```sql
   SELECT section_type, title FROM leo_protocol_sections
   WHERE content LIKE '%specific text%';
   ```

## Script Internals

### Class: CLAUDEMDGeneratorV3

**Main Methods**:
- `generate()` - Main entry point, orchestrates file generation
- `generateRouter(data)` - Creates CLAUDE.md router file
- `generateCore(data)` - Creates CLAUDE_CORE.md
- `generateLead(data)` - Creates CLAUDE_LEAD.md
- `generatePlan(data)` - Creates CLAUDE_PLAN.md
- `generateExec(data)` - Creates CLAUDE_EXEC.md

**Helper Methods**:
- `getSectionsByMapping(sections, fileKey)` - Filter sections by mapping
- `formatSection(section)` - Format section with header
- `generateAgentSection(agents)` - Create agent responsibility table
- `generateHandoffTemplates(templates)` - Format handoff templates
- `generateValidationRules(rules)` - Format validation rules

### Data Sources

**Database Tables**:
- `leo_protocols` - Active protocol version
- `leo_protocol_sections` - All protocol sections (83 sections, 168k chars)
- `leo_agents` - Agent definitions and percentages
- `leo_sub_agents` - Sub-agent definitions
- `leo_handoff_templates` - Handoff templates
- `leo_validation_rules` - Validation rules

**Configuration**:
- `scripts/section-file-mapping.json` - Section-to-file assignments

## Performance Metrics

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial Load | 175k chars | 21k chars | **87.9% reduction** |
| Context Budget | 87.5% | 10.7% | **76.8% savings** |
| LEAD Load | 175k | 35k | **80.0% reduction** |
| PLAN Load | 175k | 71k | **59.4% reduction** |
| EXEC Load | 175k | 32k | **81.7% reduction** |

## Related Documentation

- **Architecture Guide**: `docs/reference/claude-md-router-architecture.md`
- **Section Mapping**: `scripts/section-file-mapping.json`
- **Database Schema**: `database/schema/007_leo_protocol_schema_fixed.sql`
- **Generator Script**: `scripts/generate-claude-md-from-db.js`

---

**Version**: V3 (Router Architecture)
**Last Updated**: 2025-10-30
**Author**: LEO Protocol Team
