-- EVA Core Architecture Migration
-- SD: SD-EVA-ARCHITECTURE-001
-- Creates foundational tables for EVA Operating System

-- ============================================================================
-- Table: eva_ventures
-- Purpose: Track ventures under EVA management with health metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_ventures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venture_id UUID REFERENCES ventures(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'killed', 'graduated')),
    health_status TEXT DEFAULT 'yellow' CHECK (health_status IN ('green', 'yellow', 'red')),

    -- Health Metrics
    mrr DECIMAL(12, 2) DEFAULT 0,
    mrr_growth_rate DECIMAL(5, 2) DEFAULT 0,
    churn_rate DECIMAL(5, 2) DEFAULT 0,
    burn_rate DECIMAL(12, 2) DEFAULT 0,
    runway_months INTEGER DEFAULT 0,

    -- Decision Routing
    decision_class TEXT DEFAULT 'C' CHECK (decision_class IN ('A', 'B', 'C')),
    last_decision_at TIMESTAMPTZ,
    pending_decisions INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(venture_id)
);

-- Index for health queries
CREATE INDEX IF NOT EXISTS idx_eva_ventures_health ON eva_ventures(health_status);
CREATE INDEX IF NOT EXISTS idx_eva_ventures_status ON eva_ventures(status);

-- ============================================================================
-- Table: eva_events
-- Purpose: Event bus for all venture-related events
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eva_venture_id UUID REFERENCES eva_ventures(id) ON DELETE CASCADE,

    -- Event Details
    event_type TEXT NOT NULL CHECK (event_type IN (
        'metric_update', 'health_change', 'decision_required',
        'alert_triggered', 'automation_executed', 'status_change',
        'milestone_reached', 'risk_detected', 'user_action'
    )),
    event_source TEXT NOT NULL DEFAULT 'system',
    event_data JSONB DEFAULT '{}',

    -- Processing
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for event processing
CREATE INDEX IF NOT EXISTS idx_eva_events_unprocessed ON eva_events(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_eva_events_type ON eva_events(event_type);
CREATE INDEX IF NOT EXISTS idx_eva_events_venture ON eva_events(eva_venture_id);

-- ============================================================================
-- Table: eva_decisions
-- Purpose: Track all decisions requiring chairman attention
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eva_venture_id UUID REFERENCES eva_ventures(id) ON DELETE CASCADE,

    -- Decision Details
    decision_class TEXT NOT NULL CHECK (decision_class IN ('A', 'B', 'C')),
    title TEXT NOT NULL,
    description TEXT,
    stake_level TEXT CHECK (stake_level IN ('low', 'medium', 'high', 'critical')),

    -- Options
    options JSONB DEFAULT '[]',
    recommended_option TEXT,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'decided', 'auto_decided', 'expired')),
    decision_made TEXT,
    decided_by TEXT,
    decided_at TIMESTAMPTZ,

    -- Automation
    auto_decidable BOOLEAN DEFAULT FALSE,
    auto_decision_rule TEXT,

    -- Timestamps
    due_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for pending decisions
CREATE INDEX IF NOT EXISTS idx_eva_decisions_pending ON eva_decisions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_eva_decisions_class ON eva_decisions(decision_class);
CREATE INDEX IF NOT EXISTS idx_eva_decisions_venture ON eva_decisions(eva_venture_id);

-- ============================================================================
-- Table: eva_audit_log
-- Purpose: Audit trail for all EVA actions
-- ============================================================================
CREATE TABLE IF NOT EXISTS eva_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    eva_venture_id UUID REFERENCES eva_ventures(id) ON DELETE SET NULL,

    -- Action Details
    action_type TEXT NOT NULL,
    action_source TEXT NOT NULL DEFAULT 'system',
    action_data JSONB DEFAULT '{}',

    -- Actor
    actor_type TEXT DEFAULT 'system' CHECK (actor_type IN ('system', 'user', 'automation')),
    actor_id TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_eva_audit_venture ON eva_audit_log(eva_venture_id);
CREATE INDEX IF NOT EXISTS idx_eva_audit_action ON eva_audit_log(action_type);
CREATE INDEX IF NOT EXISTS idx_eva_audit_created ON eva_audit_log(created_at DESC);

-- ============================================================================
-- Function: Process EVA Event
-- Purpose: Handle incoming events and route to appropriate handlers
-- ============================================================================
CREATE OR REPLACE FUNCTION process_eva_event(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_event RECORD;
BEGIN
    SELECT * INTO v_event FROM eva_events WHERE id = p_event_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Mark as processed
    UPDATE eva_events
    SET processed = TRUE, processed_at = NOW()
    WHERE id = p_event_id;

    -- Log to audit
    INSERT INTO eva_audit_log (eva_venture_id, action_type, action_data)
    VALUES (v_event.eva_venture_id, 'event_processed', jsonb_build_object(
        'event_id', p_event_id,
        'event_type', v_event.event_type
    ));

    RETURN TRUE;
END;
$$;

-- ============================================================================
-- Function: Route EVA Decision
-- Purpose: Determine decision class based on stake level
-- ============================================================================
CREATE OR REPLACE FUNCTION route_eva_decision(p_stake_level TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
BEGIN
    CASE p_stake_level
        WHEN 'critical' THEN RETURN 'A';
        WHEN 'high' THEN RETURN 'B';
        WHEN 'medium' THEN RETURN 'B';
        WHEN 'low' THEN RETURN 'C';
        ELSE RETURN 'C';
    END CASE;
END;
$$;

-- ============================================================================
-- Function: Update Venture Health
-- Purpose: Recalculate venture health based on metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION update_eva_venture_health(p_venture_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_venture RECORD;
    v_new_health TEXT;
BEGIN
    SELECT * INTO v_venture FROM eva_ventures WHERE id = p_venture_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    -- Health calculation logic
    IF v_venture.runway_months < 3 OR v_venture.churn_rate > 10 THEN
        v_new_health := 'red';
    ELSIF v_venture.runway_months < 6 OR v_venture.mrr_growth_rate < 0 THEN
        v_new_health := 'yellow';
    ELSE
        v_new_health := 'green';
    END IF;

    -- Update if changed
    IF v_new_health != v_venture.health_status THEN
        UPDATE eva_ventures
        SET health_status = v_new_health, updated_at = NOW()
        WHERE id = p_venture_id;

        -- Create health change event
        INSERT INTO eva_events (eva_venture_id, event_type, event_data)
        VALUES (p_venture_id, 'health_change', jsonb_build_object(
            'old_health', v_venture.health_status,
            'new_health', v_new_health
        ));
    END IF;

    RETURN v_new_health;
END;
$$;

-- ============================================================================
-- RLS Policies
-- ============================================================================
ALTER TABLE eva_ventures ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE eva_audit_log ENABLE ROW LEVEL SECURITY;

-- Admin access for all EVA tables
CREATE POLICY eva_ventures_admin_access ON eva_ventures FOR ALL USING (TRUE);
CREATE POLICY eva_events_admin_access ON eva_events FOR ALL USING (TRUE);
CREATE POLICY eva_decisions_admin_access ON eva_decisions FOR ALL USING (TRUE);
CREATE POLICY eva_audit_log_admin_access ON eva_audit_log FOR ALL USING (TRUE);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE eva_ventures IS 'EVA Operating System - Venture tracking with health metrics';
COMMENT ON TABLE eva_events IS 'EVA Event Bus - All venture-related events';
COMMENT ON TABLE eva_decisions IS 'EVA Decision Router - Chairman decision tracking';
COMMENT ON TABLE eva_audit_log IS 'EVA Audit Trail - All actions logged';

COMMENT ON FUNCTION process_eva_event IS 'Process an EVA event and mark as handled';
COMMENT ON FUNCTION route_eva_decision IS 'Route decision to appropriate class based on stake';
COMMENT ON FUNCTION update_eva_venture_health IS 'Recalculate venture health status';
