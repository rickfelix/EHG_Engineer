-- Migration: 20260206_learn_fix_009_protocol_sections.sql
-- SD: SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-009
-- Purpose: Insert 5 new protocol sections from /learn improvements
-- Idempotent: Uses NOT EXISTS guard to prevent duplicates on rerun

BEGIN;

-- 1. SD Type Detection Keywords Enhancement
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, priority, metadata)
SELECT
  'leo-v4-3-3-ui-parity',
  'sd_type_detection_keywords',
  'SD Type Detection - Extended Infrastructure Keywords',
  '## SD Type Detection - Extended Infrastructure Keywords

### Purpose
Ensure SDs involving hooks, state management, internal tooling, and CLI enhancement are classified as **infrastructure** type rather than defaulting to feature classification.

### Added Keywords (infrastructure category)
The following keywords trigger infrastructure classification in `sd-type-detection.js`:

| Category | Keywords |
|----------|----------|
| Hooks | `hook`, `hooks`, `pre-commit`, `post-commit`, `useEffect`, `useState` |
| State Management | `state management`, `redux`, `zustand`, `mobx`, `context api` |
| Internal Tooling | `internal tooling`, `tooling`, `developer tool`, `dev tool` |
| CLI | `cli`, `command-line`, `cli enhancement`, `terminal`, `shell script` |

### Detection Files
- `scripts/modules/handoff/verifiers/lead-to-plan/sd-type-detection.js` - TYPE_PATTERNS for LEAD-TO-PLAN verifier
- `lib/utils/sd-type-detection.js` - engineeringKeywords for general SD type detection

### Impact
SDs with these keywords now correctly receive infrastructure-level gate thresholds (70%) instead of feature-level defaults (85%), preventing unnecessary PRD requirements and handoff failures.',
  2390,
  'STANDARD',
  '{"source": "learn", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-009", "improvement_id": "bbe7e5fa"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM leo_protocol_sections
  WHERE protocol_id = 'leo-v4-3-3-ui-parity'
    AND section_type = 'sd_type_detection_keywords'
);

-- 2. Debate Circuit Breaker Documentation
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, priority, metadata)
SELECT
  'leo-v4-3-3-ui-parity',
  'debate_circuit_breaker',
  'Debate Circuit Breaker Protocol',
  '## Debate Circuit Breaker Protocol

### Purpose
Prevents infinite debate loops between AI agents by enforcing hard limits on debate iterations per run with a cooldown period before reattempt.

### Configuration
| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max debates per run | 3 | Diminishing returns after 3 rounds of point/counterpoint |
| Cooldown duration | 24 hours | Allows new context/evidence to accumulate |
| Persistence | `debate_circuit_breaker` table | Survives session restarts |

### Trigger Conditions
The circuit breaker activates when:
1. Same topic debated 3 times in a single run (identified by topic hash)
2. No new evidence introduced between debate rounds
3. Confidence scores converge (delta < 5% between rounds)

### Behavior When Tripped
1. **Stop debate immediately** - Do not start another round
2. **Summarize positions** - Capture both sides with confidence scores
3. **Escalate or proceed** - Based on severity:
   - Critical issues: Escalate to human review
   - Non-critical: Proceed with highest-confidence position
4. **Log to table** - Record run_id, topic_hash, debate_count, outcome, timestamp

### Database Schema
```sql
-- debate_circuit_breaker table fields
run_id TEXT NOT NULL,
topic_hash TEXT NOT NULL,
debate_count INTEGER DEFAULT 0,
last_debate_at TIMESTAMPTZ,
outcome TEXT, -- "escalated", "proceeded", "deferred"
cooldown_until TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW()
```

### Recovery
After cooldown expires:
- Counter resets to 0 for that topic
- New evidence may shift the debate outcome
- System logs "circuit breaker reset" for audit trail',
  2391,
  'STANDARD',
  '{"source": "learn", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-009", "improvement_id": "14f8e6f2"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM leo_protocol_sections
  WHERE protocol_id = 'leo-v4-3-3-ui-parity'
    AND section_type = 'debate_circuit_breaker'
);

-- 3. Feature Flag Governance Pattern
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, priority, metadata)
SELECT
  'leo-v4-3-3-ui-parity',
  'feature_flag_governance',
  'Feature Flag Governance Pattern',
  '## Feature Flag Governance Pattern

### Purpose
Defines lifecycle states, audit logging expectations, approval workflows, and retirement procedures for feature flags used in A/B tests and experiments.

### Lifecycle States

| State | Description | Transitions To | Required Audit Event |
|-------|-------------|---------------|---------------------|
| `proposed` | Flag requested, not yet approved | `approved`, `rejected` | `flag_proposed` |
| `approved` | Approved for implementation | `active` | `flag_approved` (approver_id required) |
| `active` | Live in production, receiving traffic | `deprecated` | `flag_activated` |
| `deprecated` | Marked for removal, still functional | `retired` | `flag_deprecated` (retirement_date required) |
| `retired` | Removed from codebase, archived | (terminal) | `flag_retired` |

### Audit Logging Requirements
Every state transition MUST log:
- `actor_id` - Who initiated the change
- `action` - State transition name
- `flag_key` - Unique flag identifier
- `previous_state` - State before transition
- `new_state` - State after transition
- `reason` - Why the transition occurred
- `created_at` - Timestamp of change

### Approval Workflow
1. **Proposal**: Developer creates flag with `proposed` state
2. **Review**: Tech lead reviews scope, rollback plan, success metrics
3. **Approval**: Approver transitions to `approved` with signed approval
4. **Activation**: Flag goes live with monitoring enabled
5. **Evaluation**: After experiment period, analyze results
6. **Deprecation**: Mark deprecated with target retirement date
7. **Retirement**: Remove from code, archive data, confirm no references

### Enforcement Checklist
- [ ] Flag has defined success/failure metrics before activation
- [ ] Rollback procedure documented and tested
- [ ] Maximum active duration defined (default: 30 days)
- [ ] Owner assigned for each active flag
- [ ] Stale flag detection runs weekly (flags active > max duration)',
  2392,
  'STANDARD',
  '{"source": "learn", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-009", "improvement_id": "7c4c66d3"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM leo_protocol_sections
  WHERE protocol_id = 'leo-v4-3-3-ui-parity'
    AND section_type = 'feature_flag_governance'
);

-- 4. Audit Logging Standards for Mutations
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, priority, metadata)
SELECT
  'leo-v4-3-3-ui-parity',
  'audit_logging_standards_mutations',
  'Audit Logging Standards for Database Mutations',
  '## Audit Logging Standards for Database Mutations

### Purpose
Establishes database triggers for audit logging as the standard mechanism for all mutation operations, ensuring compliance without requiring application-level code changes.

### Scope
The following mutation classes MUST have audit triggers:
1. **User management** - Create, update, delete, role changes
2. **Configuration changes** - System settings, feature flags, thresholds
3. **Critical operations** - SD status transitions, approval actions, deployment triggers
4. **Data modifications** - Any INSERT/UPDATE/DELETE on business-critical tables

### Minimum Audit Fields
Every audit log entry MUST capture:

| Field | Type | Description |
|-------|------|-------------|
| `actor_id` | UUID | User or system identity performing the action |
| `action` | TEXT | Operation type: INSERT, UPDATE, DELETE |
| `entity_type` | TEXT | Table name or logical entity |
| `entity_id` | TEXT | Primary key of affected row |
| `before` | JSONB | Row state before mutation (NULL for INSERT) |
| `after` | JSONB | Row state after mutation (NULL for DELETE) |
| `created_at` | TIMESTAMPTZ | When the mutation occurred |
| `request_id` | TEXT | Correlation ID for tracing across systems |

### Implementation Pattern
```sql
-- Standard audit trigger template
CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    actor_id, action, entity_type, entity_id,
    before, after, created_at, request_id
  ) VALUES (
    current_setting(''app.current_user_id'', true),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id::text, OLD.id::text),
    CASE WHEN TG_OP != ''INSERT'' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP != ''DELETE'' THEN to_jsonb(NEW) END,
    NOW(),
    current_setting(''app.request_id'', true)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

### Enforcement
- New tables with mutation operations MUST include audit trigger in their migration
- Code reviews MUST verify audit trigger presence for tables with user-facing mutations
- Quarterly audit: Run `SELECT table_name FROM information_schema.tables WHERE table_schema = ''public'' AND table_name NOT IN (SELECT DISTINCT entity_type FROM audit_log)` to find unaudited tables',
  2393,
  'STANDARD',
  '{"source": "learn", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-009", "improvement_id": "0fd8fcf9"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM leo_protocol_sections
  WHERE protocol_id = 'leo-v4-3-3-ui-parity'
    AND section_type = 'audit_logging_standards_mutations'
);

-- 5. JUDGE Sub-Agent Capabilities
INSERT INTO leo_protocol_sections (protocol_id, section_type, title, content, order_index, priority, metadata)
SELECT
  'leo-v4-3-3-ui-parity',
  'judge_sub_agent_capabilities',
  'JUDGE Sub-Agent Capabilities',
  '## JUDGE Sub-Agent Capabilities

### Purpose
The JUDGE sub-agent provides systematic resolution of AI conflicts through constitutional debate facilitation. It ensures decisions align with protocol principles and project governance.

### 6 Core Capabilities

| # | Capability | Description | When Used |
|---|-----------|-------------|-----------|
| 1 | **cross-verify** | Validates claims by cross-referencing multiple sources | Conflicting AI outputs, uncertain facts |
| 2 | **constitutional** | Checks decisions against protocol constitution | Governance violations, policy questions |
| 3 | **strategic-alignment** | Assesses alignment with project strategic objectives | Priority disputes, scope creep |
| 4 | **debate-facilitate** | Moderates structured debates between positions | Architectural decisions, trade-off analysis |
| 5 | **verdict-deliver** | Issues final binding verdict with rationale | After debate concludes or evidence gathered |
| 6 | **escalate-human** | Flags issues requiring human judgment | Ethical concerns, business decisions, high-risk |

### Trigger Keywords (13)
The JUDGE sub-agent is invoked when user input contains:
1. `judge` - Direct invocation
2. `verdict` - Request for decision
3. `constitutional` - Governance check
4. `debate` - Facilitate debate
5. `cross-verify` - Verify claims
6. `arbitrate` - Resolve conflict
7. `adjudicate` - Make judgment
8. `ruling` - Request ruling
9. `deliberate` - Careful consideration
10. `tribunal` - Formal review
11. `appeal` - Challenge decision
12. `overrule` - Override previous decision
13. `dissent` - Register disagreement

### Debate Protocol
1. **Opening**: Each position states its case (max 500 words)
2. **Cross-examination**: Each position challenges the other (max 300 words each)
3. **Rebuttal**: Final responses (max 200 words each)
4. **Verdict**: JUDGE synthesizes and delivers decision with:
   - Winning position with confidence score
   - Key reasoning points
   - Dissenting considerations
   - Conditions under which verdict should be revisited

### Escalation Criteria
JUDGE escalates to human when:
- Confidence below 60% after full debate
- Decision involves irreversible production changes
- Constitutional principles conflict with each other
- Business/financial implications exceed defined thresholds
- Ethical considerations are present

### Integration
- Invoked via Task tool with `subagent_type="vetting"` (JUDGE mode)
- Results stored in `ai_quality_assessments` table
- Circuit breaker applies (see: debate_circuit_breaker section)',
  2394,
  'STANDARD',
  '{"source": "learn", "sd_id": "SD-LEARN-FIX-ADDRESS-IMPROVEMENT-LEARN-009", "improvement_id": "b06ad634"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM leo_protocol_sections
  WHERE protocol_id = 'leo-v4-3-3-ui-parity'
    AND section_type = 'judge_sub_agent_capabilities'
);

COMMIT;
