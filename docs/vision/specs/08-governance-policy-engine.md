# Governance Policy Engine Specification

**Vision v2 Chairman's OS - Enforceable Authority & Escalation Control**

> "Trust, but verify - and enforce automatically."

---

## Table of Contents

1. [Overview](#overview)
2. [Authority Matrix](#authority-matrix)
3. [Policy Engine](#policy-engine)
4. [Escalation Load-Shedding](#escalation-load-shedding)
5. [Conflict Resolution](#conflict-resolution)
6. [Cross-Venture Coordination](#cross-venture-coordination)
7. [Database Schema](#database-schema)

---

## Overview

### The Problem

The existing architecture defines `delegation_authority` JSON and escalation patterns, but lacks:

1. **Enforceable policies** - Rules exist as conventions, not enforced by the system
2. **Escalation storm control** - No limits on escalations per venture/day
3. **Conflict resolution** - No defined arbitration when agents disagree
4. **Portfolio-level governance** - No policy objects that span ventures

### The Solution

The Governance Policy Engine provides:

- **Machine-enforced authority boundaries** evaluated before every agent action
- **Escalation budgets** with automatic batching and deduplication
- **Arbitration protocols** for VP↔VP and CEO↔EVA conflicts
- **Portfolio programs** for cross-venture coordination

### Single-User Production Assumption (Rick-only)

In a production-safe single-human deployment:
- **All human-facing escalations resolve to `chairman` (Rick)** as the final authority.
- The system must still enforce policies at runtime (deny/require approval), because the risk is not “other users” — it’s **automation doing the wrong thing**.
- All escalations and overrides must be logged (for post-mortems and replay safety).

---

## Authority Matrix

### 2.1 Authority Boundaries

Every agent action is evaluated against an Authority Matrix before execution.

```typescript
interface AuthorityCheck {
  agent_id: string;
  action_type: AuthorityActionType;
  resource_type: string;
  resource_id?: string;
  amount?: number;  // For spend/budget actions
  confidence?: number;  // For decisions
}

type AuthorityActionType =
  | 'approve_spend'
  | 'advance_stage'
  | 'kill_venture'
  | 'pivot_strategy'
  | 'hire_agent'
  | 'modify_budget'
  | 'access_tool'
  | 'publish_artifact'
  | 'modify_policy';

interface AuthorityResult {
  allowed: boolean;
  reason?: string;
  requires_escalation: boolean;
  escalation_target?: string;
  escalation_urgency?: 'immediate' | 'next_briefing' | 'weekly';
}
```

### 2.2 Authority Thresholds by Level

```typescript
const AUTHORITY_THRESHOLDS = {
  // L4: Crews - Task execution only
  crew: {
    approve_spend: 0,
    advance_stage: false,
    kill_venture: false,
    pivot_strategy: false,
    hire_agent: false,
    modify_budget: false,
    access_tool: 'granted_only',
    publish_artifact: 'draft_only',
    modify_policy: false,
  },

  // L3: VPs - Tactical decisions
  executive: {
    approve_spend: 50,  // USD per action
    advance_stage: 'within_domain',  // Only stages they own
    kill_venture: false,
    pivot_strategy: false,
    hire_agent: 'crews_only',
    modify_budget: false,
    access_tool: 'domain_tools',
    publish_artifact: 'venture_scope',
    modify_policy: false,
  },

  // L2: CEOs - Venture-level autonomy
  venture_ceo: {
    approve_spend: 500,  // USD per action
    advance_stage: true,
    kill_venture: false,  // Always escalate
    pivot_strategy: 'minor_only',  // Major pivots escalate
    hire_agent: 'vps_and_crews',
    modify_budget: 'within_allocation',
    access_tool: 'venture_tools',
    publish_artifact: 'venture_scope',
    modify_policy: false,
  },

  // L1.5: EVA - Portfolio orchestration
  eva: {
    approve_spend: 1000,
    advance_stage: true,
    kill_venture: 'recommend_only',
    pivot_strategy: 'recommend_only',
    hire_agent: 'ceos_and_below',
    modify_budget: 'within_portfolio',
    access_tool: 'all',
    publish_artifact: 'ecosystem_scope',
    modify_policy: 'recommend_only',
  },

  // L1: Chairman - Ultimate authority
  chairman: {
    approve_spend: Infinity,
    advance_stage: true,
    kill_venture: true,
    pivot_strategy: true,
    hire_agent: true,
    modify_budget: true,
    access_tool: 'all',
    publish_artifact: 'ecosystem_scope',
    modify_policy: true,
  },
};
```

### 2.3 Never-Autonomous Categories

Certain actions ALWAYS require Chairman approval regardless of thresholds:

```typescript
const NEVER_AUTONOMOUS = [
  'security_incident',       // Security breach or vulnerability
  'legal_commitment',        // Contracts, ToS, partnerships
  'brand_risk',              // Public statements, press
  'major_pivot',             // Fundamental strategy change
  'budget_increase',         // Request more than allocated
  'venture_termination',     // Kill decision
  'data_breach',             // PII or sensitive data exposure
  'external_publication',    // Public-facing content
];
```

---

## Policy Engine

### 3.1 Policy Objects

Policies are first-class database objects that can be applied at ecosystem, portfolio, or venture level.

```typescript
interface GovernancePolicy {
  id: string;
  policy_name: string;
  policy_type: PolicyType;
  scope: PolicyScope;
  scope_id?: string;  // portfolio_id or venture_id

  // Rules
  rules: PolicyRule[];

  // Metadata
  is_active: boolean;
  priority: number;  // Higher = evaluated first
  created_by: string;
  effective_from: string;
  effective_until?: string;
}

type PolicyType =
  | 'authority_override'     // Modify thresholds
  | 'escalation_rule'        // Custom escalation triggers
  | 'budget_constraint'      // Spending limits
  | 'stage_gate'             // Additional gate requirements
  | 'tool_restriction'       // Limit tool access
  | 'audit_requirement';     // Mandatory logging

type PolicyScope = 'ecosystem' | 'portfolio' | 'venture' | 'agent';

interface PolicyRule {
  condition: PolicyCondition;
  action: PolicyAction;
}

interface PolicyCondition {
  field: string;           // e.g., 'action_type', 'amount', 'stage'
  operator: 'eq' | 'gt' | 'lt' | 'in' | 'contains';
  value: any;
}

interface PolicyAction {
  type: 'allow' | 'deny' | 'escalate' | 'require_approval' | 'audit';
  target?: string;         // Escalation target
  message?: string;        // User-facing message
}
```

### 3.2 Policy Evaluation

```typescript
async function evaluateAuthority(
  check: AuthorityCheck
): Promise<AuthorityResult> {
  // 1. Get agent's hierarchy level and base thresholds
  const agent = await getAgent(check.agent_id);
  const baseThresholds = AUTHORITY_THRESHOLDS[agent.agent_type];

  // 2. Check never-autonomous first
  if (NEVER_AUTONOMOUS.includes(check.action_type)) {
    return {
      allowed: false,
      reason: `${check.action_type} requires Chairman approval`,
      requires_escalation: true,
      escalation_target: 'chairman',
      escalation_urgency: 'immediate',
    };
  }

  // 3. Load applicable policies (cascade: ecosystem → portfolio → venture → agent)
  const policies = await getApplicablePolicies(agent, check);

  // 4. Evaluate policies in priority order
  for (const policy of policies) {
    const result = evaluatePolicy(policy, check, agent);
    if (result.decision !== 'continue') {
      return result;
    }
  }

  // 5. Fall back to base thresholds
  return evaluateBaseThreshold(baseThresholds, check);
}
```

### 3.3 Example Policies

```sql
-- Portfolio policy: Limit venture spending
INSERT INTO governance_policies (policy_name, policy_type, scope, scope_id, rules) VALUES (
  'Conservative Portfolio Spending',
  'budget_constraint',
  'portfolio',
  'portfolio-uuid',
  '[
    {
      "condition": {"field": "action_type", "operator": "eq", "value": "approve_spend"},
      "action": {"type": "escalate", "target": "eva", "message": "Spending over $200 requires EVA review"}
    }
  ]'::jsonb
);

-- Venture policy: High-risk venture requires extra gates
INSERT INTO governance_policies (policy_name, policy_type, scope, scope_id, rules) VALUES (
  'High-Risk Venture Extra Gates',
  'stage_gate',
  'venture',
  'venture-uuid',
  '[
    {
      "condition": {"field": "stage", "operator": "in", "value": [10, 13, 20]},
      "action": {"type": "require_approval", "target": "chairman", "message": "High-risk venture requires Chairman review at brand/tech/security stages"}
    }
  ]'::jsonb
);
```

---

## Escalation Load-Shedding

### 4.1 The Problem

Without controls, 100 ventures could generate 500+ escalations/day, overwhelming the Chairman.

### 4.2 Escalation Budget System

```typescript
interface EscalationBudget {
  scope: 'venture' | 'portfolio' | 'ecosystem';
  scope_id?: string;

  // Daily limits
  max_immediate_per_day: number;        // Push notifications
  max_next_briefing_per_day: number;    // Decision cards
  max_weekly_per_week: number;          // Batched summary

  // Current usage (reset daily/weekly)
  immediate_used_today: number;
  next_briefing_used_today: number;
  weekly_used_this_week: number;
}

const DEFAULT_ESCALATION_BUDGETS = {
  venture: {
    max_immediate_per_day: 2,
    max_next_briefing_per_day: 5,
    max_weekly_per_week: 20,
  },
  portfolio: {
    max_immediate_per_day: 10,
    max_next_briefing_per_day: 25,
    max_weekly_per_week: 100,
  },
  ecosystem: {
    max_immediate_per_day: 20,
    max_next_briefing_per_day: 50,
    max_weekly_per_week: 200,
  },
};
```

### 4.3 Escalation Routing Rules

```typescript
interface EscalationRouting {
  // Severity determines delivery channel
  severity: 'critical' | 'high' | 'medium' | 'low';

  // Mapping
  routing: {
    critical: 'immediate';          // Push + decision card
    high: 'next_briefing';          // Decision card
    medium: 'daily_summary';        // Briefing mention
    low: 'weekly_digest';           // Weekly rollup
  };
}

async function routeEscalation(
  escalation: EscalationRequest
): Promise<EscalationResult> {
  // 1. Determine severity
  const severity = calculateSeverity(escalation);

  // 2. Check budget
  const budget = await getEscalationBudget(escalation.venture_id);
  const channel = getChannelForSeverity(severity);

  if (isOverBudget(budget, channel)) {
    // 3. Downgrade or batch
    return downgradeEscalation(escalation, budget);
  }

  // 4. Check for duplicates (same issue within 24h)
  const duplicate = await findDuplicateEscalation(escalation);
  if (duplicate) {
    return mergEscalations(duplicate, escalation);
  }

  // 5. Route
  return createEscalation(escalation, channel);
}
```

### 4.4 Severity Calculation

```typescript
function calculateSeverity(escalation: EscalationRequest): Severity {
  let score = 0;

  // Factor 1: Financial impact
  if (escalation.financial_impact_usd > 1000) score += 3;
  else if (escalation.financial_impact_usd > 100) score += 2;
  else if (escalation.financial_impact_usd > 0) score += 1;

  // Factor 2: Time sensitivity
  if (escalation.deadline_hours < 4) score += 3;
  else if (escalation.deadline_hours < 24) score += 2;
  else if (escalation.deadline_hours < 72) score += 1;

  // Factor 3: Stage criticality
  if ([3, 5, 16, 23].includes(escalation.stage)) score += 2;

  // Factor 4: Category
  if (NEVER_AUTONOMOUS.includes(escalation.category)) score += 5;

  // Map score to severity
  if (score >= 8) return 'critical';
  if (score >= 5) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}
```

### 4.5 Batching and Deduplication

```typescript
interface EscalationBatch {
  batch_id: string;
  delivery_channel: 'daily_summary' | 'weekly_digest';
  scheduled_for: string;

  items: BatchedEscalation[];
  summary: string;  // AI-generated summary
}

async function batchEscalations(): Promise<void> {
  // Run every hour for daily, daily for weekly

  // 1. Find unbatched medium/low escalations
  const unbatched = await getUnbatchedEscalations();

  // 2. Group by venture, then by category
  const grouped = groupEscalations(unbatched);

  // 3. Deduplicate similar issues
  const deduped = deduplicateGroups(grouped);

  // 4. Generate summary for each group
  for (const group of deduped) {
    const summary = await generateBatchSummary(group);
    await createBatch(group, summary);
  }
}
```

---

## Conflict Resolution

### 5.1 Conflict Types

```typescript
type ConflictType =
  | 'vp_vs_vp'           // Two VPs disagree on cross-domain issue
  | 'ceo_vs_vp'          // CEO overrides VP recommendation
  | 'ceo_vs_eva'         // CEO disagrees with EVA guidance
  | 'resource_conflict'  // Multiple ventures need same resource
  | 'priority_conflict'; // Conflicting directives
```

### 5.2 Resolution Protocol

```typescript
interface ConflictResolution {
  conflict_type: ConflictType;

  // Resolution hierarchy
  first_arbiter: 'ceo' | 'eva' | 'chairman';
  escalation_path: string[];

  // Resolution methods
  methods: ResolutionMethod[];

  // Timeout before auto-escalation
  resolution_timeout_hours: number;
}

type ResolutionMethod =
  | 'vote'               // Agents vote (weighted by level)
  | 'evidence_based'     // Highest-confidence evidence wins
  | 'arbiter_decides'    // Arbiter makes final call
  | 'chairman_override'; // Always go to Chairman

const CONFLICT_PROTOCOLS: Record<ConflictType, ConflictResolution> = {
  vp_vs_vp: {
    conflict_type: 'vp_vs_vp',
    first_arbiter: 'ceo',
    escalation_path: ['ceo', 'eva', 'chairman'],
    methods: ['evidence_based', 'arbiter_decides'],
    resolution_timeout_hours: 24,
  },

  ceo_vs_vp: {
    conflict_type: 'ceo_vs_vp',
    first_arbiter: 'ceo',  // CEO wins unless escalated
    escalation_path: ['eva', 'chairman'],
    methods: ['arbiter_decides'],
    resolution_timeout_hours: 12,
  },

  ceo_vs_eva: {
    conflict_type: 'ceo_vs_eva',
    first_arbiter: 'chairman',  // Always escalate
    escalation_path: ['chairman'],
    methods: ['chairman_override'],
    resolution_timeout_hours: 4,
  },

  resource_conflict: {
    conflict_type: 'resource_conflict',
    first_arbiter: 'eva',
    escalation_path: ['chairman'],
    methods: ['evidence_based', 'arbiter_decides'],
    resolution_timeout_hours: 48,
  },

  priority_conflict: {
    conflict_type: 'priority_conflict',
    first_arbiter: 'chairman',  // Always escalate
    escalation_path: ['chairman'],
    methods: ['chairman_override'],
    resolution_timeout_hours: 4,
  },
};
```

### 5.3 Conflict Logging

All conflicts are logged for audit and learning:

```typescript
interface ConflictLog {
  conflict_id: string;
  conflict_type: ConflictType;

  parties: {
    agent_id: string;
    position: string;
    evidence_ids: string[];
    confidence: number;
  }[];

  resolution: {
    method_used: ResolutionMethod;
    arbiter_id: string;
    decision: string;
    rationale: string;
    resolved_at: string;
  };

  // Learning
  outcome_correct?: boolean;  // Retrospective assessment
  lessons_learned?: string;
}
```

---

## Cross-Venture Coordination

### 6.1 Portfolio Programs

For initiatives that span multiple ventures (shared tech, vendor contracts, components):

```typescript
interface PortfolioProgram {
  program_id: string;
  program_name: string;
  portfolio_id: string;

  // Scope
  participating_ventures: string[];
  program_type: 'shared_tech' | 'shared_vendor' | 'shared_component' | 'strategic_initiative';

  // Governance
  program_lead_ceo_id: string;  // One CEO leads
  decision_model: 'consensus' | 'lead_decides' | 'eva_arbitrates';

  // Resources
  shared_budget_usd: number;
  shared_token_budget: number;

  // Permissions
  cross_venture_read_access: boolean;
  cross_venture_write_access: boolean;
}
```

### 6.2 Cross-CEO Communication

```typescript
interface CrossCEOMessage {
  message_type: 'coordination' | 'resource_request' | 'knowledge_share';

  from_ceo_id: string;
  to_ceo_ids: string[];
  program_id?: string;

  // Content
  subject: string;
  body: string;
  attachments: string[];  // Artifact IDs

  // Response tracking
  requires_response: boolean;
  response_deadline?: string;
  responses: CrossCEOResponse[];
}
```

---

## Database Schema

### 7.1 governance_policies

```sql
CREATE TABLE IF NOT EXISTS governance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name VARCHAR(200) NOT NULL,
  policy_type VARCHAR(50) NOT NULL
    CHECK (policy_type IN (
      'authority_override', 'escalation_rule', 'budget_constraint',
      'stage_gate', 'tool_restriction', 'audit_requirement'
    )),

  -- Scope
  scope VARCHAR(50) NOT NULL
    CHECK (scope IN ('ecosystem', 'portfolio', 'venture', 'agent')),
  scope_id UUID,  -- portfolio_id, venture_id, or agent_id

  -- Rules (JSONB array of PolicyRule)
  rules JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Metadata
  is_active BOOLEAN DEFAULT TRUE,
  priority INT DEFAULT 50,
  effective_from TIMESTAMPTZ DEFAULT NOW(),
  effective_until TIMESTAMPTZ,

  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_policies_scope ON governance_policies(scope, scope_id);
CREATE INDEX idx_policies_active ON governance_policies(is_active, priority DESC);
```

### 7.2 escalation_budgets

```sql
CREATE TABLE IF NOT EXISTS escalation_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope VARCHAR(50) NOT NULL
    CHECK (scope IN ('venture', 'portfolio', 'ecosystem')),
  scope_id UUID,

  -- Limits
  max_immediate_per_day INT DEFAULT 2,
  max_next_briefing_per_day INT DEFAULT 5,
  max_weekly_per_week INT DEFAULT 20,

  -- Usage tracking
  immediate_used_today INT DEFAULT 0,
  next_briefing_used_today INT DEFAULT 0,
  weekly_used_this_week INT DEFAULT 0,

  -- Reset timestamps
  daily_reset_at TIMESTAMPTZ DEFAULT DATE_TRUNC('day', NOW()),
  weekly_reset_at TIMESTAMPTZ DEFAULT DATE_TRUNC('week', NOW()),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(scope, scope_id)
);

-- Function to reset daily counts
CREATE OR REPLACE FUNCTION fn_reset_escalation_budgets_daily()
RETURNS void AS $$
BEGIN
  UPDATE escalation_budgets
  SET
    immediate_used_today = 0,
    next_briefing_used_today = 0,
    daily_reset_at = NOW()
  WHERE daily_reset_at < DATE_TRUNC('day', NOW());
END;
$$ LANGUAGE plpgsql;
```

### 7.3 conflict_logs

```sql
CREATE TABLE IF NOT EXISTS conflict_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_type VARCHAR(50) NOT NULL,

  -- Context
  venture_id UUID REFERENCES ventures(id),
  portfolio_id UUID REFERENCES portfolios(id),
  stage_number INT,

  -- Parties (JSONB array)
  parties JSONB NOT NULL,

  -- Resolution
  resolution_method VARCHAR(50),
  arbiter_id UUID,
  decision TEXT,
  rationale TEXT,
  resolved_at TIMESTAMPTZ,

  -- Learning
  outcome_correct BOOLEAN,
  lessons_learned TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conflict_logs_venture ON conflict_logs(venture_id);
CREATE INDEX idx_conflict_logs_unresolved ON conflict_logs(venture_id)
  WHERE resolved_at IS NULL;
```

### 7.4 portfolio_programs

```sql
CREATE TABLE IF NOT EXISTS portfolio_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_name VARCHAR(200) NOT NULL,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id),

  program_type VARCHAR(50) NOT NULL
    CHECK (program_type IN (
      'shared_tech', 'shared_vendor', 'shared_component', 'strategic_initiative'
    )),

  -- Governance
  program_lead_ceo_id UUID REFERENCES agent_registry(id),
  decision_model VARCHAR(50) DEFAULT 'lead_decides'
    CHECK (decision_model IN ('consensus', 'lead_decides', 'eva_arbitrates')),

  -- Resources
  shared_budget_usd NUMERIC(12, 2) DEFAULT 0,
  shared_token_budget INT DEFAULT 0,

  -- Permissions
  cross_venture_read_access BOOLEAN DEFAULT FALSE,
  cross_venture_write_access BOOLEAN DEFAULT FALSE,

  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_program_members (
  program_id UUID NOT NULL REFERENCES portfolio_programs(id) ON DELETE CASCADE,
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (program_id, venture_id)
);
```

---

## Critical Questions for the Chairman

Before implementing this spec, decisions are needed on:

1. **What decisions must ALWAYS require you?** Beyond stages 3/5/16/25, are there "never autonomous" categories (security, legal, brand)?

2. **What's your acceptable false-positive escalation rate?** More escalations = more visibility but more noise. Fewer = more autonomy but risk missing issues.

3. **One EVA or multiple?** Do you want one EVA for all portfolios, or one EVA per portfolio with different policies?

4. **Cross-venture learning?** Should ventures be able to share learnings automatically, or must all sharing be curated through EVA/Chairman approval?

---

## Related Specifications

- [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md) - Agent hierarchy and delegation
- [04-eva-orchestration.md](./04-eva-orchestration.md) - EVA routing and decision handling
- [07-operational-handoff.md](./07-operational-handoff.md) - CEO mode transitions
- [01-database-schema.md](./01-database-schema.md) - Foundation tables
