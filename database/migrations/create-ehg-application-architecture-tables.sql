-- EHG Application Architecture Mapping Tables
-- Purpose: Enable Design sub-agent to make intelligent UI placement decisions
-- Created: 2025-10-03

-- Feature areas in the EHG application
CREATE TABLE IF NOT EXISTS ehg_feature_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- e.g., 'VENTURES', 'ANALYTICS', 'CHAIRMAN'
  name TEXT NOT NULL, -- e.g., 'Venture Management'
  description TEXT, -- Purpose and scope of this feature area
  parent_area_id UUID REFERENCES ehg_feature_areas(id), -- For nested areas
  navigation_path TEXT, -- e.g., '/ventures'
  primary_user_role TEXT, -- e.g., 'Chairman', 'Analyst', 'All'
  metadata JSONB DEFAULT '{}', -- Additional context
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Page routes and their purposes
CREATE TABLE IF NOT EXISTS ehg_page_routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT UNIQUE NOT NULL, -- e.g., '/ventures/:id'
  page_name TEXT NOT NULL, -- e.g., 'VentureDetailEnhanced'
  feature_area_id UUID REFERENCES ehg_feature_areas(id),
  purpose TEXT NOT NULL, -- What this page does
  user_workflow TEXT, -- Primary workflow this page supports
  component_file_path TEXT, -- e.g., 'src/pages/VenturesPage.tsx'
  layout_type TEXT, -- e.g., 'authenticated', 'public', 'modal'
  access_level TEXT, -- e.g., 'authenticated', 'admin', 'chairman'
  related_routes TEXT[], -- Related page routes
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reusable component patterns
CREATE TABLE IF NOT EXISTS ehg_component_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_name TEXT UNIQUE NOT NULL, -- e.g., 'Dashboard Card'
  pattern_type TEXT NOT NULL, -- e.g., 'layout', 'data-display', 'form', 'navigation'
  component_path TEXT, -- e.g., 'src/components/ui/card.tsx'
  description TEXT, -- When and how to use this pattern
  example_usage TEXT[], -- File paths where this is used well
  design_system_compliance BOOLEAN DEFAULT true,
  accessibility_notes TEXT,
  best_practices TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documented user workflows
CREATE TABLE IF NOT EXISTS ehg_user_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name TEXT UNIQUE NOT NULL, -- e.g., 'Create New Venture'
  workflow_code TEXT UNIQUE NOT NULL, -- e.g., 'VENTURE_CREATE'
  description TEXT,
  user_persona TEXT, -- e.g., 'Chairman', 'Analyst'
  entry_points TEXT[], -- Routes where this workflow can start
  workflow_steps JSONB, -- Ordered steps in the workflow
  exit_points TEXT[], -- Where workflow completes
  related_features TEXT[], -- Related feature area codes
  ui_components_involved TEXT[], -- Components used in this workflow
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Design decision history (for learning)
CREATE TABLE IF NOT EXISTS ehg_design_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_context TEXT NOT NULL, -- What was being designed
  options_considered JSONB, -- Alternative approaches considered
  chosen_solution TEXT NOT NULL, -- What was implemented
  rationale TEXT, -- Why this was chosen
  feature_area_id UUID REFERENCES ehg_feature_areas(id),
  route_id UUID REFERENCES ehg_page_routes(id),
  related_sd_key TEXT, -- Strategic directive that drove this
  outcome_notes TEXT, -- How well it worked
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feature_areas_code ON ehg_feature_areas(code);
CREATE INDEX IF NOT EXISTS idx_feature_areas_parent ON ehg_feature_areas(parent_area_id);
CREATE INDEX IF NOT EXISTS idx_page_routes_path ON ehg_page_routes(route_path);
CREATE INDEX IF NOT EXISTS idx_page_routes_feature ON ehg_page_routes(feature_area_id);
CREATE INDEX IF NOT EXISTS idx_component_patterns_type ON ehg_component_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_user_workflows_code ON ehg_user_workflows(workflow_code);
CREATE INDEX IF NOT EXISTS idx_design_decisions_feature ON ehg_design_decisions(feature_area_id);

-- RLS Policies (read-only for most agents)
ALTER TABLE ehg_feature_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ehg_page_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ehg_component_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ehg_user_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE ehg_design_decisions ENABLE ROW LEVEL SECURITY;

-- Allow read access to all (agents need this)
CREATE POLICY "Allow read access to feature areas" ON ehg_feature_areas FOR SELECT USING (true);
CREATE POLICY "Allow read access to page routes" ON ehg_page_routes FOR SELECT USING (true);
CREATE POLICY "Allow read access to component patterns" ON ehg_component_patterns FOR SELECT USING (true);
CREATE POLICY "Allow read access to user workflows" ON ehg_user_workflows FOR SELECT USING (true);
CREATE POLICY "Allow read access to design decisions" ON ehg_design_decisions FOR SELECT USING (true);

-- Allow authenticated users to insert design decisions
CREATE POLICY "Allow authenticated insert to design decisions" ON ehg_design_decisions FOR INSERT WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE ehg_feature_areas IS 'Major feature domains in the EHG application (Ventures, Analytics, etc.)';
COMMENT ON TABLE ehg_page_routes IS 'All page routes with their purposes and relationships';
COMMENT ON TABLE ehg_component_patterns IS 'Reusable UI patterns and components';
COMMENT ON TABLE ehg_user_workflows IS 'Documented user journeys through the application';
COMMENT ON TABLE ehg_design_decisions IS 'Historical design decisions for learning and consistency';
