-- RCA Issue Resolution Mandate
-- Adds critical instruction to use RCA sub-agent instead of workarounds
-- This section appears at TOP and BOTTOM of all CLAUDE files
-- Date: 2026-01-31

-- Insert the RCA Issue Resolution Mandate section
INSERT INTO leo_protocol_sections (
    protocol_id,
    section_type,
    title,
    content,
    order_index,
    metadata
) VALUES (
    'leo-v4-3-3-ui-parity',
    'rca_issue_resolution_mandate',
    'RCA Issue Resolution Mandate',
    E'## ⚠️ CRITICAL: Issue Resolution Protocol\n\n**When you encounter ANY issue, error, or unexpected behavior:**\n\n1. **DO NOT work around it** - Workarounds hide problems and create technical debt\n2. **DO NOT ignore it** - Every issue is a signal that something needs attention\n3. **INVOKE the RCA Sub-Agent** - Use `subagent_type="rca-agent"` via the Task tool\n\n**Example invocation:**\n```\nTask tool with subagent_type="rca-agent":\n"Analyze why [describe the issue] is occurring.\nPerform 5-whys analysis and identify the root cause."\n```\n\n**Why this matters:**\n- Root cause fixes prevent recurrence\n- Issues captured in `issue_patterns` table benefit future sessions\n- Systematic analysis produces better solutions than quick fixes\n\n**The only acceptable response to an issue is understanding WHY it happened.**',
    0,
    '{"placement": "top_and_bottom", "critical": true, "applies_to": ["CLAUDE.md", "CLAUDE_CORE.md", "CLAUDE_LEAD.md", "CLAUDE_PLAN.md", "CLAUDE_EXEC.md"]}'::jsonb
)
ON CONFLICT (protocol_id, section_type, order_index) DO UPDATE SET
    content = EXCLUDED.content,
    metadata = EXCLUDED.metadata;
