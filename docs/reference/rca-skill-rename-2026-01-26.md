---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# RCA Skill Rename: `/escalate` → `/rca`


## Table of Contents

- [Metadata](#metadata)
- [Overview](#overview)
- [Rationale](#rationale)
  - [Why Rename?](#why-rename)
  - [User Feedback](#user-feedback)
- [Changes Made](#changes-made)
  - [1. Database Updates](#1-database-updates)
  - [2. Skill Definition Files](#2-skill-definition-files)
  - [3. Active Script Updates](#3-active-script-updates)
  - [4. Generated Files (Auto-Regenerated)](#4-generated-files-auto-regenerated)
  - [5. Documentation Updates](#5-documentation-updates)
  - [6. Unchanged (Intentionally)](#6-unchanged-intentionally)
- [Migration Guide](#migration-guide)
  - [For Users](#for-users)
  - [For Developers](#for-developers)
- [Backward Compatibility](#backward-compatibility)
  - [Preserved References](#preserved-references)
- [Testing Verification](#testing-verification)
  - [Manual Tests Performed](#manual-tests-performed)
  - [Validation Queries](#validation-queries)
- [Rollback Plan](#rollback-plan)
- [Related Documentation](#related-documentation)
- [Future Considerations](#future-considerations)
  - [Potential Follow-ups](#potential-follow-ups)
- [Version History](#version-history)
  - [v1.0.0 (2026-01-26)](#v100-2026-01-26)

## Metadata
- **Category**: Reference
- **Status**: Approved
- **Version**: 1.0.0
- **Author**: LEO Protocol Team
- **Last Updated**: 2026-01-26
- **Tags**: rca, escalate, skill-rename, breaking-change, documentation

## Overview

On 2026-01-26, the `/escalate` skill was renamed to `/rca` for consistency and clarity. This document records the rename rationale, affected components, and migration guide.

## Rationale

### Why Rename?

1. **Naming Consistency**: The sub-agent is called `rca-agent` (Root Cause Agent), not "escalate-agent"
2. **Industry Standard**: "RCA" (Root Cause Analysis) is a universally recognized term in quality management
3. **Semantic Clarity**: "Escalate" is ambiguous - could mean escalate priority, escalate to human, etc.
4. **Direct Mapping**: `/rca` skill → `rca-agent` sub-agent is a clear 1:1 relationship

### User Feedback

> "Don't you think they're kinda similar?" - User observation that `/escalate` and `rca-agent` overlap in functionality

**Resolution**: Consolidate under the industry-standard RCA terminology.

## Changes Made

### 1. Database Updates

| Table | Column/Field | Change | Status |
|-------|--------------|--------|--------|
| `leo_protocol_sections` | ID 391: content | "Escalation Triggers → `/escalate`" → "RCA Triggers → `/rca`" | ✅ |
| `leo_autonomous_directives` | FIVE_WHYS_RCA: content | `/escalate` → `/rca` | ✅ |

### 2. Skill Definition Files

| Old Path | New Path | Status |
|----------|----------|--------|
| `.claude/commands/escalate.md` | `.claude/commands/rca.md` | ✅ Moved |

### 3. Active Script Updates

| File | Lines Changed | Status |
|------|---------------|--------|
| `scripts/leo-continuous-prompt.js` | 3 references | ✅ |
| `scripts/modules/handoff/executors/BaseExecutor.js` | 2 references | ✅ |
| `scripts/modules/handoff/pre-checks/pending-migrations-check.js` | 1 reference | ✅ |
| `lib/utils/post-completion-requirements.js` | Added 'rca' source | ✅ |

### 4. Generated Files (Auto-Regenerated)

| File | Status |
|------|--------|
| `CLAUDE.md` | ✅ Regenerated from database |
| `CLAUDE_CORE.md` | ✅ Regenerated from database |
| `CLAUDE_LEAD.md` | ✅ Regenerated from database |
| `CLAUDE_PLAN.md` | ✅ Regenerated from database |
| `CLAUDE_EXEC.md` | ✅ Regenerated from database |

### 5. Documentation Updates

| File | Change | Status |
|------|--------|--------|
| `docs/reference/root-cause-agent.md` | v2.1.0 - Added `/rca` skill section | ✅ |

### 6. Unchanged (Intentionally)

**Historical Records** - No changes needed:
- Migration files (`database/migrations/*.sql`)
- Archived scripts (`scripts/archived-sd-scripts/*.js`)
- Spec documents (`docs/specs/*.md`)
- Uses of "escalate" as a verb (not command)

## Migration Guide

### For Users

**No action required** - Skill triggers updated automatically:

| Old Trigger | New Trigger | Status |
|-------------|-------------|--------|
| "escalate this issue" | ✅ Still works (semantic match) | Mapped to `/rca` |
| "need root cause" | ✅ Primary trigger | Invokes `/rca` |
| "5 whys" | ✅ Primary trigger | Invokes `/rca` |

### For Developers

**Skill Invocation Code**:

```javascript
// OLD (deprecated, but still works for backward compat)
Skill({ skill: "escalate" })

// NEW (preferred)
Skill({ skill: "rca" })
```

**Database SD Source**:

```sql
-- OLD source value (still recognized)
INSERT INTO strategic_directives_v2 (source) VALUES ('escalation');

-- NEW source value (preferred)
INSERT INTO strategic_directives_v2 (source) VALUES ('rca');

-- Both skip /learn command (see LEARN_SKIP_SOURCES in post-completion-requirements.js)
```

## Backward Compatibility

### Preserved References

1. **`LEARN_SKIP_SOURCES`** in `lib/utils/post-completion-requirements.js`:
   ```javascript
   const LEARN_SKIP_SOURCES = [
     'rca',        // New
     'escalation', // Legacy (preserved for backward compat)
     // ...
   ];
   ```

2. **Database Records**: Existing SDs with `source='escalation'` continue to work

3. **Skill Trigger Keywords**: "escalate" keyword still triggers RCA analysis (mapped to `/rca`)

## Testing Verification

### Manual Tests Performed

✅ Database updates applied successfully
✅ Skill file renamed and content updated
✅ CLAUDE.md files regenerated without errors
✅ Active scripts updated with new command reference
✅ Backward compatibility preserved for 'escalation' source

### Validation Queries

```bash
# Verify database section updated
node -e "require('dotenv').config(); const {createClient}=require('@supabase/supabase-js'); createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY).from('leo_protocol_sections').select('content').eq('id', 391).single().then(({data})=>console.log(data.content.includes('/rca') ? '✅ Updated' : '❌ Failed'))"

# Verify CLAUDE files contain /rca
grep -q "/rca" CLAUDE_EXEC.md && echo "✅ CLAUDE_EXEC.md updated" || echo "❌ Failed"
grep -q "/rca" CLAUDE_PLAN.md && echo "✅ CLAUDE_PLAN.md updated" || echo "❌ Failed"

# Verify old command file removed
test ! -f .claude/commands/escalate.md && echo "✅ Old file removed" || echo "❌ Still exists"

# Verify new command file exists
test -f .claude/commands/rca.md && echo "✅ New file created" || echo "❌ Not found"
```

## Rollback Plan

If rollback is needed:

```bash
# 1. Restore database sections
node -e "/* Update leo_protocol_sections ID 391 content back to /escalate */"

# 2. Rename skill file back
mv .claude/commands/rca.md .claude/commands/escalate.md

# 3. Revert script changes
git checkout HEAD -- scripts/leo-continuous-prompt.js scripts/modules/handoff/executors/BaseExecutor.js scripts/modules/handoff/pre-checks/pending-migrations-check.js

# 4. Regenerate CLAUDE files
node scripts/generate-claude-md-from-db.js
```

## Related Documentation

- **RCA Agent Guide**: [docs/reference/root-cause-agent.md](root-cause-agent.md)
- **RCA Sub-Agent**: [.claude/agents/rca-agent.md](../../.claude/agents/rca-agent.md)
- **RCA Skill Command**: [.claude/commands/rca.md](../../.claude/commands/rca.md)
- **Command Ecosystem**: [docs/leo/commands/command-ecosystem.md](../leo/commands/command-ecosystem.md)

## Future Considerations

### Potential Follow-ups

1. **Alias Support**: Add `/escalate` as explicit alias to `/rca` if user confusion detected
2. **Deprecation Warning**: Log warning if old `source='escalation'` used (suggest `'rca'`)
3. **Documentation Audit**: Search for remaining "escalate" references in markdown files
4. **User Communication**: Announce rename in next protocol version release notes

## Version History

### v1.0.0 (2026-01-26)
- Initial documentation of `/escalate` → `/rca` rename
- Cataloged all affected files and database entries
- Documented migration guide and backward compatibility approach
- Recorded testing verification steps

---

**Status**: ✅ Rename Complete
**Breaking Changes**: None (backward compatible)
**User Action Required**: None (automatic skill mapping)
