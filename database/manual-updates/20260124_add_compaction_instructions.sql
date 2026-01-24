-- Add Compaction Instructions to leo_protocol_sections for CLAUDE.md regeneration
-- This ensures the instructions persist across regenerations

INSERT INTO leo_protocol_sections (
    section_key,
    section_type,
    title,
    content,
    sort_order,
    is_active,
    created_at,
    updated_at
) VALUES (
    'compaction_instructions',
    'core_principle',
    'Compaction Instructions (CRITICAL)',
    E'**When context is compacted (manually or automatically), ALWAYS preserve:**\n\n1. **Current SD State** (NEVER LOSE):\n   - Current SD key (e.g., `SD-FIX-ANALYTICS-001`)\n   - Current phase (LEAD/PLAN/EXEC)\n   - Gate pass/fail status\n   - Active branch name\n\n2. **Modified Files** (PRESERVE LIST):\n   - All files changed in current session\n   - Pending uncommitted changes\n   - Recent commit hashes (last 3)\n\n3. **Critical Context** (SUMMARIZE, DON''T DROP):\n   - Active user stories being implemented\n   - Specific error messages being debugged\n   - Database query results that drive decisions\n   - Test commands and their outcomes\n\n4. **NEVER Compress Away**:\n   - The `.claude/session-state.md` reference\n   - The `.claude/compaction-snapshot.md` reference\n   - Active PRD requirements\n   - User''s explicit instructions from this session\n\n5. **Safe to Discard**:\n   - Verbose sub-agent exploration logs\n   - Full file contents (keep file paths only)\n   - Repetitive status checks\n   - Historical handoff details (older than current phase)\n\n**After compaction, IMMEDIATELY read:**\n- `.claude/compaction-snapshot.md` (git state)\n- `.claude/session-state.md` (work state)',
    615,  -- After Context-Aware section
    true,
    NOW(),
    NOW()
) ON CONFLICT (section_key) DO UPDATE SET
    content = EXCLUDED.content,
    updated_at = NOW();
