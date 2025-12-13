# EVA Scaling Specification

**Vision v2 Chairman's OS - Multi-Instance EVA Architecture**

> "One EVA for ten ventures. Ten EVAs for one hundred."

---

## Table of Contents

1. [Overview](#overview)
2. [EVA Instance Model](#eva-instance-model)
3. [Routing Layer](#routing-layer)
4. [State Partitioning](#state-partitioning)
5. [Cross-EVA Coordination](#cross-eva-coordination)
6. [Database Schema](#database-schema)

---

## Overview

### The Problem

Current architecture has a single EVA orchestrator. At scale:
- **Bottleneck**: One EVA can't handle 100+ ventures with 50+ concurrent agents
- **Single point of failure**: EVA down = entire ecosystem halted
- **Mixed policies**: Different portfolios may need different EVA behaviors

### The Solution

**EVA Sharding** by portfolio:
- Each portfolio gets its own EVA instance
- Routing layer directs commands to correct EVA
- Cross-EVA coordination for ecosystem-level concerns

**Single-user production note:** In Rick-only deployments, you may start with a single `primary` EVA instance. The routing layer still exists conceptually to support failover (`secondary`) and future scaling without changing the Chairman-facing UX.

---

## EVA Instance Model

### 2.1 EVA Types

```typescript
type EVAInstanceType =
  | 'primary'        // Main EVA for a portfolio
  | 'secondary'      // Backup/failover EVA
  | 'ecosystem'      // Handles cross-portfolio concerns
  | 'specialized';   // Domain-specific (e.g., technical EVA)

interface EVAInstance {
  id: string;
  instance_type: EVAInstanceType;
  display_name: string;

  // Scope
  portfolio_id?: string;      // Null for ecosystem EVA
  venture_ids?: string[];     // If specialized to specific ventures

  // Configuration
  config: EVAConfig;
  policy_overrides: Record<string, any>;

  // Status
  status: 'active' | 'standby' | 'draining' | 'offline';
  current_load: number;       // Active tasks
  max_load: number;           // Capacity

  // Health
  last_heartbeat: string;
  health_score: number;       // 0-100
}

interface EVAConfig {
  // Briefing
  briefing_schedule: string;  // Cron expression
  briefing_aggregation: 'immediate' | 'batched' | 'daily';

  // Escalation
  escalation_threshold: number;
  max_escalations_per_day: number;

  // Performance
  max_concurrent_dispatches: number;
  task_timeout_minutes: number;
}
```

### 2.2 Default EVA Allocation

```typescript
const EVA_ALLOCATION_RULES = {
  // One EVA per portfolio by default
  ventures_per_eva: 20,           // Soft limit
  max_ventures_per_eva: 50,       // Hard limit

  // Ecosystem EVA handles:
  ecosystem_eva_responsibilities: [
    'cross_portfolio_reporting',
    'ecosystem_kb_management',
    'chairman_interface',
    'eva_coordination',
  ],

  // Auto-scale triggers
  scale_up_when: {
    average_load_percent: 80,     // Add EVA when load > 80%
    queue_depth: 100,             // Or when queue > 100 tasks
    response_time_ms: 5000,       // Or when avg response > 5s
  },
};
```

---

## Routing Layer

### 3.1 Command Router

All Chairman commands go through a routing layer:

```typescript
interface CommandRouter {
  // Route to correct EVA
  routeCommand(command: ChairmanCommand): Promise<EVAInstance>;

  // Handle EVA failure
  rerouteOnFailure(command: ChairmanCommand, failedEVA: string): Promise<EVAInstance>;

  // Load balancing
  selectEVAForVenture(ventureId: string): Promise<EVAInstance>;
}

async function routeCommand(
  command: ChairmanCommand
): Promise<EVAInstance> {
  // 1. Determine scope
  if (command.venture_id) {
    // Route to venture's portfolio EVA
    const venture = await getVenture(command.venture_id);
    return getEVAForPortfolio(venture.portfolio_id);
  }

  if (command.portfolio_id) {
    // Route to portfolio EVA
    return getEVAForPortfolio(command.portfolio_id);
  }

  // Ecosystem-level command → ecosystem EVA
  return getEcosystemEVA();
}

async function getEVAForPortfolio(
  portfolioId: string
): Promise<EVAInstance> {
  // 1. Get primary EVA for portfolio
  const eva = await db.query(`
    SELECT * FROM eva_instances
    WHERE portfolio_id = $1
      AND instance_type = 'primary'
      AND status = 'active'
    ORDER BY health_score DESC
    LIMIT 1
  `, [portfolioId]);

  if (eva.rows[0]) {
    return eva.rows[0];
  }

  // 2. Fallback to secondary
  const secondary = await db.query(`
    SELECT * FROM eva_instances
    WHERE portfolio_id = $1
      AND instance_type = 'secondary'
      AND status IN ('active', 'standby')
    ORDER BY health_score DESC
    LIMIT 1
  `, [portfolioId]);

  if (secondary.rows[0]) {
    // Promote to active
    await promoteEVA(secondary.rows[0].id);
    return secondary.rows[0];
  }

  // 3. Last resort: ecosystem EVA
  return getEcosystemEVA();
}
```

### 3.2 Failover Protocol

```typescript
interface FailoverProtocol {
  detection_timeout_seconds: 30;
  promotion_steps: [
    'mark_primary_draining',
    'activate_secondary',
    'redirect_traffic',
    'drain_primary_queue',
    'mark_primary_offline'
  ];
  rollback_window_minutes: 5;
}

async function handleEVAFailure(evaId: string): Promise<void> {
  const eva = await getEVA(evaId);

  // 1. Mark as draining (no new tasks)
  await updateEVAStatus(evaId, 'draining');

  // 2. Find and promote secondary
  const secondary = await findSecondaryEVA(eva.portfolio_id);
  if (secondary) {
    await updateEVAStatus(secondary.id, 'active');
    await updateRouting(eva.portfolio_id, secondary.id);
  }

  // 3. Redistribute pending tasks
  const pendingTasks = await getPendingTasksForEVA(evaId);
  for (const task of pendingTasks) {
    await redistributeTask(task);
  }

  // 4. Alert
  await createAlert({
    type: 'eva_failover',
    severity: 'critical',
    message: `EVA ${eva.display_name} failed over to ${secondary?.display_name || 'ecosystem'}`,
  });
}
```

---

## State Partitioning

### 4.1 EVA-Local vs Shared State

```typescript
// EVA-local state (not shared between EVAs)
interface EVALocalState {
  // In-memory cache
  active_commands: Map<string, ChairmanCommand>;
  task_queue: PriorityQueue<TaskContract>;
  agent_sessions: Map<string, AgentSession>;

  // Working memory
  current_context: string;
  recent_decisions: Decision[];
}

// Shared state (database)
interface SharedState {
  // All in DB with proper scoping
  ventures: 'all';              // Filtered by portfolio RLS
  agents: 'all';
  tasks: 'all';
  decisions: 'all';
  escalations: 'all';
}
```

### 4.2 State Synchronization

When EVA instances need to coordinate:

```typescript
interface EVASyncMessage {
  from_eva_id: string;
  to_eva_id: string;
  sync_type: 'state_update' | 'request_info' | 'broadcast';

  payload: {
    type: string;
    data: any;
    requires_ack: boolean;
  };
}

// Sync triggers
const SYNC_TRIGGERS = {
  // Immediate sync
  immediate: [
    'venture_transferred',        // Venture moved to different portfolio
    'agent_hierarchy_changed',    // VP/CEO reassigned
    'critical_decision_made',     // Chairman override
  ],

  // Batched sync (every 5 min)
  batched: [
    'token_usage_update',
    'health_score_update',
    'queue_depth_update',
  ],
};
```

---

## Cross-EVA Coordination

### 5.1 Ecosystem EVA Role

The Ecosystem EVA handles cross-portfolio concerns:

```typescript
interface EcosystemEVA {
  responsibilities: [
    // Aggregation
    'chairman_briefing_aggregation',  // Collect from all EVAs
    'portfolio_health_rollup',
    'ecosystem_metrics',

    // Coordination
    'cross_portfolio_programs',
    'shared_resource_allocation',
    'vendor_contract_management',

    // Knowledge
    'ecosystem_kb_curation',
    'pattern_publishing_approval',

    // Meta
    'eva_health_monitoring',
    'eva_scaling_decisions',
  ];
}

async function aggregateChairmanBriefing(): Promise<ChairmanBriefing> {
  // 1. Request briefing snippets from all EVAs
  const evas = await getActiveEVAs();
  const snippets = await Promise.all(
    evas.map(eva => requestBriefingSnippet(eva.id))
  );

  // 2. Aggregate and prioritize
  const aggregated = aggregateBriefings(snippets);

  // 3. Apply ecosystem-level context
  const ecosystemContext = await getEcosystemContext();
  return enrichBriefing(aggregated, ecosystemContext);
}
```

### 5.2 Cross-Portfolio Programs

When ventures across portfolios collaborate:

```typescript
interface CrossPortfolioProgram {
  program_id: string;
  participating_portfolios: string[];
  participating_ventures: string[];

  // Coordination
  coordinator_eva_id: string;   // One EVA coordinates
  participating_eva_ids: string[];

  // Communication
  shared_channel_id: string;    // For cross-EVA messages
}
```

---

## Database Schema

### 6.1 eva_instances

```sql
CREATE TABLE IF NOT EXISTS eva_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_type VARCHAR(20) NOT NULL
    CHECK (instance_type IN ('primary', 'secondary', 'ecosystem', 'specialized')),
  display_name VARCHAR(200) NOT NULL,

  portfolio_id UUID REFERENCES portfolios(id),
  venture_ids UUID[] DEFAULT '{}',

  config JSONB NOT NULL DEFAULT '{}',
  policy_overrides JSONB DEFAULT '{}',

  status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'standby', 'draining', 'offline')),
  current_load INT DEFAULT 0,
  max_load INT DEFAULT 100,

  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  health_score INT DEFAULT 100,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eva_portfolio ON eva_instances(portfolio_id, status);
CREATE INDEX idx_eva_active ON eva_instances(status) WHERE status = 'active';
```

### 6.2 eva_routing

```sql
CREATE TABLE IF NOT EXISTS eva_routing (
  portfolio_id UUID PRIMARY KEY REFERENCES portfolios(id),
  primary_eva_id UUID NOT NULL REFERENCES eva_instances(id),
  secondary_eva_id UUID REFERENCES eva_instances(id),
  last_failover_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.3 eva_sync_log

```sql
CREATE TABLE IF NOT EXISTS eva_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_eva_id UUID NOT NULL REFERENCES eva_instances(id),
  to_eva_id UUID NOT NULL REFERENCES eva_instances(id),
  sync_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eva_sync_pending ON eva_sync_log(to_eva_id, acknowledged)
  WHERE acknowledged = FALSE;
```

---

## Critical Questions for the Chairman

1. **One EVA or per-portfolio?** Do you want each portfolio to have independent policies, or one unified EVA?

2. **Failover tolerance?** How much delay is acceptable during EVA failover?

3. **Ecosystem EVA access?** Should ecosystem EVA have read access to all venture data, or only aggregated metrics?

---

## Related Specifications

- [04-eva-orchestration.md](./04-eva-orchestration.md) - EVA core logic
- [08-governance-policy-engine.md](./08-governance-policy-engine.md) - Policy per EVA
- [09-agent-runtime-service.md](./09-agent-runtime-service.md) - Task routing
