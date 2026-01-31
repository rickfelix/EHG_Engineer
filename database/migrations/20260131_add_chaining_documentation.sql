-- Migration: Add Orchestrator Chaining documentation to LEO Protocol
-- Part of: SD-LEO-INFRA-DEPRECATE-UAT-DEFECTS-001 (AUTO-PROCEED and Chaining Settings Enhancement)
-- Date: 2026-01-31
--
-- Purpose:
-- Adds comprehensive documentation for the Orchestrator Chaining feature
-- and updates AUTO-PROCEED section to mention /leo settings command.

-- First, find the max order_index for the ROUTER tier to insert after AUTO-PROCEED
DO $$
DECLARE
  v_max_order INTEGER;
BEGIN
  -- Get the current max order_index in ROUTER tier
  SELECT COALESCE(MAX(order_index), 14) INTO v_max_order
  FROM leo_protocol_sections
  WHERE protocol_id = 'leo-v4-3-3-ui-parity'
    AND context_tier = 'ROUTER';

  -- Insert Orchestrator Chaining section
  INSERT INTO leo_protocol_sections (
    protocol_id,
    section_type,
    title,
    content,
    order_index,
    metadata,
    context_tier,
    target_file,
    priority
  ) VALUES (
    'leo-v4-3-3-ui-parity',
    'workflow',
    'Orchestrator Chaining Mode',
    '## Orchestrator Chaining Mode

**Orchestrator Chaining** controls behavior when an orchestrator SD completes.

### Default: OFF (pause at orchestrator boundary)

**When Chaining is OFF (default):**
- After completing an orchestrator, PAUSE for review
- Run /learn to capture learnings from all children
- Show SD queue and wait for user selection
- Provides time for human review of major work

**When Chaining is ON (power user mode):**
- After completing an orchestrator, auto-continue to next
- Still runs /learn but continues without pausing
- Useful for batch processing multiple orchestrators
- For experienced users comfortable with continuous operation

### Configuration

| Level | How to Set | Scope |
|-------|------------|-------|
| Session | `/leo settings` or `/leo init` | This session only |
| Global | `/leo settings` → Global defaults | All future sessions |
| CLI | `--chain` / `--no-chain` | This invocation only |

### Settings Command

Use `/leo settings` (or `/leo s`) to view and modify:
- **Global defaults** - Apply to all new sessions
- **Session settings** - Override global for current session

### Precedence (Highest to Lowest)

1. **CLI flags**: `--chain` / `--no-chain`
2. **Session metadata**: `claude_sessions.metadata.chain_orchestrators`
3. **Global default**: `leo_settings.chain_orchestrators`
4. **Hard-coded fallback**: `false` (OFF)

### When to Enable Chaining

Consider enabling chaining when:
- Working through a queue of related orchestrators
- High confidence in workflow stability
- Minimal need for inter-orchestrator review
- Running overnight or during dedicated sessions

Keep chaining disabled when:
- New to the codebase or protocol
- Working on high-risk or complex orchestrators
- Need time to review /learn outputs
- Debugging or investigating issues

### Related Settings

- **AUTO-PROCEED**: Controls phase transitions within an SD
- **Chaining**: Controls transitions between orchestrator SDs

Both can be configured via `/leo settings`.',
    v_max_order + 1,
    '{"keywords": ["chaining", "orchestrator", "chain_orchestrators", "power user", "batch processing"], "compressed": false}'::jsonb,
    'ROUTER',
    'CLAUDE.md',
    'STANDARD'
  )
  ON CONFLICT (protocol_id, section_type, order_index)
  DO UPDATE SET
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    metadata = EXCLUDED.metadata;

END $$;

-- Update the AUTO-PROCEED section to mention /leo settings
UPDATE leo_protocol_sections
SET content = regexp_replace(
  content,
  'Run `/leo init` to set session preference',
  'Run `/leo init` or `/leo settings` to set session preference',
  'g'
)
WHERE protocol_id = 'leo-v4-3-3-ui-parity'
  AND title LIKE '%AUTO-PROCEED%';

-- Also ensure the global settings table documentation is added
COMMENT ON TABLE leo_settings IS 'Global LEO Protocol settings (singleton pattern). Stores default values for AUTO-PROCEED and Orchestrator Chaining that apply to all new sessions.';
