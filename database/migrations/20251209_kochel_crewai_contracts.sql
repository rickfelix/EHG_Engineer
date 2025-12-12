-- Migration: Kochel Integration CrewAI Contracts
-- SD: SD-VISION-TRANSITION-001D (Kochel Integration)
-- Date: 2025-12-09
-- Purpose: Insert the 4 Kochel functional CrewAI contracts into leo_interfaces
--
-- Background:
-- The Kochel Integration defines 4 functional contracts for CrewAI sub-agents:
-- 1. journey-map-generator-v1 (Stage 2-3: User journey mapping)
-- 2. route-map-suggester-v1 (Stage 14-15: Technical routing)
-- 3. epic-planner-v1 (Stage 15: Epic and story breakdown)
-- 4. build-planner-v1 (Stage 17: Implementation planning)
--
-- Trigger Model: Hybrid
-- - LEAD/PLAN phases: Auto-trigger based on stage entry
-- - EXEC phase: Manual re-trigger available
--
-- ============================================================================
-- 1. Journey Map Generator Contract (Stage 2-3)
-- ============================================================================

INSERT INTO leo_interfaces (
  id,
  prd_id,
  name,
  kind,
  spec,
  version,
  validation_status,
  created_at
) VALUES (
  gen_random_uuid(),
  'KOCHEL-INTEGRATION',
  'journey-map-generator-v1',
  'jsonschema',
  '{
    "contract_id": "journey-map-generator-v1",
    "description": "Generates user journey maps from venture idea and validation data",
    "trigger_stages": [2, 3],
    "trigger_mode": "auto_lead_plan",
    "request_schema": {
      "type": "object",
      "required": ["venture_id", "idea_brief", "critique_report"],
      "properties": {
        "venture_id": {"type": "string", "format": "uuid"},
        "idea_brief": {"type": "object"},
        "critique_report": {"type": "object"},
        "persona_hints": {"type": "array", "items": {"type": "string"}}
      }
    },
    "response_schema": {
      "type": "object",
      "required": ["journey_map", "personas", "friction_points"],
      "properties": {
        "journey_map": {
          "type": "object",
          "properties": {
            "stages": {"type": "array"},
            "touchpoints": {"type": "array"},
            "emotions": {"type": "object"}
          }
        },
        "personas": {"type": "array"},
        "friction_points": {"type": "array"},
        "opportunities": {"type": "array"}
      }
    },
    "error_handling": {
      "timeout_ms": 60000,
      "retry_count": 3,
      "failure_action": "notify_chairman"
    },
    "output_artifact": "user_journey_map"
  }'::JSONB,
  '1.0.0',
  'valid',
  NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. Route Map Suggester Contract (Stage 14-15)
-- ============================================================================

INSERT INTO leo_interfaces (
  id,
  prd_id,
  name,
  kind,
  spec,
  version,
  validation_status,
  created_at
) VALUES (
  gen_random_uuid(),
  'KOCHEL-INTEGRATION',
  'route-map-suggester-v1',
  'jsonschema',
  '{
    "contract_id": "route-map-suggester-v1",
    "description": "Suggests technical routing structure based on data model and user journeys",
    "trigger_stages": [14, 15],
    "trigger_mode": "auto_lead_plan",
    "request_schema": {
      "type": "object",
      "required": ["venture_id", "data_model", "user_journey_map"],
      "properties": {
        "venture_id": {"type": "string", "format": "uuid"},
        "data_model": {"type": "object"},
        "user_journey_map": {"type": "object"},
        "tech_stack_decision": {"type": "object"},
        "framework_hints": {"type": "string", "enum": ["nextjs", "react-router", "custom"]}
      }
    },
    "response_schema": {
      "type": "object",
      "required": ["routes", "navigation_structure", "api_endpoints"],
      "properties": {
        "routes": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "path": {"type": "string"},
              "component": {"type": "string"},
              "data_dependencies": {"type": "array"},
              "auth_required": {"type": "boolean"}
            }
          }
        },
        "navigation_structure": {"type": "object"},
        "api_endpoints": {"type": "array"},
        "middleware_suggestions": {"type": "array"}
      }
    },
    "error_handling": {
      "timeout_ms": 90000,
      "retry_count": 2,
      "failure_action": "notify_chairman"
    },
    "output_artifact": "route_map"
  }'::JSONB,
  '1.0.0',
  'valid',
  NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. Epic Planner Contract (Stage 15)
-- ============================================================================

INSERT INTO leo_interfaces (
  id,
  prd_id,
  name,
  kind,
  spec,
  version,
  validation_status,
  created_at
) VALUES (
  gen_random_uuid(),
  'KOCHEL-INTEGRATION',
  'epic-planner-v1',
  'jsonschema',
  '{
    "contract_id": "epic-planner-v1",
    "description": "Decomposes venture requirements into epics and user stories with acceptance criteria",
    "trigger_stages": [15],
    "trigger_mode": "auto_lead_plan",
    "request_schema": {
      "type": "object",
      "required": ["venture_id", "route_map", "user_journey_map", "business_model_canvas"],
      "properties": {
        "venture_id": {"type": "string", "format": "uuid"},
        "route_map": {"type": "object"},
        "user_journey_map": {"type": "object"},
        "business_model_canvas": {"type": "object"},
        "priority_hints": {"type": "array", "items": {"type": "string"}}
      }
    },
    "response_schema": {
      "type": "object",
      "required": ["epics", "dependency_graph"],
      "properties": {
        "epics": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["epic_id", "title", "stories"],
            "properties": {
              "epic_id": {"type": "string"},
              "title": {"type": "string"},
              "description": {"type": "string"},
              "priority": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
              "stories": {
                "type": "array",
                "items": {
                  "type": "object",
                  "required": ["story_id", "title", "acceptance_criteria"],
                  "properties": {
                    "story_id": {"type": "string"},
                    "title": {"type": "string"},
                    "as_a": {"type": "string"},
                    "i_want": {"type": "string"},
                    "so_that": {"type": "string"},
                    "acceptance_criteria": {"type": "array", "items": {"type": "string"}},
                    "story_points": {"type": "integer"}
                  }
                }
              }
            }
          }
        },
        "dependency_graph": {"type": "object"},
        "mvp_scope": {"type": "array", "items": {"type": "string"}}
      }
    },
    "error_handling": {
      "timeout_ms": 120000,
      "retry_count": 2,
      "failure_action": "notify_chairman"
    },
    "output_artifact": "user_story_pack"
  }'::JSONB,
  '1.0.0',
  'valid',
  NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. Build Planner Contract (Stage 17)
-- ============================================================================

INSERT INTO leo_interfaces (
  id,
  prd_id,
  name,
  kind,
  spec,
  version,
  validation_status,
  created_at
) VALUES (
  gen_random_uuid(),
  'KOCHEL-INTEGRATION',
  'build-planner-v1',
  'jsonschema',
  '{
    "contract_id": "build-planner-v1",
    "description": "Creates implementation plan with SD breakdown and environment configuration",
    "trigger_stages": [17],
    "trigger_mode": "auto_lead_plan",
    "request_schema": {
      "type": "object",
      "required": ["venture_id", "user_story_pack", "api_contract", "tech_stack_decision"],
      "properties": {
        "venture_id": {"type": "string", "format": "uuid"},
        "user_story_pack": {"type": "object"},
        "api_contract": {"type": "object"},
        "tech_stack_decision": {"type": "object"},
        "deployment_target": {"type": "string", "enum": ["vercel", "aws", "gcp", "self-hosted"]}
      }
    },
    "response_schema": {
      "type": "object",
      "required": ["implementation_plan", "sd_breakdown", "environment_config"],
      "properties": {
        "implementation_plan": {
          "type": "object",
          "properties": {
            "phases": {"type": "array"},
            "milestones": {"type": "array"},
            "critical_path": {"type": "array"}
          }
        },
        "sd_breakdown": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "sd_id_template": {"type": "string"},
              "title": {"type": "string"},
              "category": {"type": "string"},
              "priority": {"type": "string"},
              "dependencies": {"type": "array"}
            }
          }
        },
        "environment_config": {
          "type": "object",
          "properties": {
            "env_vars": {"type": "array"},
            "secrets": {"type": "array"},
            "infrastructure": {"type": "object"}
          }
        },
        "cicd_config": {"type": "object"},
        "system_prompt_template": {"type": "object"}
      }
    },
    "error_handling": {
      "timeout_ms": 180000,
      "retry_count": 2,
      "failure_action": "notify_chairman"
    },
    "output_artifacts": ["system_prompt", "cicd_config", "environment_config"]
  }'::JSONB,
  '1.0.0',
  'valid',
  NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. Create index for Kochel contracts lookup
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leo_interfaces_prd_name
ON leo_interfaces(prd_id, name);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After migration, verify with:
--
-- Check all 4 contracts exist:
-- SELECT name, version, validation_status FROM leo_interfaces WHERE prd_id = 'KOCHEL-INTEGRATION';
-- Expected: 4 rows
--
-- Check contract spec structure:
-- SELECT name, spec->'trigger_stages' AS stages FROM leo_interfaces WHERE prd_id = 'KOCHEL-INTEGRATION';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To reverse this migration:
-- DELETE FROM leo_interfaces WHERE prd_id = 'KOCHEL-INTEGRATION';
-- DROP INDEX IF EXISTS idx_leo_interfaces_prd_name;
