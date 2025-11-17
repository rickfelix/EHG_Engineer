-- Migration: Add QUICKFIX Sub-Agent
-- Purpose: Integrate Quick-Fix Workflow as a LEO sub-agent
-- Created: 2025-11-17

INSERT INTO leo_sub_agents (
  code,
  name,
  description,
  activation_type,
  priority,
  script_path,
  active,
  metadata,
  capabilities
) VALUES (
  'QUICKFIX',
  'Quick-Fix Orchestrator ("LEO Lite" Field Medic)',
  'Lightweight triage and resolution for small UAT-discovered issues (≤50 LOC). Acts as mini-orchestrator: intelligently calls DATABASE, SECURITY, TESTING sub-agents only when needed for quick validation. Bypasses full LEAD→PLAN→EXEC workflow for trivial fixes. Auto-escalates to full SD if >50 LOC, complexity detected, or specialist sub-agents recommend escalation.',
  'automatic',
  95,  -- After UAT (90), before final execution
  'lib/sub-agents/quickfix.js',
  true,
  jsonb_build_object(
    'version', '1.0.0',
    'philosophy', 'Not every cut needs surgery - but know when to call the surgeon',
    'role', 'Field Medic & Mini-Orchestrator',
    'backstory', 'While other sub-agents are specialists (Database Architect, Security Chief, QA Director), QUICKFIX is the field medic - trained to triage issues quickly, call in specialists only when needed, and patch things up fast without the full MASH unit.',
    'max_loc', 50,
    'auto_escalate', true,
    'gates', 2,
    'requires_lead_approval', false,
    'requires_prd', false,
    'can_invoke_subagents', true,
    'intelligent_orchestration', true,
    'test_requirement', 'Tier 1 smoke tests (unit + E2E)',
    'pr_required', true,
    'sources', ARRAY[
      'UAT testing sessions',
      'Manual testing discoveries',
      'Code review findings',
      'Specialist sub-agent recommendations'
    ],
    'can_invoke', ARRAY[
      'DATABASE (if files contain .sql, schema, migration)',
      'SECURITY (if files contain auth, security, RLS)',
      'TESTING (to verify test coverage before completion)',
      'VALIDATION (quick duplicate check)'
    ]
  ),
  jsonb_build_array(
    'Triage issue severity and scope (estimate LOC, complexity, risk)',
    'Create quick-fix records (QF-YYYYMMDD-NNN format)',
    'Auto-classify based on LOC, type, complexity, risk keywords',
    'Intelligently invoke specialist sub-agents when needed (DATABASE, SECURITY, TESTING)',
    'Auto-escalate to full SD if >50 LOC or specialists recommend escalation',
    'Detect forbidden keywords (migration, schema, auth, security) → trigger appropriate sub-agent',
    'Enforce 50 LOC hard cap during completion',
    'Require both unit and E2E tests passing (can invoke TESTING sub-agent)',
    'Track in separate quick_fixes table (not strategic_directives_v2)',
    'Generate quick-fix ID and guide implementation',
    'Verify UAT confirmation before completion',
    'Always require PR creation (no direct merge)',
    'Lightweight validation: only invoke sub-agents if issue touches their domain',
    'Act as "LEO Lite" - same principles, reduced bureaucracy'
  )
)
ON CONFLICT (code)
DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  priority = EXCLUDED.priority,
  metadata = EXCLUDED.metadata,
  capabilities = EXCLUDED.capabilities;

-- Add comment
COMMENT ON COLUMN leo_sub_agents.code IS
  'Sub-agent unique code identifier. QUICKFIX added 2025-11-17 for lightweight UAT issue resolution.';
