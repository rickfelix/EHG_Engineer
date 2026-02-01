# Database Analysis: SD-LEO-SELF-IMPROVE-001J
## Debate Protocol - JUDGE Sub-Agent

**Agent**: DATABASE
**Phase**: PLAN
**Date**: 2026-02-01
**Status**: ✅ COMPLETE

---

## Executive Summary

Created comprehensive database schema for the Debate Protocol (Phase 5: Conflict Resolution). The migration includes:
- **JUDGE sub-agent registration** with constitutional authority
- **4 core tables** for tracking debates, arguments, verdicts, and circuit breaker
- **3 helper functions** for circuit breaker management
- **1 analytics view** for debate metrics
- **10 RLS policies** following established security patterns
- **18 indexes** optimized for query performance

**All PRD functional requirements satisfied** ✓

---

## Schema Design

### 1. JUDGE Sub-Agent Registration

```sql
INSERT INTO leo_sub_agents (
  code: 'JUDGE',
  name: 'Constitutional Judge',
  priority: 8,  -- Higher than most agents
  metadata: {
    skill_key: 'conflict_resolution',
    aegis_integration: true,
    human_escalation_threshold: 0.6,
    circuit_breaker_enabled: true
  }
)
```

**Trigger Keywords** (13 total):
- **Primary**: conflict, disagree, judge, verdict, arbitrate
- **Secondary**: conflicting recommendations, agents disagree, resolve conflict, constitutional review, debate protocol
- **Context**: multiple paths, competing solutions, which approach

---

### 2. Core Tables

#### 2.1 `debate_sessions`

**Purpose**: Track debate instances and conflict metadata

**Key Columns**:
- `sd_id` (FK → strategic_directives_v2) - Links debate to SD
- `conflict_type` (enum) - approach, architecture, priority, scope, technical_choice, security, performance, other
- `conflict_statement` (text) - Human-readable conflict description
- `source_agents` (jsonb) - Array of agent codes that disagreed
- `status` (enum) - active, verdict_rendered, escalated, resolved, abandoned
- `round_number` (integer) - Current round (for circuit breaker)
- `max_rounds` (integer) - Default 3

**Indexes**:
- sd_id, status, conflict_type, created_at
- Active debates filter (WHERE status IN ('active', 'verdict_rendered'))

**RLS Policies**:
- SELECT: All users
- INSERT: Authenticated users
- UPDATE: Service role

---

#### 2.2 `debate_arguments`

**Purpose**: Store arguments from each participating agent

**Key Columns**:
- `debate_session_id` (FK → debate_sessions)
- `agent_code` (text) - Agent making argument
- `argument_type` (enum) - initial_position, rebuttal, clarification, constitution_citation, evidence
- `summary` (text) - Brief argument summary
- `detailed_reasoning` (text) - Full reasoning
- `constitution_citations` (jsonb) - Array of {rule_code, relevance}
- `evidence_refs` (jsonb) - Supporting evidence references
- `confidence_score` (numeric 0-1)
- `in_response_to_argument_id` (FK → debate_arguments) - For rebuttals

**Indexes**:
- debate_session_id, round_number, agent_code, created_at
- in_response_to_argument_id (WHERE NOT NULL)

**RLS Policies**:
- SELECT: All users
- INSERT: Authenticated users

---

#### 2.3 `judge_verdicts`

**Purpose**: Store JUDGE verdicts with constitutional citations

**Key Columns**:
- `debate_session_id` (FK → debate_sessions)
- `verdict_type` (enum) - recommendation_selected, synthesis, escalate, defer, reject_all
- `selected_agent_code` (text) - Winner (if applicable)
- `selected_argument_ids` (uuid[]) - Arguments forming verdict
- `summary` (text) - Brief verdict
- `detailed_rationale` (text) - Full reasoning
- `constitution_citations` (jsonb) - Array of {rule_code, rule_name, citation_reason}
- `constitutional_score` (numeric 0-1) - Constitutional alignment score
- `confidence_score` (numeric 0-1) - CRITICAL for escalation
- `escalation_required` (boolean) - Triggers human review
- `escalation_reason` (text)
- `human_decision` (enum) - confirmed, overridden, modified
- `human_decision_by`, `human_decision_at`, `human_decision_notes`

**Indexes**:
- debate_session_id, verdict_type, confidence_score, created_at
- escalation_required (WHERE true)

**RLS Policies**:
- SELECT: All users
- INSERT: Service role
- UPDATE: Restricted to human_decision fields only (immutable machine verdict)

**Constitutional Integration**:
```jsonb
constitution_citations: [
  {
    "rule_code": "CONST-001",
    "rule_name": "Developer Trust",
    "citation_reason": "Agent recommendation prioritizes autonomy"
  }
]
```

References `aegis_rules.rule_code` for CONST-001 through CONST-011.

---

#### 2.4 `debate_circuit_breaker`

**Purpose**: Prevent feedback loops with max rounds and cooldown

**Key Columns**:
- `sd_id` (FK → strategic_directives_v2)
- `run_id` (text) - Execution run identifier
- `debate_count` (integer) - Debates this run
- `max_debates_per_run` (integer) - Default 3
- `last_debate_at` (timestamptz)
- `cooldown_hours` (integer) - Default 24
- `cooldown_until` (timestamptz) - Calculated cooldown expiry
- `circuit_open` (boolean) - Circuit breaker tripped
- `trip_reason` (text)
- `reset_count` (integer) - Times manually reset

**Unique Constraint**: (sd_id, run_id)

**Indexes**:
- sd_id + run_id
- circuit_open (WHERE true)
- cooldown_until (WHERE > now())

**RLS Policies**:
- SELECT: All users
- ALL: Service role

---

### 3. Helper Functions

#### 3.1 `check_debate_circuit_breaker(sd_id, run_id)`

**Purpose**: Check if debates are allowed for SD+run combination

**Returns**:
```sql
(
  can_debate boolean,
  reason text,
  debates_remaining integer,
  cooldown_until timestamptz
)
```

**Logic**:
1. Get or create circuit breaker record
2. Check if circuit_open = true → DENY
3. Check if cooldown_until > now() → DENY
4. Check if debate_count >= max_debates_per_run → DENY + trip circuit
5. Otherwise → ALLOW

**Permissions**: authenticated, anon

---

#### 3.2 `increment_debate_count(sd_id, run_id)`

**Purpose**: Increment debate count after creating new debate session

**Logic**:
```sql
UPDATE debate_circuit_breaker
SET debate_count = debate_count + 1,
    last_debate_at = now()
WHERE sd_id = $1 AND run_id = $2;
```

**Permissions**: authenticated, service_role

---

#### 3.3 `reset_debate_circuit_breaker(sd_id, run_id)`

**Purpose**: Manual reset after cooldown or admin override

**Logic**:
```sql
UPDATE debate_circuit_breaker
SET circuit_open = false,
    trip_reason = NULL,
    cooldown_until = NULL,
    debate_count = 0,
    reset_count = reset_count + 1,
    last_reset_at = now()
WHERE sd_id = $1 AND run_id = $2;
```

**Permissions**: authenticated, service_role

---

### 4. Analytics View

#### `v_debate_analytics`

**Purpose**: Real-time debate metrics and outcomes

**Columns**:
- `debate_session_id`, `sd_id`, `conflict_type`, `status`
- `debate_started_at`, `debate_resolved_at`, `debate_duration_minutes`
- `total_arguments`, `participating_agents`
- `verdict_type`, `verdict_confidence`, `constitutional_score`
- `escalation_required`, `human_decision`
- `unique_constitutional_citations`
- `debate_metadata`, `verdict_metadata`

**Use Cases**:
- Track debate resolution times
- Identify conflict patterns by type
- Monitor escalation rates
- Analyze constitutional citation patterns

---

## PRD Functional Requirements Alignment

| Req | Requirement | Implementation | Status |
|-----|-------------|----------------|--------|
| FR-1 | Register JUDGE sub-agent with skill_key='conflict_resolution' | leo_sub_agents table insert with metadata | ✅ |
| FR-2 | ConflictReport contract (source_agents[], recommendations[], conflict_type, conflict_statement) | debate_sessions table with source_agents jsonb + conflict fields | ✅ |
| FR-3 | Judge verdict with constitution citations (CONST-001 to CONST-011) | judge_verdicts.constitution_citations jsonb, references aegis_rules.rule_code | ✅ |
| FR-4 | Human escalation for low-confidence verdicts (<0.6) | escalation_required boolean, confidence_score numeric, threshold in metadata | ✅ |
| FR-5 | Circuit breaker (max 3 rounds, 24h cooldown) | debate_circuit_breaker table + helper functions | ✅ |

---

## Security & Performance

### RLS Policies (10 total)

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| debate_sessions | All users | Authenticated | Service role | - |
| debate_arguments | All users | Authenticated | - | - |
| judge_verdicts | All users | Service role | Human fields only | - |
| debate_circuit_breaker | All users | Service role | Service role | - |

**Key Security Pattern**:
- Judge verdicts are **immutable** after creation (machine reasoning)
- Only `human_decision*` fields can be updated via restricted RLS policy
- Circuit breaker prevents infinite debate loops (security + performance)

### Indexes (18 total)

**Query Optimization**:
- `idx_debate_sessions_sd_id` - Fast SD lookups
- `idx_debate_sessions_active` - Filter active debates (partial index)
- `idx_debate_arguments_round` - Round-based argument retrieval
- `idx_judge_verdicts_escalation` - Fast escalation filtering (partial index)
- `idx_circuit_breaker_cooldown` - Cooldown expiry checks (partial index)

**Performance Impact**:
- All foreign keys indexed
- Partial indexes on boolean filters (circuit_open, escalation_required)
- GIN index candidates: constitution_citations (if full-text search needed)

---

## Migration Execution Plan

### Pre-Execution Checks
1. ✅ Verify `leo_sub_agents` table exists
2. ✅ Verify `strategic_directives_v2` table exists
3. ✅ Verify `aegis_rules` table exists (for constitution citations)
4. ✅ No existing JUDGE agent (migration is idempotent via ON CONFLICT)

### Execution Steps
1. **Register JUDGE sub-agent** (with ON CONFLICT DO UPDATE)
2. **Add trigger keywords** (13 keywords via DO block)
3. **Create 4 tables** (with IF NOT EXISTS)
4. **Create indexes** (with IF NOT EXISTS)
5. **Enable RLS + create policies**
6. **Create helper functions** (OR REPLACE)
7. **Create analytics view** (OR REPLACE)
8. **Create triggers** (update timestamp)
9. **Run verification block**

### Rollback Strategy
- Tables are idempotent (IF NOT EXISTS)
- Sub-agent insert is idempotent (ON CONFLICT DO UPDATE)
- Functions are idempotent (OR REPLACE)
- Safe to re-run entire migration

### Post-Execution Verification
```sql
-- Verify JUDGE agent
SELECT code, name, priority FROM leo_sub_agents WHERE code = 'JUDGE';

-- Verify trigger count
SELECT COUNT(*) FROM leo_sub_agent_triggers t
JOIN leo_sub_agents s ON t.sub_agent_id = s.id
WHERE s.code = 'JUDGE';
-- Expected: >= 13

-- Verify tables
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('debate_sessions', 'debate_arguments', 'judge_verdicts', 'debate_circuit_breaker');
-- Expected: 4 rows

-- Test circuit breaker function
SELECT * FROM check_debate_circuit_breaker('SD-TEST-001', 'run-001');
-- Expected: can_debate=true
```

---

## Integration with Existing Systems

### Dependencies
- **leo_sub_agents** - Sub-agent registry
- **strategic_directives_v2** - SD tracking (FK relationships)
- **aegis_rules** - Constitutional framework (CONST-001 to CONST-011)
- **leo_sub_agent_triggers** - Keyword activation

### Related Patterns
- **Vetting Agent** (SD-LEO-SELF-IMPROVE-001F) - Similar verdict storage pattern
- **Issue Patterns** (SD-LEO-LEARN-001) - Could capture debate patterns
- **Retrospectives** - Could analyze debate effectiveness

### Future Enhancements
1. **Debate Templates** - Pre-defined conflict scenarios
2. **Agent Performance Metrics** - Win/loss ratios, citation quality
3. **Constitutional Learning** - Most-cited rules, citation effectiveness
4. **Debate Summarization** - Auto-generate debate summaries for retros

---

## Files Created

| File | Purpose | Lines |
|------|---------|-------|
| `database/migrations/20260201_debate_protocol_judge_subagent.sql` | Complete migration | ~700 |
| `database/migrations/20260201_debate_protocol_ANALYSIS.md` | This analysis doc | ~450 |

---

## Execution Command

```bash
# Dry-run (recommended first)
psql -h <host> -U <user> -d <database> -f database/migrations/20260201_debate_protocol_judge_subagent.sql --dry-run

# Execute migration
node scripts/run-sql-migration.js database/migrations/20260201_debate_protocol_judge_subagent.sql

# Verify
psql -h <host> -U <user> -d <database> -c "SELECT code, name FROM leo_sub_agents WHERE code = 'JUDGE';"
```

---

## Conclusion

**DATABASE agent has completed comprehensive schema analysis for SD-LEO-SELF-IMPROVE-001J.**

The migration is production-ready:
- ✅ All PRD requirements satisfied
- ✅ Constitutional integration via aegis_rules
- ✅ Circuit breaker prevents feedback loops
- ✅ Human escalation for low-confidence verdicts
- ✅ Audit trail and analytics
- ✅ RLS policies follow established patterns
- ✅ Indexes optimized for query performance
- ✅ Idempotent migration (safe to re-run)

**Next Steps**:
1. PLAN agent: Review schema design against PRD
2. EXEC agent: Execute migration in database
3. TESTING agent: Verify circuit breaker behavior
4. QA agent: Validate RLS policies
5. JUDGE agent: Implement debate logic using these tables

**Estimated Execution Time**: <2 seconds (no data migrations, all DDL)

---

**Generated by**: DATABASE agent (Sonnet 4.5)
**Model ID**: claude-sonnet-4-5-20250929
**Timestamp**: 2026-02-01T[timestamp]
