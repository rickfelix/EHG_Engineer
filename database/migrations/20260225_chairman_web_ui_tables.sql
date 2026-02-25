-- Migration: Chairman Web UI Dashboard Tables and RPCs
-- SD: SD-LEO-FEAT-CHAIRMAN-WEB-UI-001
-- Date: 2026-02-25

-- ============================================================
-- 1. governance_decisions table
-- ============================================================
CREATE TABLE IF NOT EXISTS governance_decisions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  decision_type TEXT DEFAULT 'standard',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'parked')),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  venture_id UUID REFERENCES ventures(id),
  sd_id UUID,
  impact_level TEXT DEFAULT 'medium' CHECK (impact_level IN ('low', 'medium', 'high', 'critical')),
  rationale TEXT,
  risk_factors JSONB DEFAULT '[]'::jsonb,
  recommendation TEXT,
  stage INTEGER,
  venture_name TEXT,
  park_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE governance_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='governance_decisions' AND policyname='Allow authenticated read'
  ) THEN
    CREATE POLICY "Allow authenticated read" ON governance_decisions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='governance_decisions' AND policyname='Allow authenticated write'
  ) THEN
    CREATE POLICY "Allow authenticated write" ON governance_decisions FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 2. ehg_alerts table
-- ============================================================
CREATE TABLE IF NOT EXISTS ehg_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('risk', 'milestone', 'vision_drift', 'performance', 'governance', 'system')),
  severity TEXT DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title TEXT NOT NULL,
  message TEXT,
  entity_type TEXT,
  entity_id UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ehg_alerts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='ehg_alerts' AND policyname='Allow authenticated read'
  ) THEN
    CREATE POLICY "Allow authenticated read" ON ehg_alerts FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='ehg_alerts' AND policyname='Allow service insert'
  ) THEN
    CREATE POLICY "Allow service insert" ON ehg_alerts FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- 3. get_daily_briefing RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_daily_briefing()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending_decisions_count INTEGER;
  v_active_alerts JSONB;
  v_portfolio_summary JSONB;
  v_vision_health JSONB;
BEGIN
  -- Pending decisions count
  SELECT COUNT(*) INTO v_pending_decisions_count
  FROM governance_decisions
  WHERE status = 'pending';

  -- Active alerts (unresolved, top 10 by severity/date)
  SELECT COALESCE(jsonb_agg(a ORDER BY
    CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
    created_at DESC
  ), '[]'::jsonb)
  INTO v_active_alerts
  FROM (
    SELECT id, alert_type, severity, title, message, entity_type, entity_id, created_at
    FROM ehg_alerts
    WHERE resolved_at IS NULL
    ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
      created_at DESC
    LIMIT 10
  ) a;

  -- Portfolio summary by health_status
  SELECT COALESCE(jsonb_object_agg(health_status, cnt), '{}'::jsonb)
  INTO v_portfolio_summary
  FROM (
    SELECT COALESCE(health_status::text, 'unknown') as health_status, COUNT(*) as cnt
    FROM ventures
    GROUP BY health_status
  ) s;

  -- Vision health: avg score last 30 days
  SELECT jsonb_build_object(
    'average_score', ROUND(AVG(total_score)::numeric, 2),
    'sample_count', COUNT(*)
  )
  INTO v_vision_health
  FROM eva_vision_scores
  WHERE created_at >= NOW() - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'pending_decisions_count', v_pending_decisions_count,
    'active_alerts', v_active_alerts,
    'portfolio_summary', v_portfolio_summary,
    'vision_health', v_vision_health
  );
END;
$$;

-- ============================================================
-- 4. get_portfolio_summary RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_portfolio_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
  v_by_status JSONB;
  v_by_health JSONB;
  v_avg_health NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_total FROM ventures;

  SELECT COALESCE(jsonb_object_agg(s, cnt), '{}'::jsonb)
  INTO v_by_status
  FROM (
    SELECT COALESCE(workflow_status::text, 'unknown') as s, COUNT(*) as cnt
    FROM ventures GROUP BY workflow_status
  ) x;

  SELECT COALESCE(jsonb_object_agg(h, cnt), '{}'::jsonb)
  INTO v_by_health
  FROM (
    SELECT COALESCE(health_status::text, 'unknown') as h, COUNT(*) as cnt
    FROM ventures GROUP BY health_status
  ) x;

  SELECT ROUND(AVG(health_score)::numeric, 2) INTO v_avg_health FROM ventures;

  RETURN jsonb_build_object(
    'total_ventures', v_total,
    'ventures_by_status', v_by_status,
    'ventures_by_health', v_by_health,
    'average_health_score', v_avg_health
  );
END;
$$;

-- ============================================================
-- 5. get_okr_metrics RPC
-- ============================================================
CREATE OR REPLACE FUNCTION get_okr_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
  v_by_status JSONB;
  v_avg_progress NUMERIC;
  v_completed_this_month INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM strategic_directives_v2;

  SELECT COALESCE(jsonb_object_agg(s, cnt), '{}'::jsonb)
  INTO v_by_status
  FROM (
    SELECT COALESCE(status, 'unknown') as s, COUNT(*) as cnt
    FROM strategic_directives_v2 GROUP BY status
  ) x;

  SELECT ROUND(AVG(progress)::numeric, 2) INTO v_avg_progress
  FROM strategic_directives_v2
  WHERE status != 'completed';

  SELECT COUNT(*) INTO v_completed_this_month
  FROM strategic_directives_v2
  WHERE status = 'completed'
    AND completion_date >= date_trunc('month', NOW());

  RETURN jsonb_build_object(
    'total_sds', v_total,
    'sds_by_status', v_by_status,
    'average_progress', v_avg_progress,
    'completed_this_month', v_completed_this_month
  );
END;
$$;

-- ============================================================
-- Rollback (run if needed):
-- DROP FUNCTION IF EXISTS get_okr_metrics();
-- DROP FUNCTION IF EXISTS get_portfolio_summary();
-- DROP FUNCTION IF EXISTS get_daily_briefing();
-- DROP TABLE IF EXISTS ehg_alerts;
-- DROP TABLE IF EXISTS governance_decisions;
-- ============================================================
