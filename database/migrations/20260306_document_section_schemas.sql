-- Document Section Schemas
-- SD-LEO-INFRA-DATABASE-FIRST-VISION-001
--
-- Registry of required/optional sections per document type.
-- Drives validation and rendering for vision and architecture_plan documents.
--
-- NOTE: This migration was already applied to production on 2026-03-06.
-- This file is kept for reference and future environment setup.

-- ═══════════════════════════════════════════════════════════════
-- 1. Create document_section_schemas table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_section_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL CHECK (document_type IN ('vision', 'architecture_plan')),
  domain TEXT, -- optional domain-specific override (NULL = universal)
  section_key TEXT NOT NULL,
  section_name TEXT NOT NULL,
  description TEXT,
  section_order INTEGER NOT NULL,
  is_required BOOLEAN NOT NULL DEFAULT true,
  min_content_length INTEGER DEFAULT 0,
  json_schema JSONB, -- optional JSON schema for structured sections
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_type, domain, section_key)
);

-- ═══════════════════════════════════════════════════════════════
-- 2. Seed vision sections (10 required sections)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO document_section_schemas (document_type, section_key, section_name, description, section_order, is_required, min_content_length)
VALUES
  ('vision', 'executive_summary',       'Executive Summary',       'High-level synthesis of the vision core thesis', 1, true, 100),
  ('vision', 'problem_statement',       'Problem Statement',       'What problem this addresses, who is affected, current impact', 2, true, 100),
  ('vision', 'personas',                'Personas',                'For each persona: name, goals, mindset, key activities', 3, true, 50),
  ('vision', 'information_architecture','Information Architecture','Views, routes, data sources, navigation structure', 4, true, 50),
  ('vision', 'key_decision_points',     'Key Decision Points',     'Critical decision/intervention points', 5, true, 50),
  ('vision', 'integration_patterns',    'Integration Patterns',    'How this connects to existing systems', 6, true, 50),
  ('vision', 'evolution_plan',          'Evolution Plan',          'Phasing strategy: what ships first, what comes later', 7, true, 50),
  ('vision', 'out_of_scope',           'Out of Scope',            'Explicit boundaries — what this is NOT', 8, true, 30),
  ('vision', 'ui_ux_wireframes',       'UI/UX Wireframes',        'ASCII mockups for key views or N/A for backend', 9, true, 20),
  ('vision', 'success_criteria',       'Success Criteria',        'Measurable outcomes', 10, true, 50)
ON CONFLICT (document_type, domain, section_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 3. Seed architecture_plan sections (8 required sections)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO document_section_schemas (document_type, section_key, section_name, description, section_order, is_required, min_content_length)
VALUES
  ('architecture_plan', 'stack_and_repository',        'Stack & Repository Decisions',  'Technology choices, repo structure', 1, true, 50),
  ('architecture_plan', 'legacy_deprecation',          'Legacy Deprecation Plan',       'What existing systems this replaces/modifies', 2, true, 30),
  ('architecture_plan', 'route_and_component_structure','Route & Component Structure',  'Routes, components, module organization', 3, true, 50),
  ('architecture_plan', 'data_layer',                  'Data Layer',                    'Supabase tables, queries, mutations, RLS', 4, true, 50),
  ('architecture_plan', 'api_surface',                 'API Surface',                   'RPC functions, REST endpoints, governance', 5, true, 30),
  ('architecture_plan', 'implementation_phases',       'Implementation Phases',         'Phase 1/2/3 with deliverables', 6, true, 50),
  ('architecture_plan', 'testing_strategy',            'Testing Strategy',              'Unit, integration, E2E approach', 7, true, 30),
  ('architecture_plan', 'risk_mitigation',             'Risk Mitigation',               'Technical risks with mitigation strategies', 8, true, 30)
ON CONFLICT (document_type, domain, section_key) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. Add sections JSONB columns to existing tables
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE eva_vision_documents
  ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '{}'::jsonb;

ALTER TABLE eva_architecture_plans
  ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '{}'::jsonb;

-- ═══════════════════════════════════════════════════════════════
-- 5. Add updated_at trigger
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_document_section_schemas_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_document_section_schemas_updated_at ON document_section_schemas;
CREATE TRIGGER set_document_section_schemas_updated_at
  BEFORE UPDATE ON document_section_schemas
  FOR EACH ROW
  EXECUTE FUNCTION update_document_section_schemas_timestamp();
