# Operational Handoff Specification

**Vision v2 Chairman's OS - Stage 25 Mode Transition**

> "The venture doesn't end at Stage 25. It transforms."

---

## Table of Contents

1. [Overview](#overview)
2. [The Dual-Phase Lifecycle](#the-dual-phase-lifecycle)
3. [CEO Operational Modes](#ceo-operational-modes)
4. [Mode Transition Protocol](#mode-transition-protocol)
5. [Operational Handoff Packet Schema](#operational-handoff-packet-schema)
6. [Venture Constitution](#venture-constitution)
7. [Post-Launch Organizational Structure](#post-launch-organizational-structure)
8. [Database Schema](#database-schema)

---

## Overview

This specification defines how ventures transition from the **Incubation Phase** (Stages 1-25) to the **Operational Phase** (post-launch). The key insight is that the CEO agent exists from Stage 1 but operates in a constrained mode until Stage 25 completion triggers a governance expansion.

### Key Correction from OpenAI Codex Assessment

The original architecture implied "crews hand off to a newly created CEO" at Stage 25. This is incorrect. The CEO already exists and has been receiving VP handoffs throughout the incubation process. Stage 25 is a **mode switch** + **operating charter update**, not a new agent instantiation.

---

## The Dual-Phase Lifecycle

### Phase 1: Incubation (Stages 1-25)

**Mechanism:** Ventures progress through a structured 25-Stage Workflow to validate, build, and launch.

**Agent Type:** Ephemeral "Builder Agents" (CrewAI crews)
- Task-specific, stateless workers
- Do NOT persist beyond their assigned tasks
- Dispatched by VP Agents during incubation
- Examples: Market Research Crew, Architecture Crew, QA Crew

**Goal:** Transform a raw idea into a launched, validated business.

**VP Stage Ownership:**
- VP_STRATEGY: Stages 1-9 (validation, business model, exit planning)
- VP_PRODUCT: Stages 10-12 (brand, GTM, sales logic)
- VP_TECH: Stages 13-20 (architecture, build, security)
- VP_GROWTH: Stages 21-25 (QA, deployment, launch, optimization)

### Phase 2: Operations (Post-Stage 25)

**Mechanism:** Once Stage 25 completes, we switch to an operational organizational structure.

**Agent Type:** Persistent "Manager Agents"
- CEO Agent: Full operational control, strategic planning, resource allocation
- VP Agents: Functional area leadership with persistent memory
- Departmental Crews: Specialists reporting to VPs

**Goal:** Run the company day-to-day with autonomous AI leadership.

**Hierarchy:**
```
L1: Chairman (Human) - Ecosystem governance
    |
L2: Venture CEO Agent - Autonomous venture leadership
    |
L3: Executive Agents (VPs) - Functional area leadership
    |
L4: Departmental Crews - Specialized execution
```

---

## CEO Operational Modes

### Incubation Mode (Default: Stages 1-24)

```typescript
interface IncubationModeCEO {
  mode: 'incubation';

  delegation_authority: {
    can_approve_spend_usd: 100;          // Very limited
    can_approve_token_budget: 10000;     // Per-stage only
    escalation_threshold_confidence: 0.8; // High - escalate often
    must_escalate_stages: [3, 5, 13, 16, 23, 25]; // Decision gates (see lifecycle_stage_config)
    must_escalate_categories: ['kill', 'pivot', 'budget_increase'];
  };

  responsibilities: [
    'state_machine_owner',
    'vp_handoff_receiver',
    'progress_reporter',
    'artifact_aggregator'
  ];

  cannot: [
    'expand_budget_unilaterally',
    'hire_new_agents',
    'change_business_model',
    'approve_major_pivots'
  ];
}
```

### Operational Mode (Post-Stage 25)

```typescript
interface OperationalModeCEO {
  mode: 'operational';

  delegation_authority: {
    can_approve_spend_usd: 500;           // Expanded
    can_approve_token_budget: 100000;     // Monthly budget
    escalation_threshold_confidence: 0.7; // More autonomy
    must_escalate_stages: [];             // No stage gates in ops
    must_escalate_categories: ['legal', 'security', 'brand_risk', 'major_pivot'];
  };

  responsibilities: [
    'strategic_planning',
    'resource_allocation',
    'team_management',
    'stakeholder_reporting',
    'ops_cadence_ownership'
  ];

  new_capabilities: [
    'instantiate_operational_crews',
    'define_standing_cadences',
    'approve_routine_decisions',
    'manage_budget_allocation'
  ];
}
```

---

## Mode Transition Protocol

### Transition Trigger: Two-Factor

The mode transition requires **both** conditions to be met:

1. **Technical Trigger:** Stage 25 marked as `completed`
   - All Stage 25 artifacts present
   - Quality gates passed
   - Launch checklist complete

2. **Governance Trigger:** Chairman explicit approval
   - Chairman reviews Operational Handoff Packet
   - Chairman approves autonomy expansion
   - Recorded in `chairman_decisions` table

```typescript
interface ModeTransitionTrigger {
  technical: {
    stage_25_status: 'completed';
    all_artifacts_present: boolean;
    quality_gates_passed: boolean;
    launch_checklist_complete: boolean;
  };

  governance: {
    chairman_reviewed_packet: boolean;
    chairman_approved_operational_mode: boolean;
    chairman_approval_at: string; // ISO8601
    chairman_notes?: string;
  };
}
```

### Transition Sequence

```
Stage 25 Completes
       |
       v
CEO Generates Operational Handoff Packet
       |
       v
EVA Reviews Packet for Completeness
       |
       v
Packet Submitted to Chairman Queue
       |
       v
Chairman Reviews + Approves
       |
       v
Mode Transition Executes:
  1. CEO mode updated to 'operational'
  2. Delegation authority expanded
  3. Operational crews instantiated
  4. Standing cadences activated
  5. Venture Constitution finalized
       |
       v
Operations Begin
```

---

## Operational Handoff Packet Schema

The Operational Handoff Packet is a comprehensive snapshot of the venture state at Stage 25 completion, designed to enable autonomous operations.

```typescript
interface OperationalHandoffPacket {
  schema_version: '1.0.0';
  handoff_type: 'mode_transition';

  metadata: {
    venture_id: string;
    venture_name: string;
    handoff_id: string;
    generated_at: string; // ISO8601
    generated_by_agent_id: string;
    from: { phase: 'incubation'; stage: 25 };
    to: { phase: 'operational'; mode: 'operational_ceo' };
    artifact_store_namespace: string;
    links: {
      venture_dashboard_url: string;
      runbook_url: string;
    };
  };

  governance: {
    chairman_intent: {
      original_directive: string;
      updated_directive: string;
      non_goals: string[];
    };
    delegation_authority: {
      ceo: {
        can_approve_spend_usd: number;
        can_approve_token_budget: number;
        escalation_threshold_confidence: number;
        must_escalate_stages: number[];
        must_escalate_categories: string[];
      };
    };
    approvals: {
      stage_25_completed_by: string;
      stage_25_completed_at: string;
      chairman_approved_operational_mode: boolean;
      chairman_approval_at?: string;
    };
  };

  decision_log: DecisionRecord[];

  market_and_gtm: {
    icp: {
      segment: string;
      firmographics: Record<string, any>;
      use_cases: string[];
    };
    positioning: {
      category: string;
      unique_claims: string[];
      competitors: string[];
    };
    pricing_and_packaging: {
      model: string;
      tiers: any[];
      discount_policy: string;
    };
    sales_and_success: {
      sales_motion: 'plg' | 'sales_led' | 'hybrid';
      pipeline_definition: Record<string, any>;
      onboarding: Record<string, any>;
      support_model: {
        channels: string[];
        hours: string;
        sla_targets: Record<string, any>;
      };
    };
  };

  product_and_tech: {
    product_state: {
      mvp_scope_summary: string;
      known_gaps: string[];
      roadmap_next_90_days: string[];
    };
    architecture: {
      tech_stack: {
        frontend: string;
        backend: string;
        db: string;
      };
      adr_artifact_ids: string[];
      api_contract_artifact_id: string;
      schema_spec_artifact_id: string;
    };
    security_privacy: {
      security_audit_artifact_id: string;
      threat_model_artifact_id: string;
      data_classification: {
        pii_present: boolean;
        pii_fields: string[];
        retention_policy: string;
      };
      compliance_notes: string[];
    };
    reliability: {
      slo: {
        availability_target: string;
        latency_target: string;
      };
      observability: {
        dashboards: string[];
        alerts: string[];
      };
    };
  };

  assumptions_vs_reality: {
    assumption_set: {
      assumption_set_id: string;
      version: number;
      created_at_stage: number;
    };
    calibration_report_artifact_id: string;
    kpi_deltas: Array<{
      metric: string;
      assumed: number;
      actual: number;
      error_pct: number;
    }>;
    invalidated_assumptions: string[];
    open_unknowns: string[];
  };

  operations: {
    deployment: {
      environment: string;
      deployment_runbook_artifact_id: string;
      rollback_plan: string;
    };
    monitoring_endpoints: string[];
    incident_response: {
      on_call: boolean;
      severity_levels: string[];
      first_30_day_plan: string;
    };
    analytics: {
      dashboard_artifact_id: string;
      event_taxonomy_version: string;
    };
  };

  budgets: {
    token_budget_profile: 'exploratory' | 'standard' | 'deep_due_diligence' | 'custom';
    token_budget_total: number;
    token_consumed_total: number;
    tool_quota_policy: {
      monthly_cost_limit_usd: number;
      notes: string;
    };
  };

  risk_register: RiskEntry[];

  artifact_manifest: {
    by_stage: Record<string, string[]>;
    critical_artifacts: {
      brand_guidelines: string;
      gtm_plan: string;
      sales_playbook: string;
      api_contract: string;
      schema_spec: string;
      security_audit: string;
      deployment_runbook: string;
      assumptions_vs_reality_report: string;
    };
  };
}

interface DecisionRecord {
  decision_id: string;
  stage: number;
  title: string;
  decision: string;
  rationale: string;
  alternatives_considered: string[];
  owner_agent_id: string;
  reviewed_by_agent_ids: string[];
  confidence: number;
  epistemic: {
    bucket: 'fact' | 'assumption' | 'simulation' | 'unknown';
    evidence_artifact_ids: string[];
    unknowns_to_close: string[];
  };
  reversibility: 'reversible' | 'hard_to_reverse';
  revalidate_by: string;
}

interface RiskEntry {
  risk_id: string;
  description: string;
  probability: 'high' | 'medium' | 'low';
  impact: 'high' | 'medium' | 'low';
  mitigation_strategy: string;
  owner_role: 'VP_STRATEGY' | 'VP_PRODUCT' | 'VP_TECH' | 'VP_GROWTH';
  status: 'open' | 'monitoring' | 'mitigated';
}
```

---

## Venture Constitution

The Venture Constitution is a living document updated throughout incubation and finalized at Stage 25. It serves as the operating charter for the CEO in operational mode.

### Constitution Structure

```typescript
interface VentureConstitution {
  version: number;
  venture_id: string;
  created_at: string;
  last_updated_at: string;

  // Chairman's Strategic Intent
  chairman_intent: {
    original_directive: string;
    current_directive: string;
    non_goals: string[];
    risk_tolerance: 'conservative' | 'moderate' | 'aggressive';
    communication_preferences: {
      briefing_frequency: 'daily' | 'weekly' | 'on_change';
      escalation_channels: string[];
    };
  };

  // Governance Rules
  governance: {
    escalation_rules: EscalationRule[];
    approval_thresholds: ApprovalThreshold[];
    forbidden_actions: string[];
  };

  // Operating Parameters
  operating_parameters: {
    budget_envelope_usd: number;
    token_budget_monthly: number;
    tool_quota_monthly_usd: number;
    headcount_limit: number; // max crews
  };

  // Success Metrics
  success_metrics: {
    primary_kpis: KPI[];
    target_timeline: string;
    review_cadence: string;
  };
}

interface EscalationRule {
  trigger: string;
  threshold?: number;
  escalate_to: 'chairman' | 'eva';
  urgency: 'immediate' | 'next_briefing' | 'weekly';
}

interface ApprovalThreshold {
  action_type: string;
  ceo_can_approve_up_to: number;
  requires_chairman_above: number;
}

interface KPI {
  name: string;
  target_value: number;
  current_value?: number;
  measurement_method: string;
}
```

---

## Post-Launch Organizational Structure

### Operational Crews

These crews are instantiated at mode transition and persist throughout operations:

```typescript
const OPERATIONAL_CREWS = {
  SUPPORT_OPS: {
    id: 'SUPPORT_OPS',
    name: 'Customer Support Operations',
    reports_to: 'VP_GROWTH',
    capabilities: ['ticket_triage', 'customer_communication', 'escalation'],
    standing_cadence: 'continuous',
  },

  BILLING_OPS: {
    id: 'BILLING_OPS',
    name: 'Billing Operations',
    reports_to: 'VP_STRATEGY',
    capabilities: ['subscription_management', 'payment_processing', 'revenue_reporting'],
    standing_cadence: 'daily_reconciliation',
  },

  INCIDENT_RESPONSE: {
    id: 'INCIDENT_RESPONSE',
    name: 'Incident Response Team',
    reports_to: 'VP_TECH',
    capabilities: ['monitoring', 'alerting', 'incident_management', 'postmortem'],
    standing_cadence: 'on_call_rotation',
  },

  GROWTH_ENGINEERING: {
    id: 'GROWTH_ENGINEERING',
    name: 'Growth Engineering',
    reports_to: 'VP_GROWTH',
    capabilities: ['experimentation', 'funnel_optimization', 'performance'],
    standing_cadence: 'weekly_experiment_review',
  },

  CUSTOMER_SUCCESS: {
    id: 'CUSTOMER_SUCCESS',
    name: 'Customer Success',
    reports_to: 'VP_PRODUCT',
    capabilities: ['onboarding', 'retention', 'churn_prevention', 'nps_management'],
    standing_cadence: 'daily_health_check',
  },
};
```

### Standing Cadences

```typescript
const OPERATING_CADENCES = {
  DAILY_STANDUP: {
    frequency: 'daily',
    time: '09:00',
    participants: ['CEO', 'VP_STRATEGY', 'VP_PRODUCT', 'VP_TECH', 'VP_GROWTH'],
    agenda: ['blockers', 'priorities', 'metrics_check'],
    artifact: 'daily_standup_notes',
  },

  WEEKLY_METRICS_REVIEW: {
    frequency: 'weekly',
    day: 'monday',
    participants: ['CEO', 'all_vps'],
    agenda: ['kpi_review', 'trend_analysis', 'action_items'],
    artifact: 'weekly_metrics_report',
  },

  MONTHLY_CHAIRMAN_BRIEFING: {
    frequency: 'monthly',
    participants: ['Chairman', 'CEO'],
    agenda: ['performance_review', 'strategic_alignment', 'budget_check'],
    artifact: 'monthly_chairman_report',
  },

  QUARTERLY_STRATEGY_REVIEW: {
    frequency: 'quarterly',
    participants: ['Chairman', 'CEO', 'all_vps'],
    agenda: ['strategy_assessment', 'pivot_consideration', 'resource_planning'],
    artifact: 'quarterly_strategy_deck',
  },
};
```

---

## Database Schema

### operational_handoff_packets

```sql
CREATE TABLE IF NOT EXISTS operational_handoff_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  handoff_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),

  schema_version VARCHAR(20) DEFAULT '1.0.0',
  handoff_type VARCHAR(50) DEFAULT 'mode_transition'
    CHECK (handoff_type IN ('mode_transition', 'stage_transition', 'emergency_handoff')),

  -- State markers
  from_phase VARCHAR(50) NOT NULL,
  from_stage INT,
  to_phase VARCHAR(50) NOT NULL,
  to_mode VARCHAR(50),

  -- Full packet content
  packet_content JSONB NOT NULL,

  -- Approval workflow
  generated_by_agent_id UUID,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  eva_reviewed BOOLEAN DEFAULT FALSE,
  eva_reviewed_at TIMESTAMPTZ,
  chairman_reviewed BOOLEAN DEFAULT FALSE,
  chairman_reviewed_at TIMESTAMPTZ,
  chairman_approved BOOLEAN,
  chairman_notes TEXT,

  -- Execution
  transition_executed BOOLEAN DEFAULT FALSE,
  transition_executed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_handoff_packets_venture ON operational_handoff_packets(venture_id);
CREATE INDEX idx_handoff_packets_pending ON operational_handoff_packets(venture_id)
  WHERE chairman_approved IS NULL;
CREATE INDEX idx_handoff_packets_type ON operational_handoff_packets(handoff_type);

-- RLS
ALTER TABLE operational_handoff_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "handoff_packets_select" ON operational_handoff_packets
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "handoff_packets_insert" ON operational_handoff_packets
  FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "handoff_packets_update" ON operational_handoff_packets
  FOR UPDATE TO authenticated USING (fn_is_chairman()) WITH CHECK (fn_is_chairman());
```

### venture_constitutions

```sql
CREATE TABLE IF NOT EXISTS venture_constitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT TRUE,

  -- Content
  constitution_content JSONB NOT NULL,

  -- Approval
  approved_by_chairman BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(venture_id, version)
);

-- Indexes
CREATE INDEX idx_constitutions_venture ON venture_constitutions(venture_id);
CREATE INDEX idx_constitutions_current ON venture_constitutions(venture_id)
  WHERE is_current = TRUE;

-- RLS
ALTER TABLE venture_constitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "constitutions_select" ON venture_constitutions
  FOR SELECT TO authenticated USING (fn_is_chairman());

CREATE POLICY "constitutions_manage" ON venture_constitutions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

### ceo_mode_transitions

```sql
CREATE TABLE IF NOT EXISTS ceo_mode_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,

  from_mode VARCHAR(50) NOT NULL,
  to_mode VARCHAR(50) NOT NULL,

  -- Triggers
  technical_trigger_met BOOLEAN DEFAULT FALSE,
  technical_trigger_at TIMESTAMPTZ,
  governance_trigger_met BOOLEAN DEFAULT FALSE,
  governance_trigger_at TIMESTAMPTZ,

  -- Execution
  transition_executed BOOLEAN DEFAULT FALSE,
  transition_executed_at TIMESTAMPTZ,

  -- Reference
  handoff_packet_id UUID REFERENCES operational_handoff_packets(id),
  chairman_decision_id UUID REFERENCES chairman_decisions(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_ceo_transitions_venture ON ceo_mode_transitions(venture_id);
CREATE INDEX idx_ceo_transitions_pending ON ceo_mode_transitions(venture_id)
  WHERE transition_executed = FALSE;
```

---

## Related Specifications

- [00_VISION_V2_CHAIRMAN_OS.md](../00_VISION_V2_CHAIRMAN_OS.md) - Parent document, Section 13
- [01-database-schema.md](./01-database-schema.md) - Database foundations
- [04-eva-orchestration.md](./04-eva-orchestration.md) - EVA state machines
- [06-hierarchical-agent-architecture.md](./06-hierarchical-agent-architecture.md) - Agent hierarchy
