-- Add vision document references, shared services, and dependencies to 001D grandchildren
-- This ensures all grandchildren properly reference ADR-002-VENTURE-FACTORY-ARCHITECTURE.md

-- SD-VISION-TRANSITION-001D1 (Stages 1-5: THE TRUTH)
UPDATE strategic_directives_v2
SET
  dependencies = '[]'::jsonb,
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{shared_services}',
      '{
        "crewai_crews": ["deep_research_crew", "finance_department_crew"],
        "crew_location": "/ehg/agent-platform/app/crews/",
        "api_access": "api.ehg.ventures/v1/agents/invoke",
        "ai_gateway": "OpenAI, Anthropic, Perplexity via llm_fallback.py"
      }'::jsonb
    ),
    '{vision_document}',
    '{
      "document": "ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "path": "docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "relevant_sections": [
        "2.2 Complete Stage Definitions - PHASE 1: THE TRUTH",
        "3.3 lifecycle_stage_config table",
        "3.4 venture_stage_work table (The Bridge)",
        "3.5 venture_artifacts table",
        "3.6 Kill Protocol (Decision Gates at 3, 5)",
        "4.1 Venture Lifecycle Engine"
      ],
      "key_concepts": [
        "Decision gates at stages 3 and 5 with ADVANCE/REVISE/KILL options",
        "Advisory system integration (advisory_enabled=true)",
        "Artifacts stored in venture_artifacts table",
        "Stage progression via venture_stage_work bridge table"
      ]
    }'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001D1';

-- SD-VISION-TRANSITION-001D2 (Stages 6-9: THE ENGINE)
UPDATE strategic_directives_v2
SET
  dependencies = '["SD-VISION-TRANSITION-001D1"]'::jsonb,
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{shared_services}',
      '{
        "crewai_crews": ["legal_department_crew", "finance_department_crew"],
        "crew_location": "/ehg/agent-platform/app/crews/",
        "api_access": "api.ehg.ventures/v1/agents/invoke",
        "ai_gateway": "OpenAI, Anthropic, Perplexity via llm_fallback.py"
      }'::jsonb
    ),
    '{vision_document}',
    '{
      "document": "ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "path": "docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "relevant_sections": [
        "2.2 Complete Stage Definitions - PHASE 2: THE ENGINE",
        "3.3 lifecycle_stage_config table",
        "3.5 venture_artifacts table",
        "0.9.2 Shared Services Inventory"
      ],
      "key_concepts": [
        "Risk matrix, pricing model, BMC, exit strategy artifacts",
        "No decision gates in this phase - continuous progression",
        "legal_department_crew for contracts and IP analysis",
        "finance_department_crew for valuation and burn rate"
      ]
    }'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001D2';

-- SD-VISION-TRANSITION-001D3 (Stages 10-12: THE IDENTITY)
UPDATE strategic_directives_v2
SET
  dependencies = '["SD-VISION-TRANSITION-001D2"]'::jsonb,
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{shared_services}',
      '{
        "crewai_crews": ["branding_crew", "advertising_crew", "marketing_department_crew"],
        "crew_location": "/ehg/agent-platform/app/crews/",
        "api_access": "api.ehg.ventures/v1/agents/invoke",
        "media_gen": "Midjourney, Sora, Runway (infrastructure ready)",
        "ai_gateway": "OpenAI, Anthropic, Perplexity via llm_fallback.py"
      }'::jsonb
    ),
    '{vision_document}',
    '{
      "document": "ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "path": "docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "relevant_sections": [
        "2.2 Complete Stage Definitions - PHASE 3: THE IDENTITY",
        "ADR-002-012 Chairman Override (Story before Name)",
        "3.5 venture_artifacts table",
        "0.9.2 Shared Services Inventory"
      ],
      "key_concepts": [
        "Chairman Override: Strategic narrative BEFORE naming (Stage 10→11)",
        "First sd_required stage - Leo Protocol integration begins",
        "branding_crew for positioning and identity",
        "marketing_department_crew for GTM strategy"
      ]
    }'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001D3';

-- SD-VISION-TRANSITION-001D4 (Stages 13-16: THE BLUEPRINT - Kochel Firewall)
UPDATE strategic_directives_v2
SET
  dependencies = '["SD-VISION-TRANSITION-001D3"]'::jsonb,
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{shared_services}',
      '{
        "crewai_crews": ["technical_crew", "product_management_crew"],
        "crew_location": "/ehg/agent-platform/app/crews/",
        "api_access": "api.ehg.ventures/v1/agents/invoke",
        "ai_gateway": "OpenAI, Anthropic, Perplexity via llm_fallback.py"
      }'::jsonb
    ),
    '{vision_document}',
    '{
      "document": "ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "path": "docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "relevant_sections": [
        "2.2 Complete Stage Definitions - PHASE 4: THE BLUEPRINT",
        "Kochel Firewall Philosophy (Stage 16)",
        "3.3 lifecycle_stage_config table",
        "3.4 venture_stage_work table",
        "3.6 Kill Protocol (Decision Gate at 16)"
      ],
      "key_concepts": [
        "Kochel Firewall: No code until schema is unambiguous",
        "Decision gates at stages 13 and 16",
        "Schema Completeness Checklist enforcement",
        "ERD/data model validation before BUILD phase"
      ]
    }'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001D4';

-- SD-VISION-TRANSITION-001D5 (Stages 17-20: THE BUILD LOOP)
UPDATE strategic_directives_v2
SET
  dependencies = '["SD-VISION-TRANSITION-001D4"]'::jsonb,
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{shared_services}',
      '{
        "crewai_crews": ["technical_crew"],
        "crew_location": "/ehg/agent-platform/app/crews/",
        "api_access": "api.ehg.ventures/v1/agents/invoke",
        "ai_gateway": "OpenAI, Anthropic, Perplexity via llm_fallback.py",
        "deployment_targets": ["Lovable", "Vercel", "Self-Hosted"]
      }'::jsonb
    ),
    '{vision_document}',
    '{
      "document": "ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "path": "docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "relevant_sections": [
        "2.2 Complete Stage Definitions - PHASE 5: THE BUILD LOOP",
        "0.4 Venture Lifecycle in Code vs Database",
        "0.9.4 Database Isolation Model",
        "0.9.5 Venture Deployment Model (Stage 17)",
        "4.1 Venture Lifecycle Engine"
      ],
      "key_concepts": [
        "All 4 stages are sd_required - full Leo Protocol integration",
        "Stage 17: Per-venture schema created (solara, oracle, finbot)",
        "Deployment target selection (Lovable/Vercel/Self-Host)",
        "Hybrid DB: Shared factory tables + per-venture schemas"
      ]
    }'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001D5';

-- SD-VISION-TRANSITION-001D6 (Stages 21-25: LAUNCH & LEARN)
UPDATE strategic_directives_v2
SET
  dependencies = '["SD-VISION-TRANSITION-001D5"]'::jsonb,
  metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{shared_services}',
      '{
        "crewai_crews": ["advertising_crew", "marketing_department_crew"],
        "crew_location": "/ehg/agent-platform/app/crews/",
        "api_access": "api.ehg.ventures/v1/agents/invoke",
        "ai_gateway": "OpenAI, Anthropic, Perplexity via llm_fallback.py",
        "billing": "Stripe integration (needs implementation)",
        "email": "Resend (referenced, not implemented)"
      }'::jsonb
    ),
    '{vision_document}',
    '{
      "document": "ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "path": "docs/architecture/ADR-002-VENTURE-FACTORY-ARCHITECTURE.md",
      "relevant_sections": [
        "2.2 Complete Stage Definitions - PHASE 6: LAUNCH & LEARN",
        "3.6 Kill Protocol (Final Decision Gate at 23)",
        "0.9.1 The Platform Model",
        "0.9.2 Shared Services Inventory"
      ],
      "key_concepts": [
        "Final decision gate at Stage 23 before production launch",
        "Kill Protocol available at Stage 23",
        "Growth Engine with advertising/marketing crews",
        "Continuous optimization loop (Stages 24-25)"
      ]
    }'::jsonb
  ),
  updated_at = NOW()
WHERE id = 'SD-VISION-TRANSITION-001D6';

-- Verification query
SELECT
  id,
  dependencies,
  metadata->'vision_document'->>'document' as vision_doc,
  jsonb_array_length(metadata->'vision_document'->'relevant_sections') as section_count,
  jsonb_array_length(metadata->'shared_services'->'crewai_crews') as crew_count
FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001D_'
ORDER BY id;
