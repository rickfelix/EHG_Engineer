-- EHG Message Bus (RabbitMQ) Strategic Directive Implementation
-- Database-First Governance Artifacts for EHG_Engineering
-- Target: EHG Application (40-stage venture workflow)
-- Created: 2025-01-17

-- =====================================================
-- PART A: SCHEMA AUDIT & EXTENSIONS (IDEMPOTENT)
-- =====================================================

-- 1. Ensure base tables exist with proper structure
-- Strategic Directives V2 (upgrade existing if needed)
CREATE TABLE IF NOT EXISTS strategic_directives_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    owner VARCHAR(100) NOT NULL,
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('Proposed', 'Active', 'In_Progress', 'Completed', 'Archived')),
    scope TEXT NOT NULL,
    outcomes TEXT NOT NULL,
    risks TEXT,
    dependencies TEXT,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    kpis JSONB DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT '{}',
    target_release VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PRDs V2 Table (unified structure)
CREATE TABLE IF NOT EXISTS prds_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    slug VARCHAR(100) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('Draft', 'Review', 'Approved', 'Published', 'Archived')),
    version INTEGER DEFAULT 1,
    body_md TEXT NOT NULL,
    sections JSONB DEFAULT '{}'::jsonb,
    tags TEXT[] DEFAULT '{}',
    kpis JSONB DEFAULT '{}'::jsonb,
    acceptance_criteria JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backlog Epics V2
CREATE TABLE IF NOT EXISTS backlog_epics_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sd_id UUID REFERENCES strategic_directives_v2(id) ON DELETE CASCADE,
    key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    seq_no INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Planned',
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    acceptance JSONB DEFAULT '[]'::jsonb,
    estimate_points NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backlog Stories V2
CREATE TABLE IF NOT EXISTS backlog_stories_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    epic_id UUID REFERENCES backlog_epics_v2(id) ON DELETE CASCADE,
    key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    seq_no INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Planned',
    priority VARCHAR(20) NOT NULL CHECK (priority IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    acceptance JSONB DEFAULT '[]'::jsonb,
    estimate_points NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backlog Tasks V2
CREATE TABLE IF NOT EXISTS backlog_tasks_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    story_id UUID REFERENCES backlog_stories_v2(id) ON DELETE CASCADE,
    key VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    seq_no INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Planned',
    effort_hours NUMERIC(10,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create or Replace Views
CREATE OR REPLACE VIEW v_prd_sd_payload AS
SELECT
    sd.key as sd_key,
    sd.title as sd_title,
    prd.slug as prd_slug,
    prd.title as prd_title,
    prd.status as prd_status,
    prd.version as prd_version,
    sd.kpis,
    sd.acceptance_criteria
FROM strategic_directives_v2 sd
LEFT JOIN prds_v2 prd ON prd.sd_id = sd.id;

CREATE OR REPLACE VIEW v_sd_backlog_flat AS
SELECT
    sd.key as sd_key,
    e.key as epic_key,
    s.key as story_key,
    t.title as task_title,
    t.seq_no,
    t.status,
    s.priority
FROM strategic_directives_v2 sd
JOIN backlog_epics_v2 e ON e.sd_id = sd.id
JOIN backlog_stories_v2 s ON s.epic_id = e.id
LEFT JOIN backlog_tasks_v2 t ON t.story_id = s.id
ORDER BY e.seq_no, s.seq_no, t.seq_no;

-- 3. Row Level Security (RLS) Policies
ALTER TABLE prds_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_epics_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_stories_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_tasks_v2 ENABLE ROW LEVEL SECURITY;

-- Read-all policies
CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON prds_v2
    FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON backlog_epics_v2
    FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON backlog_stories_v2
    FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Enable read access for all users" ON backlog_tasks_v2
    FOR SELECT USING (true);

-- Write-by-service policies (assumes service_role or similar)
CREATE POLICY IF NOT EXISTS "Enable write for service" ON prds_v2
    FOR ALL USING (auth.jwt() ->> 'role' IN ('service_role', 'admin'));
CREATE POLICY IF NOT EXISTS "Enable write for service" ON backlog_epics_v2
    FOR ALL USING (auth.jwt() ->> 'role' IN ('service_role', 'admin'));
CREATE POLICY IF NOT EXISTS "Enable write for service" ON backlog_stories_v2
    FOR ALL USING (auth.jwt() ->> 'role' IN ('service_role', 'admin'));
CREATE POLICY IF NOT EXISTS "Enable write for service" ON backlog_tasks_v2
    FOR ALL USING (auth.jwt() ->> 'role' IN ('service_role', 'admin'));

-- Update triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sd_v2_updated_at BEFORE UPDATE ON strategic_directives_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_prds_v2_updated_at BEFORE UPDATE ON prds_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_epics_v2_updated_at BEFORE UPDATE ON backlog_epics_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_stories_v2_updated_at BEFORE UPDATE ON backlog_stories_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_v2_updated_at BEFORE UPDATE ON backlog_tasks_v2
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART B: SEED DATA FOR SD-2025-09-EMB
-- =====================================================

-- 1. Insert Strategic Directive (idempotent)
INSERT INTO strategic_directives_v2 (
    id,
    key,
    title,
    owner,
    priority,
    status,
    scope,
    outcomes,
    risks,
    dependencies,
    acceptance_criteria,
    kpis,
    tags,
    target_release
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'SD-2025-09-EMB',
    'EHG Message Bus (RabbitMQ) for Agent Handoffs & Stage Transitions',
    'Chairman',
    'HIGH',
    'Proposed',
    'EHG application (40-stage venture workflow) - NOT EHG_Engineering. Governance artifacts stored in EHG_Engineering database.',
    'Durable async handoffs between LEAD/PLAN/EXEC agents; Lower coupling; Retry/DLQ for resilience; Full observability',
    'Message loss during broker failure; Increased operational complexity; Learning curve for team',
    'RabbitMQ infrastructure; OTel for observability; Feature flag system',
    '[
        "Durability: broker restart does not lose acked messages",
        "Idempotency: re-delivery causes no duplicate side-effects",
        "Latency: p50 publish-consume <100ms in staging",
        "Reliability: <1% messages to DLQ over 24h soak",
        "Security: TLS + least-privilege vhost /ehg",
        "Observability: Traces include event_id and correlation_id",
        "Rollback: single toggle back to DB-driven flow"
    ]'::jsonb,
    '{
        "p50_latency_ms": 100,
        "dlq_rate_pct_lt": 1,
        "uptime_pct": 99.9,
        "message_throughput_per_sec": 1000
    }'::jsonb,
    ARRAY['infra', 'agents', 'reliability', 'observability'],
    '2025.10'
) ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    priority = EXCLUDED.priority,
    acceptance_criteria = EXCLUDED.acceptance_criteria,
    kpis = EXCLUDED.kpis,
    updated_at = CURRENT_TIMESTAMP;

-- 2. Insert PRD (idempotent)
INSERT INTO prds_v2 (
    id,
    sd_id,
    slug,
    title,
    status,
    version,
    body_md,
    sections,
    tags,
    kpis,
    acceptance_criteria
) VALUES (
    'b2c3d4e5-f6a7-8901-bcde-f23456789012'::uuid,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'SD-2025-09-EMB-PRD',
    'PRD: EHG Message Bus (RabbitMQ)',
    'Draft',
    1,
    '# PRD: EHG Message Bus (RabbitMQ)

## Background
The EHG application currently uses synchronous database-driven communication between LEAD/PLAN/EXEC agents and for stage transitions in the 40-stage venture workflow. This creates tight coupling, lacks retry mechanisms, and provides limited observability.

## Goals
- Implement durable message bus for agent handoffs (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
- Enable async stage transitions with retry/DLQ
- Provide full observability via OpenTelemetry
- Support graceful rollback to database-driven flow

## Non-Goals
- Real-time streaming (use existing Supabase realtime for that)
- Replacing all database operations (only handoffs/transitions)
- Multi-datacenter replication

## Event Envelope v1.0
```json
{
  "event_id": "uuid",
  "event_type": "handoff.lead.plan | stage.transition",
  "routing_key": "handoff.lead | stage.10.11",
  "venture_id": "uuid",
  "stage_from": 10,
  "stage_to": 11,
  "agent_from": "LEAD",
  "agent_to": "PLAN",
  "payload": {},
  "correlation_id": "uuid",
  "occurred_at": "ISO8601",
  "schema_version": "1.0"
}
```

## Queues & Bindings
- Exchange: `ehg.events` (topic)
- Queues:
  - `stage.transitions` → `stage.*.*`
  - `agent.lead` → `handoff.*.lead`
  - `agent.plan` → `handoff.*.plan`
  - `agent.exec` → `handoff.*.exec`
  - `eva.integrations` → `eva.notify.*`
- Retry queues: `retry.{queue_name}`
- DLQ: `dlq.{queue_name}`

## Retry/DLQ Policy
- Max retries: 3 with exponential backoff (1s, 5s, 30s)
- DLQ after max retries
- DLQ alerts to EVA via `eva.notify.dlq`
- Manual intervention UI for DLQ inspection

## Security
- TLS 1.3 for all connections
- Vhost `/ehg` with least-privilege users
- Separate credentials per service
- Encrypted payloads for PII/sensitive data

## Observability
- OpenTelemetry traces with event_id propagation
- Metrics: publish rate, consume rate, queue depth, DLQ rate
- Dashboards in Grafana
- Alerts: DLQ depth > 100, consumer lag > 1000

## Rollout Phases
1. **Shadow Mode** (Week 1-2): Publish to bus, continue using DB
2. **Partial** (Week 3-4): Select ventures use bus, others DB
3. **Authoritative** (Week 5+): Bus is primary, DB is fallback
4. **Cleanup** (Week 8+): Remove DB polling code

## Migration & Rollback
- Feature flag `FEATURE_MQ` controls bus vs DB
- Dual-write during shadow mode
- Instant rollback via flag toggle
- Data reconciliation scripts for drift detection

## Test Plan
- Unit tests for publishers/consumers
- Integration tests with real RabbitMQ
- Chaos testing: broker restart, network partition
- Load testing: 10K messages/sec sustained
- E2E: Full venture workflow via message bus',
    '{
        "envelope": "Event envelope v1.0 with UUID event_id and correlation tracking",
        "queues": "Topic exchange with agent and stage queues plus retry/DLQ",
        "security": "TLS 1.3, vhost isolation, encrypted sensitive payloads",
        "observability": "OTel traces, Grafana dashboards, DLQ alerting",
        "rollout": "Shadow → Partial → Authoritative with feature flag control"
    }'::jsonb,
    ARRAY['message-bus', 'rabbitmq', 'async', 'infrastructure'],
    '{
        "p50_latency_ms": 100,
        "dlq_rate_pct_lt": 1,
        "uptime_pct": 99.9
    }'::jsonb,
    '[
        "Shadow mode validates no message loss",
        "Idempotent consumers pass dedup tests",
        "Rollback completes in <5 minutes",
        "Load test sustains 10K msg/sec"
    ]'::jsonb
) ON CONFLICT (slug) DO UPDATE SET
    body_md = EXCLUDED.body_md,
    sections = EXCLUDED.sections,
    updated_at = CURRENT_TIMESTAMP;

-- =====================================================
-- PART C: BACKLOG (SEQUENCED EPICS/STORIES/TASKS)
-- =====================================================

-- Epic 1: Infrastructure & Feature Flag
INSERT INTO backlog_epics_v2 (id, sd_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES (
    'c3d4e5f6-a7b8-9012-cdef-345678901234'::uuid,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'E1-EMB-INFRA',
    'Infrastructure & Feature Flag Setup',
    1,
    'Planned',
    'CRITICAL',
    '[
        "RabbitMQ running in docker-compose",
        "Vhost /ehg created with users",
        "FEATURE_MQ flag toggleable",
        "Secrets stored in vault/env"
    ]'::jsonb,
    8
) ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    acceptance = EXCLUDED.acceptance,
    updated_at = CURRENT_TIMESTAMP;

-- Stories for Epic 1
INSERT INTO backlog_stories_v2 (id, epic_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES
    ('d4e5f6a7-b8c9-0123-defa-456789012345'::uuid, 'c3d4e5f6-a7b8-9012-cdef-345678901234'::uuid,
     'S1.1-DOCKER', 'Setup RabbitMQ docker-compose with management UI', 1, 'Planned', 'HIGH',
     '["RabbitMQ 3.12+ running", "Management UI accessible on :15672", "Persistent volumes configured"]'::jsonb, 3),
    ('e5f6a7b8-c9d0-1234-efab-567890123456'::uuid, 'c3d4e5f6-a7b8-9012-cdef-345678901234'::uuid,
     'S1.2-VHOST', 'Configure vhost /ehg with users and permissions', 2, 'Planned', 'HIGH',
     '["Vhost /ehg created", "Users: ehg-publisher, ehg-consumer", "Least-privilege permissions"]'::jsonb, 2),
    ('f6a7b8c9-d0e1-2345-fabc-678901234567'::uuid, 'c3d4e5f6-a7b8-9012-cdef-345678901234'::uuid,
     'S1.3-FLAG', 'Implement FEATURE_MQ feature flag with runtime toggle', 3, 'Planned', 'CRITICAL',
     '["Flag reads from env/config", "Runtime toggle without restart", "Default OFF for safety"]'::jsonb, 3)
ON CONFLICT (key) DO NOTHING;

-- Tasks for Story S1.1
INSERT INTO backlog_tasks_v2 (id, story_id, key, title, seq_no, status, effort_hours)
VALUES
    (gen_random_uuid(), 'd4e5f6a7-b8c9-0123-defa-456789012345'::uuid,
     'T1.1.1', 'Write docker-compose.yml with RabbitMQ service', 1, 'Planned', 2),
    (gen_random_uuid(), 'd4e5f6a7-b8c9-0123-defa-456789012345'::uuid,
     'T1.1.2', 'Configure persistent volumes and networking', 2, 'Planned', 1),
    (gen_random_uuid(), 'd4e5f6a7-b8c9-0123-defa-456789012345'::uuid,
     'T1.1.3', 'Add health checks and restart policies', 3, 'Planned', 1)
ON CONFLICT (key) DO NOTHING;

-- Epic 2: Event Contracts & Publishers
INSERT INTO backlog_epics_v2 (id, sd_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES (
    'a7b8c9d0-e1f2-3456-abcd-789012345678'::uuid,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'E2-EMB-PUBLISH',
    'Event Contracts & Publishers',
    2,
    'Planned',
    'HIGH',
    '[
        "Event envelope v1.0 TypeScript types",
        "Publishers for LEAD→PLAN, PLAN→EXEC handoffs",
        "Stage transition publishers",
        "Schema validation on publish"
    ]'::jsonb,
    13
) ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    acceptance = EXCLUDED.acceptance,
    updated_at = CURRENT_TIMESTAMP;

-- Stories for Epic 2
INSERT INTO backlog_stories_v2 (id, epic_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES
    ('b8c9d0e1-f2a3-4567-bcde-890123456789'::uuid, 'a7b8c9d0-e1f2-3456-abcd-789012345678'::uuid,
     'S2.1-SCHEMA', 'Define event envelope v1.0 schema with TypeScript/Zod', 1, 'Planned', 'CRITICAL',
     '["TypeScript interfaces", "Zod validation schemas", "JSON Schema generation"]'::jsonb, 5),
    ('c9d0e1f2-a3b4-5678-cdef-901234567890'::uuid, 'a7b8c9d0-e1f2-3456-abcd-789012345678'::uuid,
     'S2.2-HANDOFF-PUB', 'Implement agent handoff publishers', 2, 'Planned', 'HIGH',
     '["LEAD→PLAN publisher", "PLAN→EXEC publisher", "EXEC→PLAN publisher", "Correlation ID threading"]'::jsonb, 5),
    ('d0e1f2a3-b4c5-6789-defa-012345678901'::uuid, 'a7b8c9d0-e1f2-3456-abcd-789012345678'::uuid,
     'S2.3-STAGE-PUB', 'Implement stage transition publishers', 3, 'Planned', 'HIGH',
     '["Publish on stage change", "Include venture context", "Route by stage numbers"]'::jsonb, 3)
ON CONFLICT (key) DO NOTHING;

-- Epic 3: Consumers & Idempotency
INSERT INTO backlog_epics_v2 (id, sd_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES (
    'e1f2a3b4-c5d6-7890-abcd-123456789012'::uuid,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'E3-EMB-CONSUME',
    'Consumers & Idempotency',
    3,
    'Planned',
    'HIGH',
    '[
        "Agent consumers process handoffs",
        "Stage consumers update venture state",
        "Idempotency via processed_events table",
        "Retry with exponential backoff",
        "DLQ on max retries"
    ]'::jsonb,
    21
) ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    acceptance = EXCLUDED.acceptance,
    updated_at = CURRENT_TIMESTAMP;

-- Stories for Epic 3
INSERT INTO backlog_stories_v2 (id, epic_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES
    ('f2a3b4c5-d6e7-8901-bcde-234567890123'::uuid, 'e1f2a3b4-c5d6-7890-abcd-123456789012'::uuid,
     'S3.1-PROCESSED', 'Create processed_events table for idempotency', 1, 'Planned', 'CRITICAL',
     '["Table with event_id PK", "Processing timestamp", "Result storage", "TTL cleanup"]'::jsonb, 3),
    ('a3b4c5d6-e7f8-9012-cdef-345678901234'::uuid, 'e1f2a3b4-c5d6-7890-abcd-123456789012'::uuid,
     'S3.2-IDEM-LOGIC', 'Implement idempotency wrapper for consumers', 2, 'Planned', 'CRITICAL',
     '["Check processed_events", "UPSERT on completion", "Skip already processed", "Handle concurrent processing"]'::jsonb, 8),
    ('b4c5d6e7-f8a9-0123-defa-456789012345'::uuid, 'e1f2a3b4-c5d6-7890-abcd-123456789012'::uuid,
     'S3.3-AGENT-CONS', 'Build agent consumers with business logic', 3, 'Planned', 'HIGH',
     '["LEAD consumer updates state", "PLAN consumer triggers planning", "EXEC consumer starts implementation"]'::jsonb, 5),
    ('c5d6e7f8-a9b0-1234-efab-567890123456'::uuid, 'e1f2a3b4-c5d6-7890-abcd-123456789012'::uuid,
     'S3.4-RETRY-DLQ', 'Implement retry and DLQ handling', 4, 'Planned', 'HIGH',
     '["Exponential backoff", "Max 3 retries", "Route to DLQ on failure", "DLQ inspection UI"]'::jsonb, 5)
ON CONFLICT (key) DO NOTHING;

-- Epic 4: Observability
INSERT INTO backlog_epics_v2 (id, sd_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES (
    'd6e7f8a9-b0c1-2345-abcd-567890123456'::uuid,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'E4-EMB-OBSERVE',
    'Observability & Monitoring',
    4,
    'Planned',
    'MEDIUM',
    '[
        "OTel traces for message flow",
        "Metrics exported to Prometheus",
        "Grafana dashboards",
        "DLQ alerts to EVA",
        "Correlation ID in all logs"
    ]'::jsonb,
    13
) ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    acceptance = EXCLUDED.acceptance,
    updated_at = CURRENT_TIMESTAMP;

-- Stories for Epic 4
INSERT INTO backlog_stories_v2 (id, epic_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES
    ('e7f8a9b0-c1d2-3456-bcde-678901234567'::uuid, 'd6e7f8a9-b0c1-2345-abcd-567890123456'::uuid,
     'S4.1-OTEL', 'Integrate OpenTelemetry for distributed tracing', 1, 'Planned', 'MEDIUM',
     '["Trace context propagation", "Span per publish/consume", "Event_id in span attributes"]'::jsonb, 5),
    ('f8a9b0c1-d2e3-4567-cdef-789012345678'::uuid, 'd6e7f8a9-b0c1-2345-abcd-567890123456'::uuid,
     'S4.2-METRICS', 'Export metrics to Prometheus', 2, 'Planned', 'MEDIUM',
     '["Publish rate", "Consume rate", "Queue depth", "DLQ depth", "Processing latency"]'::jsonb, 3),
    ('a9b0c1d2-e3f4-5678-defa-890123456789'::uuid, 'd6e7f8a9-b0c1-2345-abcd-567890123456'::uuid,
     'S4.3-DASHBOARD', 'Create Grafana dashboards', 3, 'Planned', 'LOW',
     '["Message flow visualization", "Queue health", "Error rates", "Latency percentiles"]'::jsonb, 3),
    ('b0c1d2e3-f4a5-6789-efab-901234567890'::uuid, 'd6e7f8a9-b0c1-2345-abcd-567890123456'::uuid,
     'S4.4-ALERTS', 'Setup alerting for critical conditions', 4, 'Planned', 'MEDIUM',
     '["DLQ depth > 100", "Consumer lag > 1000", "Broker down", "Alert to EVA"]'::jsonb, 2)
ON CONFLICT (key) DO NOTHING;

-- Epic 5: Shadow Mode & Promotion
INSERT INTO backlog_epics_v2 (id, sd_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES (
    'c1d2e3f4-a5b6-7890-abcd-901234567890'::uuid,
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'E5-EMB-ROLLOUT',
    'Shadow Mode Soak & Promotion',
    5,
    'Planned',
    'HIGH',
    '[
        "Shadow mode with dual-write",
        "24h soak test validation",
        "Gradual promotion to primary",
        "Rollback capability verified",
        "Legacy code removal"
    ]'::jsonb,
    13
) ON CONFLICT (key) DO UPDATE SET
    title = EXCLUDED.title,
    acceptance = EXCLUDED.acceptance,
    updated_at = CURRENT_TIMESTAMP;

-- Stories for Epic 5
INSERT INTO backlog_stories_v2 (id, epic_id, key, title, seq_no, status, priority, acceptance, estimate_points)
VALUES
    ('d2e3f4a5-b6c7-8901-bcde-012345678901'::uuid, 'c1d2e3f4-a5b6-7890-abcd-901234567890'::uuid,
     'S5.1-SHADOW', 'Implement shadow mode with reconciliation', 1, 'Planned', 'CRITICAL',
     '["Dual-write to bus and DB", "Reconciliation job", "Drift detection", "Metrics comparison"]'::jsonb, 5),
    ('e3f4a5b6-c7d8-9012-cdef-123456789012'::uuid, 'c1d2e3f4-a5b6-7890-abcd-901234567890'::uuid,
     'S5.2-SOAK', 'Execute 24-hour soak test', 2, 'Planned', 'HIGH',
     '["10K msg/sec load", "Zero message loss", "<1% DLQ rate", "Latency within SLA"]'::jsonb, 2),
    ('f4a5b6c7-d8e9-0123-defa-234567890123'::uuid, 'c1d2e3f4-a5b6-7890-abcd-901234567890'::uuid,
     'S5.3-PROMOTE', 'Gradual promotion to authoritative', 3, 'Planned', 'HIGH',
     '["10% ventures on bus", "50% ventures", "100% ventures", "Monitor each stage"]'::jsonb, 3),
    ('a5b6c7d8-e9f0-1234-efab-345678901234'::uuid, 'c1d2e3f4-a5b6-7890-abcd-901234567890'::uuid,
     'S5.4-CLEANUP', 'Remove legacy DB polling code', 4, 'Planned', 'LOW',
     '["Identify dead code", "Remove with tests passing", "Archive for rollback", "Update docs"]'::jsonb, 3)
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- PART D: VERIFICATION QUERIES
-- =====================================================

-- Verification Script (save as verify-SD-2025-09-EMB.sql)
/*
-- 1. Verify SD exists
SELECT key, title, status, priority, target_release
FROM strategic_directives_v2
WHERE key = 'SD-2025-09-EMB';

-- 2. Verify PRD linkage
SELECT prd.slug, prd.title, sd.key
FROM prds_v2 prd
JOIN strategic_directives_v2 sd ON prd.sd_id = sd.id
WHERE sd.key = 'SD-2025-09-EMB';

-- 3. Verify backlog structure
SELECT
    e.key as epic_key,
    e.seq_no,
    e.title as epic_title,
    COUNT(DISTINCT s.id) as story_count,
    COUNT(DISTINCT t.id) as task_count
FROM backlog_epics_v2 e
LEFT JOIN backlog_stories_v2 s ON s.epic_id = e.id
LEFT JOIN backlog_tasks_v2 t ON t.story_id = s.id
WHERE e.sd_id = (SELECT id FROM strategic_directives_v2 WHERE key = 'SD-2025-09-EMB')
GROUP BY e.key, e.seq_no, e.title
ORDER BY e.seq_no;

-- 4. Verify views work
SELECT * FROM v_prd_sd_payload WHERE sd_key = 'SD-2025-09-EMB';

-- 5. Story details for Epic 1
SELECT s.key, s.title, s.priority, s.estimate_points
FROM backlog_stories_v2 s
JOIN backlog_epics_v2 e ON s.epic_id = e.id
WHERE e.key = 'E1-EMB-INFRA'
ORDER BY s.seq_no;

-- 6. Total effort summary
SELECT
    SUM(e.estimate_points) as total_epic_points,
    COUNT(DISTINCT e.id) as epic_count,
    COUNT(DISTINCT s.id) as story_count,
    COUNT(DISTINCT t.id) as task_count
FROM backlog_epics_v2 e
LEFT JOIN backlog_stories_v2 s ON s.epic_id = e.id
LEFT JOIN backlog_tasks_v2 t ON t.story_id = s.id
WHERE e.sd_id = (SELECT id FROM strategic_directives_v2 WHERE key = 'SD-2025-09-EMB');
*/

-- =====================================================
-- PART E: ROLLBACK SCRIPT
-- =====================================================

-- Rollback (save as rollback-SD-2025-09-EMB.sql)
/*
-- Safe rollback: Delete seeded data only, preserve schema
BEGIN;

-- Delete tasks first (cascade from stories)
DELETE FROM backlog_tasks_v2
WHERE story_id IN (
    SELECT s.id FROM backlog_stories_v2 s
    JOIN backlog_epics_v2 e ON s.epic_id = e.id
    WHERE e.sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid
);

-- Delete stories (cascade from epics)
DELETE FROM backlog_stories_v2
WHERE epic_id IN (
    SELECT id FROM backlog_epics_v2
    WHERE sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid
);

-- Delete epics
DELETE FROM backlog_epics_v2
WHERE sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

-- Delete PRD
DELETE FROM prds_v2
WHERE sd_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

-- Delete SD
DELETE FROM strategic_directives_v2
WHERE id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid;

COMMIT;
*/