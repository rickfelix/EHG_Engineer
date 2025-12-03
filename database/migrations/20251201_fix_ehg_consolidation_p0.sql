-- Migration: Fix EHG Database Consolidation - P0 Critical Tables
-- Issue: SD-ARCH-EHG-006 consolidation missed EHG app-specific tables
-- Database: dedlbzhpgkmetvhbkyzq (Consolidated Database)
-- Date: 2025-12-01
-- Priority: P0 - Critical (Navigation and Settings broken)

-- ==============================================
-- P0 FIX 1: Create nav_preferences table
-- Required by: navigationService.ts
-- ==============================================

CREATE TABLE IF NOT EXISTS public.nav_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  default_maturity TEXT NOT NULL DEFAULT 'complete' CHECK (default_maturity IN ('draft', 'development', 'complete')),
  show_draft BOOLEAN NOT NULL DEFAULT false,
  show_development BOOLEAN NOT NULL DEFAULT false,
  show_complete BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_nav_preferences_user_id ON public.nav_preferences(user_id);

ALTER TABLE public.nav_preferences ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "nav_preferences_own" ON public.nav_preferences;

CREATE POLICY "nav_preferences_own"
  ON public.nav_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ==============================================
-- P0 FIX 2: Create profiles table
-- Required by: Settings, UserProfileSettings
-- ==============================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    phone TEXT,
    location TEXT,
    bio TEXT,
    avatar_url TEXT,
    timezone TEXT DEFAULT 'America/Los_Angeles',
    language TEXT DEFAULT 'en-US',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- ==============================================
-- P0 FIX 3: Create user_preferences table
-- Required by: Settings, NotificationSettings, SecuritySettings
-- ==============================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),
    notifications_email BOOLEAN DEFAULT TRUE,
    notifications_push BOOLEAN DEFAULT TRUE,
    notifications_sms BOOLEAN DEFAULT FALSE,
    notif_email_ventures BOOLEAN DEFAULT TRUE,
    notif_email_analytics BOOLEAN DEFAULT TRUE,
    notif_email_workflows BOOLEAN DEFAULT TRUE,
    notif_email_security BOOLEAN DEFAULT TRUE,
    notif_email_marketing BOOLEAN DEFAULT FALSE,
    notif_push_ventures BOOLEAN DEFAULT TRUE,
    notif_push_analytics BOOLEAN DEFAULT FALSE,
    notif_push_workflows BOOLEAN DEFAULT TRUE,
    notif_push_security BOOLEAN DEFAULT TRUE,
    notif_sms_urgent BOOLEAN DEFAULT FALSE,
    notif_sms_security BOOLEAN DEFAULT FALSE,
    notif_frequency TEXT DEFAULT 'realtime' CHECK (notif_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
    notif_quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    notif_quiet_hours_start TEXT DEFAULT '22:00',
    notif_quiet_hours_end TEXT DEFAULT '08:00',
    privacy_profile_visible BOOLEAN DEFAULT TRUE,
    privacy_activity_visible BOOLEAN DEFAULT FALSE,
    privacy_email_visible BOOLEAN DEFAULT FALSE,
    security_two_factor BOOLEAN DEFAULT FALSE,
    security_session_timeout INTEGER DEFAULT 60,
    security_login_notifications BOOLEAN DEFAULT TRUE,
    security_device_tracking BOOLEAN DEFAULT TRUE,
    security_suspicious_alerts BOOLEAN DEFAULT TRUE,
    security_password_expiry INTEGER DEFAULT 90,
    security_require_password_change BOOLEAN DEFAULT FALSE,
    security_biometric BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can insert own preferences" ON public.user_preferences;

CREATE POLICY "Users can view own preferences"
    ON public.user_preferences FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own preferences"
    ON public.user_preferences FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own preferences"
    ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = id);

-- ==============================================
-- P0 FIX 4: Ensure nav_routes table exists and has correct structure
-- ==============================================

CREATE TABLE IF NOT EXISTS public.nav_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  section TEXT NOT NULL,
  venture_stage INTEGER,
  maturity TEXT NOT NULL DEFAULT 'complete' CHECK (maturity IN ('draft', 'development', 'complete')),
  icon_key TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  badge_key TEXT,
  static_badge TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nav_routes_section ON public.nav_routes(section);
CREATE INDEX IF NOT EXISTS idx_nav_routes_maturity ON public.nav_routes(maturity);
CREATE INDEX IF NOT EXISTS idx_nav_routes_sort_index ON public.nav_routes(section, sort_index);

ALTER TABLE public.nav_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nav_routes_select" ON public.nav_routes;

CREATE POLICY "nav_routes_select"
  ON public.nav_routes FOR SELECT TO authenticated USING (true);

-- ==============================================
-- P0 FIX 5: Create updated_at trigger function
-- ==============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_nav_routes_updated_at ON public.nav_routes;
CREATE TRIGGER update_nav_routes_updated_at
  BEFORE UPDATE ON public.nav_routes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_nav_preferences_updated_at ON public.nav_preferences;
CREATE TRIGGER update_nav_preferences_updated_at
  BEFORE UPDATE ON public.nav_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ==============================================
-- P0 FIX 6: Auto-create profile/preferences on user signup
-- ==============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_preferences (id, created_at, updated_at)
    VALUES (NEW.id, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- ==============================================
-- SEED DATA: 67 Navigation Routes
-- ==============================================

-- Clear existing routes to avoid duplicates
TRUNCATE public.nav_routes CASCADE;

-- Section 1: Core Platform (5 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/chairman', 'Executive Dashboard', 'CEO-level strategic overview', 'core', 'complete', 'LayoutDashboard', 101, NULL, NULL),
('/ventures', 'Ventures Portfolio', 'All venture opportunities', 'core', 'complete', 'LayoutDashboard', 102, 'ventures', NULL),
('/feature-catalog', 'Feature Catalog', 'Browse all platform features', 'core', 'complete', 'LayoutDashboard', 103, NULL, 'New'),
('/settings', 'Settings & Preferences', 'User configuration', 'core', 'complete', 'Settings', 104, NULL, NULL),
('/notifications', 'Notifications', 'System alerts and updates', 'core', 'complete', 'Bell', 105, 'notifications', NULL);

-- Section 2: AI & Automation (9 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/ai-ceo', 'AI CEO Agent', 'Autonomous strategic assistant', 'ai-automation', 'complete', 'Brain', 201, NULL, 'New'),
('/business-agents', 'Business Agents', 'AI-powered business automation', 'ai-automation', 'complete', 'Bot', 202, NULL, NULL),
('/ai-agents', 'AI Agents Management', 'Configure AI agents', 'ai-automation', 'complete', 'Bot', 203, NULL, NULL),
('/chairman-analytics', 'Decision Analytics', 'AI learning & threshold calibration', 'ai-automation', 'complete', 'BarChart3', 204, NULL, 'New'),
('/eva-assistant', 'EVA Assistant', 'Executive virtual assistant', 'ai-automation', 'complete', 'Sparkles', 205, NULL, NULL),
('/eva-analytics', 'EVA Analytics', 'EVA performance metrics', 'ai-automation', 'complete', 'BarChart3', 206, NULL, NULL),
('/eva-orchestration', 'EVA Orchestration', 'Multi-agent coordination', 'ai-automation', 'complete', 'GitCompare', 207, NULL, NULL),
('/workflows', 'Workflow Automation', 'Automated business processes', 'ai-automation', 'complete', 'Workflow', 208, 'activeWorkflows', NULL),
('/automation-dashboard', 'Automation Dashboard', 'Automation health monitoring', 'ai-automation', 'complete', 'Monitor', 209, NULL, NULL);

-- Section 3: Analytics & Insights (11 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/analytics', 'Analytics Dashboard', 'Platform-wide analytics', 'analytics-insights', 'complete', 'TrendingUp', 301, NULL, NULL),
('/real-time-analytics', 'Real-Time Analytics', 'Live performance tracking', 'analytics-insights', 'complete', 'Activity', 302, NULL, NULL),
('/competitive-intelligence', 'Competitive Intelligence', 'Market and competitor analysis', 'analytics-insights', 'complete', 'TrendingUp', 303, NULL, 'New'),
('/gap-analysis', 'Gap Analysis', 'Capability gap identification', 'analytics-insights', 'complete', 'TrendingDown', 304, NULL, 'New'),
('/stage-analysis', 'Stage Analysis', 'Venture stage progression', 'analytics-insights', 'complete', 'LineChart', 305, NULL, NULL),
('/risk-forecasting', 'Risk Forecasting', 'Predictive risk analysis', 'analytics-insights', 'complete', 'TrendingDown', 306, NULL, NULL),
('/profitability', 'Profitability Analysis', 'Financial performance metrics', 'analytics-insights', 'complete', 'PieChart', 307, NULL, NULL),
('/live-performance', 'Live Performance', 'Real-time KPI dashboard', 'analytics-insights', 'complete', 'Activity', 308, NULL, NULL),
('/insights', 'Insights & Reports', 'Executive insights', 'analytics-insights', 'complete', 'FileText', 309, NULL, NULL),
('/report-builder', 'Report Builder', 'Custom report creation', 'analytics-insights', 'complete', 'FileCode', 310, NULL, NULL),
('/reports', 'Report History', 'Historical reports archive', 'analytics-insights', 'complete', 'FolderOpen', 311, NULL, NULL);

-- Section 4: Strategy & Execution (7 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/gtm-strategist', 'GTM Strategist', 'Go-to-market planning', 'strategy-execution', 'complete', 'Target', 401, NULL, 'New'),
('/gtm-dashboard', 'GTM Dashboard', 'GTM execution tracking', 'strategy-execution', 'complete', 'BarChart3', 402, NULL, NULL),
('/gtm-timing', 'GTM Timing', 'Market timing optimization', 'strategy-execution', 'complete', 'Calendar', 403, NULL, NULL),
('/timing-optimization', 'Timing Optimization', 'Strategic timing tools', 'strategy-execution', 'complete', 'Calendar', 404, NULL, NULL),
('/opportunity-sourcing', 'Opportunity Sourcing', 'Deal flow generation', 'strategy-execution', 'complete', 'Target', 405, NULL, NULL),
('/execution', 'Execution Dashboard', 'Implementation tracking', 'strategy-execution', 'complete', 'Rocket', 406, NULL, NULL),
('/live-workflow-progress', 'Live Workflow Progress', 'Real-time workflow status', 'strategy-execution', 'complete', 'Activity', 407, NULL, NULL);

-- Section 5: Quality & Testing (8 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/quality-assurance', 'Quality Assurance', 'QA dashboard and metrics', 'quality-testing', 'complete', 'CheckCircle', 501, NULL, 'New'),
('/testing-automation', 'Testing Automation', 'Automated test execution', 'quality-testing', 'complete', 'TestTube', 502, NULL, NULL),
('/testing-qa', 'Testing QA', 'Manual QA workflows', 'quality-testing', 'complete', 'CheckCircle', 503, NULL, NULL),
('/phase2-testing', 'Phase 2 Testing', 'Phase 2 test suite', 'quality-testing', 'complete', 'TestTube', 504, NULL, NULL),
('/phase2-testing-dashboard', 'Phase 2 Test Dashboard', 'Phase 2 test metrics', 'quality-testing', 'complete', 'BarChart3', 505, NULL, NULL),
('/phase2-test-execution', 'Test Execution', 'Run test suites', 'quality-testing', 'complete', 'TestTube', 506, NULL, NULL),
('/validation', 'Validation', 'Data and process validation', 'quality-testing', 'complete', 'CheckCircle', 507, NULL, NULL),
('/pre-flight-check', 'Pre-Flight Checks', 'Launch readiness validation', 'quality-testing', 'complete', 'Rocket', 508, NULL, NULL);

-- Section 6: Development & Operations (7 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/development-workflow', 'Development Workflow', 'Dev process management', 'development-operations', 'complete', 'Code', 601, NULL, NULL),
('/iterative-development', 'Iterative Development', 'Agile iteration tracking', 'development-operations', 'complete', 'GitCompare', 602, NULL, NULL),
('/parallel-exploration', 'Parallel Exploration', 'Concurrent development streams', 'development-operations', 'complete', 'GitCompare', 603, NULL, NULL),
('/mvp-engine', 'MVP Engine', 'MVP creation tools', 'development-operations', 'complete', 'Rocket', 604, NULL, NULL),
('/mvp-launch', 'MVP Launch', 'MVP deployment dashboard', 'development-operations', 'complete', 'Rocket', 605, NULL, NULL),
('/integration-status', 'Integration Status', 'System integration health', 'development-operations', 'complete', 'Globe', 606, 'connectedIntegrations', NULL),
('/orchestration', 'Orchestration', 'System orchestration', 'development-operations', 'complete', 'Boxes', 607, NULL, NULL);

-- Section 7: Security & Governance (9 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/security-monitoring', 'Security Monitoring', 'Security dashboard', 'security-governance', 'complete', 'Shield', 701, NULL, NULL),
('/comprehensive-security', 'Comprehensive Security', 'Full security suite', 'security-governance', 'complete', 'Shield', 702, NULL, NULL),
('/access-review', 'Access Review', 'Access control audit', 'security-governance', 'complete', 'Lock', 703, NULL, NULL),
('/authentication-management', 'Authentication Management', 'Auth configuration', 'security-governance', 'complete', 'Lock', 704, NULL, NULL),
('/governance', 'Governance Overview', 'Governance dashboard', 'security-governance', 'complete', 'Building', 705, NULL, NULL),
('/governance-overview', 'Governance Details', 'Detailed governance', 'security-governance', 'complete', 'Building', 706, NULL, NULL),
('/data-governance', 'Data Governance', 'Data policy management', 'security-governance', 'complete', 'Database', 707, NULL, NULL),
('/eva-compliance', 'EVA Compliance', 'EVA compliance tracking', 'security-governance', 'complete', 'CheckCircle', 708, NULL, NULL),
('/incidents-test', 'Incidents Tracking', 'Security incident management', 'security-governance', 'complete', 'Shield', 709, NULL, NULL);

-- Section 8: Knowledge & Data (6 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/knowledge-management', 'Knowledge Management', 'Knowledge base', 'knowledge-data', 'complete', 'Database', 801, NULL, NULL),
('/data-management-kb', 'Data Management KB', 'Data management docs', 'knowledge-data', 'complete', 'BookOpen', 802, NULL, NULL),
('/data-lifecycle', 'Data Lifecycle', 'Data lifecycle management', 'knowledge-data', 'complete', 'Database', 803, NULL, NULL),
('/ai-docs-admin', 'AI Documentation Admin', 'AI documentation system', 'knowledge-data', 'complete', 'FileText', 804, NULL, NULL),
('/creative-media-automation', 'Creative Media Automation', 'Content generation', 'knowledge-data', 'complete', 'Sparkles', 805, NULL, NULL),
('/creative-media', 'Creative Media Page', 'Media asset management', 'knowledge-data', 'complete', 'Megaphone', 806, NULL, 'New');

-- Section 9: Collaboration & Feedback (3 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/feedback-loops', 'Feedback Loops', 'User feedback system', 'collaboration-feedback', 'complete', 'MessageSquare', 901, NULL, 'New'),
('/team', 'Team Management', 'Team coordination', 'collaboration-feedback', 'complete', 'Users', 902, NULL, NULL),
('/mobile-companion-app', 'Mobile Companion', 'Mobile app access', 'collaboration-feedback', 'complete', 'Monitor', 903, NULL, NULL);

-- Section 10: Portfolio Management (4 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/portfolios', 'Portfolios', 'Portfolio overview', 'portfolio-management', 'complete', 'Briefcase', 1001, NULL, NULL),
('/company-settings', 'Companies', 'Company management', 'portfolio-management', 'complete', 'Building', 1002, NULL, NULL),
('/venture-detail', 'Venture Detail', 'Individual venture view', 'portfolio-management', 'complete', 'Briefcase', 1003, NULL, NULL),
('/venture-detail-enhanced', 'Venture Enhanced', 'Enhanced venture analytics', 'portfolio-management', 'complete', 'BarChart3', 1004, NULL, NULL);

-- Section 11: Operations (6 routes)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/operations', 'Unified Dashboard', 'Enterprise operations center', 'operations', 'complete', 'Activity', 1101, NULL, 'New'),
('/monitoring', 'System Monitoring', 'System health & alerts', 'operations', 'complete', 'Monitor', 1102, 'activeAlerts', NULL),
('/performance', 'Performance Metrics', 'Performance analytics', 'operations', 'complete', 'LineChart', 1103, NULL, NULL),
('/security', 'Security Overview', 'Security monitoring', 'operations', 'complete', 'Shield', 1104, NULL, NULL),
('/data-management', 'Data Management', 'Data lifecycle & quality', 'operations', 'complete', 'Database', 1105, NULL, NULL),
('/operations/command-center', 'Command Center', 'War room operations view', 'operations', 'complete', 'Zap', 1106, NULL, 'New');

-- Venture Creation Route (for Stage 1 Entry)
INSERT INTO public.nav_routes (path, title, description, section, maturity, icon_key, sort_index, badge_key, static_badge) VALUES
('/ventures/new', 'Create Venture', 'Start a new venture', 'core', 'complete', 'Plus', 106, NULL, NULL)
ON CONFLICT (path) DO NOTHING;

-- ==============================================
-- VERIFICATION
-- ==============================================
-- Expected: 68 routes (67 + ventures/new)
-- SELECT COUNT(*) FROM public.nav_routes;

-- Check P0 tables exist
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('nav_routes', 'nav_preferences', 'profiles', 'user_preferences');
