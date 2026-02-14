#!/usr/bin/env node
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const newContent = `## CLAUDE.md Router (Context Loading)

### Loading Strategy (Digest-First)
1. **ALWAYS**: Read CLAUDE_CORE_DIGEST.md first (~10k) - compact enforcement rules
2. **Phase Detection**: Load phase-specific DIGEST file based on keywords
3. **Escalation**: Load FULL file only when digest is insufficient
4. **On-Demand**: Load reference docs only when issues arise

**CRITICAL**: This loading strategy applies to ALL SD work:
- New SDs being created
- Existing SDs being resumed
- **Child SDs of orchestrators** (each child requires fresh context loading)

Skipping CLAUDE_CORE_DIGEST.md causes: unknown SD type requirements, missed gate thresholds, skipped sub-agents.

### Digest vs Full File

| Situation | Load |
|-----------|------|
| Starting any SD work | CLAUDE_CORE_DIGEST.md (default) |
| Need detailed sub-agent config | CLAUDE_CORE.md (full) |
| Need detailed handoff procedures | CLAUDE_PLAN.md (full) |
| Complex debugging or unknown errors | Full phase file |
| Everything else | DIGEST files |

### Escalation Triggers (When to Load Full Files)
- Gate validation fails and root cause is unclear
- Sub-agent invocation requires detailed configuration
- Handoff template structure needed
- Database schema constraint lookup required
- Retrospective or pattern analysis needed

### Phase Keywords -> File
| Keywords | Digest (Default) | Full (Escalation) |
|----------|-------------------|-------------------|
| "approve", "LEAD", "directive" | CLAUDE_LEAD_DIGEST.md | CLAUDE_LEAD.md |
| "PRD", "PLAN", "validation" | CLAUDE_PLAN_DIGEST.md | CLAUDE_PLAN.md |
| "implement", "EXEC", "code" | CLAUDE_EXEC_DIGEST.md | CLAUDE_EXEC.md |

### Issue -> Reference Doc
| Issue | Load |
|-------|------|
| Database/schema/RLS errors | docs/reference/database-agent-patterns.md |
| Migration execution | docs/reference/database-agent-patterns.md |
| Validation failures | docs/reference/validation-enforcement.md |
| Test/E2E issues | docs/reference/qa-director-guide.md |
| Context >70% | docs/reference/context-monitoring.md |

### Context Budget (Digest-First)
- Router + Core Digest: ~12k (6% of 200k budget)
- + Phase Digest: ~17k (9%)
- + Full file (if escalated): ~55k (28%)
- Savings vs always-full: ~75% per session`;

async function main() {
  const { error } = await supabase
    .from('leo_protocol_sections')
    .update({ content: newContent })
    .eq('id', 257);

  if (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  console.log('Updated smart_router section successfully');
}

main();
