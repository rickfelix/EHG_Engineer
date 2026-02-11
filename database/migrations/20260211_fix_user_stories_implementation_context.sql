-- Fix implementation_context for SD-LEO-FEAT-WIRE-PARALLEL-TEAM-001 user stories
-- Replaces placeholder {"approach":"See PRD FR-US-XXX"} with proper implementation details

-- Story 1: CLI Main branches to parallel execution
UPDATE user_stories
SET implementation_context = jsonb_build_object(
  'technical_approach', 'Add parallel branch in cli-main.js that checks ORCH_PARALLEL_CHILDREN_ENABLED and eligible child count. When enabled with 2+ children, call parallel-team-spawner.planParallelExecution() and output structured JSON. Otherwise fall through to existing getNextReadyChild() sequential path.',
  'files_to_create', '[]'::jsonb,
  'files_to_modify', '["scripts/modules/handoff/cli/cli-main.js"]'::jsonb,
  'dependencies', '["parallel-team-spawner.js (FR-2)"]'::jsonb,
  'estimated_effort', '5 story points (~4 hours)'
)::text
WHERE id = '7c833922-ff97-4fda-852c-fb2d225fc51d';

-- Story 2: Parallel Team Spawner composition
UPDATE user_stories
SET implementation_context = jsonb_build_object(
  'technical_approach', 'Create parallel-team-spawner.js as bridge module composing ParallelCoordinator, AgentExperienceFactory, and worktree manager. Exports planParallelExecution() returning {schemaVersion:''1.0'', mode:''parallel'', orchestratorSdId, toStart:[...]}. Each toStart entry has childSdId, worktreePath, prompt, agentDefinitionPath, idempotencyKey.',
  'files_to_create', '["scripts/modules/handoff/parallel-team-spawner.js"]'::jsonb,
  'files_to_modify', '[]'::jsonb,
  'dependencies', '["scripts/modules/parallel-coordinator.js", "lib/agent-experience-factory.js", "scripts/modules/worktree-manager.js"]'::jsonb,
  'estimated_effort', '8 story points (~6 hours)'
)::text
WHERE id = '9495267c-212a-4de1-8f82-274b7ee4fadb';

-- Story 3: Worktree Manager isolation
UPDATE user_stories
SET implementation_context = jsonb_build_object(
  'technical_approach', 'Use existing worktree manager to create unique worktrees per child. Path format: .worktrees/<orchestratorSdId>/<childSdId>. Reuse existing worktree if already present in coordinator state. Ensure no duplicate worktrees created.',
  'files_to_create', '[]'::jsonb,
  'files_to_modify', '["scripts/modules/worktree-manager.js"]'::jsonb,
  'dependencies', '["scripts/modules/parallel-coordinator.js"]'::jsonb,
  'estimated_effort', '5 story points (~4 hours)'
)::text
WHERE id = 'c8da6aef-1c93-4517-9fc7-a97cb6e206cc';

-- Story 4: AEF prompt enrichment
UPDATE user_stories
SET implementation_context = jsonb_build_object(
  'technical_approach', 'Call AgentExperienceFactory to generate DYNAMIC KNOWLEDGE preamble for each child. Prepend to teammate prompt with childSdId and orchestratorSdId identifiers. Set agentDefinitionPath to .claude/agents/orchestrator-child-agent.md. Ensure preamble is >=200 chars.',
  'files_to_create', '[".claude/agents/orchestrator-child-agent.md"]'::jsonb,
  'files_to_modify', '["scripts/modules/handoff/parallel-team-spawner.js"]'::jsonb,
  'dependencies', '["lib/agent-experience-factory.js"]'::jsonb,
  'estimated_effort', '3 story points (~2 hours)'
)::text
WHERE id = '0911a660-16ee-4aa7-af1c-c064ccc394cb';

-- Story 5: Coordinator state persistence
UPDATE user_stories
SET implementation_context = jsonb_build_object(
  'technical_approach', 'Implement atomic JSON state persistence using temp file + rename pattern. State file at .worktrees/<orchestratorSdId>/coordinator-state.json. Tracks started/completed/pending children. On read, validate JSON and fall back to last-known-good if corrupt. Prevents duplicate starts across process invocations.',
  'files_to_create', '[]'::jsonb,
  'files_to_modify', '["scripts/modules/parallel-coordinator.js"]'::jsonb,
  'dependencies', '[]'::jsonb,
  'estimated_effort', '5 story points (~4 hours)'
)::text
WHERE id = '04f6b489-0a9f-4311-a4b2-0244e57b1df1';

-- Verification: Show updated implementation_context for all 5 stories
SELECT
  id,
  title,
  implementation_context::jsonb->>'technical_approach' as technical_approach,
  implementation_context::jsonb->'files_to_create' as files_to_create,
  implementation_context::jsonb->'files_to_modify' as files_to_modify,
  implementation_context::jsonb->'dependencies' as dependencies,
  implementation_context::jsonb->>'estimated_effort' as estimated_effort
FROM user_stories
WHERE id IN (
  '7c833922-ff97-4fda-852c-fb2d225fc51d',
  '9495267c-212a-4de1-8f82-274b7ee4fadb',
  'c8da6aef-1c93-4517-9fc7-a97cb6e206cc',
  '0911a660-16ee-4aa7-af1c-c064ccc394cb',
  '04f6b489-0a9f-4311-a4b2-0244e57b1df1'
)
ORDER BY title;
