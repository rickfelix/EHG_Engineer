-- Add codebase assessment phase requirement to all 6 grandchildren of 001D
-- Ensures each grandchild inventories existing implementation before creating new work

-- D1: Stages 1-5 (THE TRUTH)
UPDATE strategic_directives_v2
SET
  scope = 'ASSESSMENT PHASE REQUIRED: Before defining stages 1-5 in lifecycle_stage_config, conduct codebase inventory:
1. UI Components: Search for existing React components related to stages 1-5
2. Database: Identify existing tables, columns, or data structures for these stages
3. APIs: Find existing endpoints, services, or business logic
4. Workflows: Locate existing stage transition logic or state machines
5. Reusability Analysis: Document what can be preserved vs what needs creation

IMPLEMENTATION PHASE: Define stages 1-5 with gates, inputs, outputs, metrics, substages per ADR-002. Reuse existing implementations where possible.',

  strategic_objectives = jsonb_set(
    COALESCE(strategic_objectives, '[]'::jsonb),
    '{0}',
    '"ASSESS: Inventory existing codebase for stages 1-5 (UI, DB, APIs, workflows)"'::jsonb,
    true
  )
WHERE id = 'SD-VISION-TRANSITION-001D1';

-- D2: Stages 6-9 (THE ENGINE)
UPDATE strategic_directives_v2
SET
  scope = 'ASSESSMENT PHASE REQUIRED: Before defining stages 6-9 in lifecycle_stage_config, conduct codebase inventory:
1. UI Components: Search for existing React components related to stages 6-9
2. Database: Identify existing tables, columns, or data structures for these stages
3. APIs: Find existing endpoints, services, or business logic
4. Workflows: Locate existing stage transition logic or state machines
5. Reusability Analysis: Document what can be preserved vs what needs creation

IMPLEMENTATION PHASE: Define stages 6-9 with gates, inputs, outputs, metrics per ADR-002. Reuse existing implementations where possible.',

  strategic_objectives = jsonb_set(
    COALESCE(strategic_objectives, '[]'::jsonb),
    '{0}',
    '"ASSESS: Inventory existing codebase for stages 6-9 (UI, DB, APIs, workflows)"'::jsonb,
    true
  )
WHERE id = 'SD-VISION-TRANSITION-001D2';

-- D3: Stages 10-12 (THE IDENTITY)
UPDATE strategic_directives_v2
SET
  scope = 'ASSESSMENT PHASE REQUIRED: Before defining stages 10-12 in lifecycle_stage_config, conduct codebase inventory:
1. UI Components: Search for existing React components related to stages 10-12
2. Database: Identify existing tables, columns, or data structures for these stages
3. APIs: Find existing endpoints, services, or business logic
4. Workflows: Locate existing stage transition logic or state machines
5. Reusability Analysis: Document what can be preserved vs what needs creation

IMPLEMENTATION PHASE: Define stages 10-12 with strategic_narrative artifact requirement. Stage 10 must produce narrative BEFORE Stage 11 naming (Chairman override). Reuse existing implementations where possible.',

  strategic_objectives = jsonb_set(
    COALESCE(strategic_objectives, '[]'::jsonb),
    '{0}',
    '"ASSESS: Inventory existing codebase for stages 10-12 (UI, DB, APIs, workflows)"'::jsonb,
    true
  )
WHERE id = 'SD-VISION-TRANSITION-001D3';

-- D4: Stages 13-16 (THE BLUEPRINT - Kochel Firewall)
UPDATE strategic_directives_v2
SET
  scope = 'ASSESSMENT PHASE REQUIRED: Before defining stages 13-16 in lifecycle_stage_config, conduct codebase inventory:
1. UI Components: Search for existing React components related to stages 13-16
2. Database: Identify existing tables, columns, or data structures for these stages
3. APIs: Find existing endpoints, services, or business logic
4. Workflows: Locate existing stage transition logic or state machines
5. Reusability Analysis: Document what can be preserved vs what needs creation

IMPLEMENTATION PHASE: Define stages 13-16 with Schema Completeness Checklist at Stage 16 (Decision Gate). This is the "Kochel Firewall" that prevents ambiguous specs from reaching code. Reuse existing implementations where possible.',

  strategic_objectives = jsonb_set(
    COALESCE(strategic_objectives, '[]'::jsonb),
    '{0}',
    '"ASSESS: Inventory existing codebase for stages 13-16 (UI, DB, APIs, workflows)"'::jsonb,
    true
  )
WHERE id = 'SD-VISION-TRANSITION-001D4';

-- D5: Stages 17-20 (THE BUILD LOOP)
UPDATE strategic_directives_v2
SET
  scope = 'ASSESSMENT PHASE REQUIRED: Before defining stages 17-20 in lifecycle_stage_config, conduct codebase inventory:
1. UI Components: Search for existing React components related to stages 17-20
2. Database: Identify existing tables, columns, or data structures for these stages
3. APIs: Find existing endpoints, services, or business logic
4. Workflows: Locate existing stage transition logic or state machines
5. Reusability Analysis: Document what can be preserved vs what needs creation

IMPLEMENTATION PHASE: Define stages 17-20 where actual code generation begins. All stages require SDs (sd_required=true). Reuse existing implementations where possible.',

  strategic_objectives = jsonb_set(
    COALESCE(strategic_objectives, '[]'::jsonb),
    '{0}',
    '"ASSESS: Inventory existing codebase for stages 17-20 (UI, DB, APIs, workflows)"'::jsonb,
    true
  )
WHERE id = 'SD-VISION-TRANSITION-001D5';

-- D6: Stages 21-25 (LAUNCH & LEARN)
UPDATE strategic_directives_v2
SET
  scope = 'ASSESSMENT PHASE REQUIRED: Before defining stages 21-25 in lifecycle_stage_config, conduct codebase inventory:
1. UI Components: Search for existing React components related to stages 21-25
2. Database: Identify existing tables, columns, or data structures for these stages
3. APIs: Find existing endpoints, services, or business logic
4. Workflows: Locate existing stage transition logic or state machines
5. Reusability Analysis: Document what can be preserved vs what needs creation

IMPLEMENTATION PHASE: Define stages 21-25 covering launch and post-launch optimization. Reuse existing implementations where possible.',

  strategic_objectives = jsonb_set(
    COALESCE(strategic_objectives, '[]'::jsonb),
    '{0}',
    '"ASSESS: Inventory existing codebase for stages 21-25 (UI, DB, APIs, workflows)"'::jsonb,
    true
  )
WHERE id = 'SD-VISION-TRANSITION-001D6';

-- Verification: Show updated grandchildren scopes
SELECT
  id,
  title,
  LEFT(scope, 150) || '...' as scope_preview
FROM strategic_directives_v2
WHERE id LIKE 'SD-VISION-TRANSITION-001D_'
ORDER BY id;
