# LEO Protocol v4.4: Proactive SD Proposal System

## Review Prompt for OpenAI / Antigravity

**Context**: We are evolving the LEO Protocol (a governance system for AI-assisted software development) based on insights from Kath Korevec's "Proactive Agents" talk. The LEO Protocol currently uses a LEAD→PLAN→EXEC workflow with database-first state management.

**Problem Being Solved**: The biggest friction point is SD (Strategic Directive) creation/initiation due to **scope uncertainty** - users struggle to define scope before exploring the codebase.

**Proposed Solution**: Shift from "user creates SDs" to "AI proposes SDs, user approves". Observer agents monitor signals and proactively surface work that needs to be done.

**Please Review**:
1. Does this architecture align with best practices for proactive agent systems?
2. Are there gaps, anti-patterns, or risks we haven't addressed?
3. How does this integrate with existing infrastructure (we already have `agent_execution_traces`, `chairman_alerts`, Edge Functions)?
4. What would you change or add?

---

## Vision Summary

**Pattern**: Agent proposes SDs → Human approves → Draft SD created → Normal LEAD validation

**Key Decisions** (user-confirmed through discovery process):
- Primary goal: **Reduce ceremony/friction**
- Pain point: **Scope uncertainty at SD creation**
- Triggers: Retrospectives, code health, dependencies (all sources)
- UI: Multi-channel (web inbox, inline queue, Claude Code terminal)
- Urgency: Tiered (critical=alert, medium=inbox, low=passive)
- Post-approval: Auto-create SD in draft, then normal LEAD validation
- Learning: Track dismissal reasons to improve proposals

---

## Architecture

### 1. Database Schema: `sd_proposals`

```sql
CREATE TABLE sd_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Proposal Content
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  proposed_scope JSONB NOT NULL,  -- { objectives, success_criteria, risks }
  evidence_data JSONB DEFAULT '{}'::jsonb,  -- supporting data from triggers

  -- Source & Trigger
  trigger_type VARCHAR(40) NOT NULL
    CHECK (trigger_type IN ('retrospective_pattern', 'code_health', 'dependency_update', 'manual')),
  trigger_source_id TEXT,  -- FK to retrospective, npm audit result, etc.
  trigger_event_type VARCHAR(60),

  -- Scoring
  confidence_score NUMERIC(3,2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  impact_score NUMERIC(3,2) NOT NULL CHECK (impact_score BETWEEN 0 AND 1),
  urgency_level VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (urgency_level IN ('low', 'medium', 'critical')),

  -- Deduplication
  dedupe_key TEXT NOT NULL,  -- prevents duplicate proposals

  -- Lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'seen', 'approved', 'dismissed', 'expired')),
  seen_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dismissal_reason VARCHAR(30)
    CHECK (dismissal_reason IN ('not_relevant', 'wrong_timing', 'duplicate', 'too_small', 'too_large', 'other')),

  -- Linkage
  created_sd_id TEXT,  -- FK to strategic_directives_v2 when approved

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  UNIQUE(dedupe_key)
);

-- Indexes for common queries
CREATE INDEX idx_sd_proposals_pending
  ON sd_proposals(status, urgency_level, created_at DESC)
  WHERE status = 'pending';
CREATE INDEX idx_sd_proposals_trigger
  ON sd_proposals(trigger_type, created_at DESC);
CREATE INDEX idx_sd_proposals_dedupe
  ON sd_proposals(dedupe_key);
```

**RLS Policies**:
- `service_role`: Full access (observers write proposals)
- `authenticated`: Read pending, update status fields only

---

### 2. Observer Agents (Supabase Edge Functions)

Three observer functions running on schedules/database triggers:

#### A. Retrospective Pattern Observer
```
Trigger: Daily schedule OR new retrospective INSERT
Logic:
  1. Query retrospectives table for recurring patterns
  2. Use embeddings (text-embedding-3-small) to find semantic similarity
  3. If same issue appears 3+ times across different SDs → propose SD
Output: INSERT into sd_proposals with trigger_type='retrospective_pattern'
```

#### B. Code Health Observer
```
Trigger: Weekly schedule OR CI pipeline completion webhook
Logic:
  1. Parse ESLint results, TypeScript strict errors, test coverage reports
  2. Detect degrading trends (coverage dropping, error count rising)
  3. Threshold: Coverage <60% OR >10 new lint errors → propose SD
Output: INSERT into sd_proposals with trigger_type='code_health'
```

#### C. Dependency Observer
```
Trigger: Daily schedule OR npm audit webhook
Logic:
  1. Run/parse `npm audit --json`
  2. Check for severity=high or critical vulnerabilities
  3. Check for major version updates on key dependencies (react, supabase, etc.)
Output: INSERT into sd_proposals with trigger_type='dependency_update', urgency='critical' for CVEs
```

---

### 3. Multi-Channel Surfacing

#### A. Web UI: Proposal Inbox (`/proposals`)
```
┌─────────────────────────────────────────────────────────┐
│ 📋 SD Proposals (3 pending)                             │
├─────────────────────────────────────────────────────────┤
│ 🔴 CRITICAL                                             │
│ Fix CVE-2025-1234 in lodash                            │
│ Trigger: dependency_update | Confidence: 95%            │
│ [Approve] [Dismiss ▼] [Details]                        │
├─────────────────────────────────────────────────────────┤
│ 🟡 MEDIUM                                               │
│ Address recurring auth timeout issue                    │
│ Found in: SD-UAT-002, SD-UAT-015, SD-UAT-028           │
│ Trigger: retrospective_pattern | Confidence: 82%        │
│ [Approve] [Dismiss ▼] [Details]                        │
├─────────────────────────────────────────────────────────┤
│ 🟢 LOW                                                  │
│ Increase test coverage for /lib/billing                │
│ Current: 45% → Target: 80%                             │
│ Trigger: code_health | Confidence: 70%                  │
│ [Approve] [Dismiss ▼] [Details]                        │
└─────────────────────────────────────────────────────────┘
```

#### B. Inline in SD Queue View
Existing `npm run sd:next` output enhanced with "Suggested" section:
```
=== SUGGESTED (Proactive Proposals) ===
┌ 🔴 Fix CVE-2025-1234 (dependency) - [approve/dismiss]
└ 🟡 Auth timeout pattern (retro) - [approve/dismiss]
```

#### C. Claude Code Terminal (Session Start)
When session initializes, query pending proposals:
```
📋 Proactive SD Proposals (3 pending):

🔴 [CRITICAL] "Fix CVE-2025-1234 in lodash"
   Source: npm audit (dependency)
   Confidence: 95% | Impact: High
   → Run `npm run proposal:approve <id>` to create SD

🟡 [MEDIUM] "Address recurring auth timeout issue"
   Source: Retrospectives (SD-UAT-002, SD-UAT-015, SD-UAT-028)
   Confidence: 82% | Impact: Medium

🟢 [LOW] "Increase test coverage for /lib/billing"
   Source: Code health (coverage: 45%)
   Confidence: 70% | Impact: Low
```

---

### 4. Approval Flow

```
                    ┌─────────────────┐
                    │  User Approves  │
                    │    Proposal     │
                    └────────┬────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │  fn_create_sd_from_proposal(id)        │
        │  1. Validate proposal exists & pending │
        │  2. INSERT into strategic_directives_v2│
        │     - status = 'draft'                 │
        │     - metadata.source = 'proactive'    │
        │     - metadata.proposal_id = id        │
        │  3. UPDATE sd_proposals                │
        │     - status = 'approved'              │
        │     - approved_at = NOW()              │
        │     - created_sd_id = new_sd.id        │
        │  4. RETURN new SD                      │
        └────────────────┬───────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Normal LEAD Phase   │
              │     Validation       │
              │  (existing workflow) │
              └──────────────────────┘
```

---

### 5. Learning System

#### Dismissal Tracking
```sql
-- When user dismisses, they select a reason:
UPDATE sd_proposals
SET status = 'dismissed',
    dismissed_at = NOW(),
    dismissal_reason = 'not_relevant'  -- or: wrong_timing, duplicate, too_small, too_large, other
WHERE id = <proposal_id>;
```

#### Analytics View
```sql
CREATE VIEW v_proposal_learning AS
SELECT
  trigger_type,
  COUNT(*) as total_proposals,
  COUNT(*) FILTER (WHERE status = 'approved') as approved,
  COUNT(*) FILTER (WHERE status = 'dismissed') as dismissed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'approved') / NULLIF(COUNT(*), 0), 1) as approval_rate,
  MODE() WITHIN GROUP (ORDER BY dismissal_reason) as most_common_dismissal
FROM sd_proposals
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY trigger_type;
```

#### Confidence Tuning (Future)
- If `approval_rate < 50%` for a trigger type → lower its confidence weight
- If `dismissal_reason = 'duplicate'` frequently → strengthen dedupe logic
- If `dismissal_reason = 'too_small'` → raise minimum scope threshold

---

## Implementation Phases

### Phase 1: Database & Core (Week 1)
1. Create `sd_proposals` table migration
2. Add RLS policies
3. Create `fn_create_sd_from_proposal()` function
4. Create `v_proposal_learning` view

### Phase 2: Observer Agents (Week 2)
5. Implement Retrospective Pattern Observer (Edge Function)
6. Implement Code Health Observer (Edge Function)
7. Implement Dependency Observer (Edge Function)
8. Configure pg_cron scheduled jobs

### Phase 3: Claude Code Integration (Week 3)
9. Update CLAUDE.md generation to include proposals query
10. Add proposal display formatting to session init
11. Create `npm run proposal:approve` and `proposal:dismiss` commands

### Phase 4: Web UI (Week 4)
12. Create `/proposals` page with ProposalCard components
13. Add inline proposals to SD queue view
14. Implement approve/dismiss API endpoints

### Phase 5: Learning & Tuning (Week 5)
15. Add dismissal reason analytics dashboard
16. Tune confidence scoring based on 30-day feedback
17. Document patterns and best practices

---

## Risk Mitigations

| Risk | Mitigation |
|------|------------|
| **Clippy problem** (annoying proposals) | Tiered urgency, passive indicators for low confidence, dedupe prevents repeats |
| **Low-quality proposals** | Confidence threshold (hide <50%), learning from dismissals |
| **Observer infinite loops** | Recursion limits, "actor" tags to ignore self-triggered events |
| **Proposal overload** | Max 5 pending per trigger type, auto-expiration after 14 days |
| **Stale proposals** | `expires_at` timestamp, observers re-evaluate before proposing same work |

---

## Integration with Existing Infrastructure

| Existing Component | Integration Point |
|--------------------|-------------------|
| `agent_execution_traces` | Observers log trace entries for audit |
| `chairman_alerts` | Critical proposals also create alert for visibility |
| `retrospectives` table | Source for retrospective pattern observer |
| `sub_agent_execution_results` | Code health data from QA sub-agent |
| Edge Functions (`supabase/functions/`) | Observers deployed alongside existing functions |
| `system_events` | Proposal lifecycle events logged |

---

## Success Criteria

1. **Friction Reduction**: SD creation time reduced 50%+ (baseline: current average time from intent → draft SD)
2. **Proposal Quality**: >60% approval rate within 30 days
3. **Signal Coverage**: All 3 trigger types generating proposals within Week 2
4. **Learning Effect**: Dismissal rate decreases over 30 days
5. **User Satisfaction**: "Proposals feel helpful, not annoying"

---

## Questions for Reviewers

1. **Schema Design**: Is `sd_proposals` the right structure, or should this be a type within an existing table like `proactive_insights`?

2. **Trigger Priority**: Should observers run in a specific order, or independently in parallel?

3. **Confidence Calculation**: What factors should influence confidence scoring beyond trigger type?

4. **Deduplication**: How should `dedupe_key` be generated to prevent near-duplicates while allowing legitimate re-proposals?

5. **Auto-expiration**: Is 14 days the right expiration window, or should it vary by urgency?

---

## Appendix: Source Material Alignment

| Korevec (Google) | Anti-Gravity | OpenAI | This Plan |
|------------------|--------------|--------|-----------|
| "Observer pattern" | "Continuous observers" | Use existing infra | Edge Function observers |
| "System Awareness" | "Central Context Store" | `agent_execution_traces` | Observers read existing tables |
| "Ghost text suggestions" | "Decision Cards" | Non-blocking insights | Multi-channel surfacing |
| "Speedometer" (live score) | "Traffic Light" gates | `interruption_level` | Tiered urgency (critical/medium/low) |
| "Approve vs Create" | "Proposal UI" | `suggested_actions` | Approve creates draft SD |
| Passive indicators | Proactive alerts | `dismissal_reason` enum | Dismissal tracking + learning |
