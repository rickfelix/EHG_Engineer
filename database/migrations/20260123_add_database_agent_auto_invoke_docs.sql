-- Migration: Add Database Sub-Agent Auto-Invocation Documentation
-- Purpose: Document SQL execution intent triggers for database sub-agent
-- Created: 2026-01-23
-- SD: SD-LEO-INFRA-PRD-CREATION-CONSOLIDATION-001

INSERT INTO leo_protocol_sections (
  protocol_id,
  section_type,
  title,
  content,
  order_index,
  metadata,
  priority,
  context_tier,
  target_file
) VALUES (
  'leo-v4-3-3-ui-parity',
  'sub_agent_config',
  'Database Sub-Agent Auto-Invocation',
  E'## Database Sub-Agent Semantic Triggering

When SQL execution intent is detected, the database sub-agent should be auto-invoked instead of outputting manual execution instructions.

### Intent Detection Triggers

The following phrases trigger automatic database sub-agent invocation:

| Category | Example Phrases | Priority |
|----------|-----------------|----------|
| **Direct Command** | "run this sql", "execute the query" | 9 |
| **Delegation** | "use database sub-agent", "have the database agent" | 8 |
| **Imperative** | "please run", "can you execute" | 8 |
| **Operational** | "update the table", "create the table" | 7 |
| **Result-Oriented** | "make this change in the database" | 6 |
| **Contextual** | "run it", "execute it" (requires SQL context) | 5 |

### Denylist Phrases (Block Execution Intent)

These phrases force NO_EXECUTION intent:
- "do not execute"
- "for reference only"
- "example query"
- "sample sql"
- "here is an example"

### Integration

When Claude generates SQL with execution instructions:
1. Check for SQL execution intent using `shouldAutoInvokeAndExecute()`
2. If intent detected with confidence >= 80%, use Task tool with database-agent
3. Never output "run this manually" when auto-invocation is permitted

```javascript
// Import
import { shouldAutoInvokeAndExecute } from ''lib/utils/db-agent-auto-invoker.js'';

// Check before outputting SQL
const result = await shouldAutoInvokeAndExecute(sqlMessage);
if (result.shouldInvoke) {
  // Use Task tool instead of manual instructions
  Task({ subagent_type: ''database-agent'', prompt: result.taskParams.prompt });
}
```

### Configuration

Runtime configuration in `db_agent_config` table:
- `MIN_CONFIDENCE_TO_INVOKE`: 0.80 (default)
- `DB_AGENT_ENABLED`: true (default)
- `DENYLIST_PHRASES`: Array of blocking phrases

### Audit Trail

All invocation decisions logged to `db_agent_invocations` table with:
- correlation_id for tracing
- intent and confidence scores
- matched trigger IDs
- decision outcome
',
  318,
  '{"added_date": "2026-01-23", "author": "LEO_PROTOCOL", "version": "v4.3.3", "purpose": "SQL execution intent auto-invocation"}'::jsonb,
  'SITUATIONAL',
  'CORE',
  'CLAUDE.md'
)
ON CONFLICT (protocol_id, section_type, order_index)
DO UPDATE SET
  content = EXCLUDED.content,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata;

-- Add comment
COMMENT ON COLUMN leo_protocol_sections.priority IS
  'Section priority: CORE (always loaded, never removed), STANDARD (normal rules), SITUATIONAL (context-dependent)';
