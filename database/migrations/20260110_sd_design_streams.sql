-- ============================================================================
-- Strategic Directive: Adaptive Design & Architecture Streams for PLAN Phase
-- ============================================================================
-- Context: Enhance LEO Protocol PLAN phase with explicit design/architecture streams
-- Target Table: strategic_directives_v2
-- Date: 2026-01-10
-- Status: EXECUTED 2026-01-10 21:42 PST

-- Create the Strategic Directive
INSERT INTO strategic_directives_v2 (
  id,
  sd_key,
  title,
  status,
  category,
  priority,
  description,
  rationale,
  scope,
  sd_type,
  relationship_type,
  current_phase,
  complexity_level,  -- Fixed: was 'complexity' (integer), now 'complexity_level' (varchar)
  metadata,
  success_criteria,
  risks
) VALUES (
  'SD-LEO-STREAMS-001',
  'SD-LEO-STREAMS-001',
  'Implement Adaptive Design & Architecture Streams for PLAN Phase',
  'draft',
  'protocol_enhancement',
  'high',
  'Add explicit Design Streams (IA, UX, UI, Data Models) and Architecture Streams (Technical Setup, API Design, Security Design, Performance Design) to the LEO Protocol PLAN phase. Streams activate intelligently based on SD type, with sub-agent validation and Gate 1 integration.',
  'The PLAN phase currently lacks explicit workstream checklists for design and architecture concerns. Sub-agents validate outputs but do not guide the design process itself. This enhancement ensures comprehensive coverage while maintaining LEO''s 3-phase simplicity.',
  'LEO Protocol PLAN phase: database schema, sd-type-checker.js, adaptive-threshold-calculator.js, CLAUDE_PLAN.md, PRD generation, sub-agent stream validation, Gate 1 and Gate 1.5 implementation.',
  'feature',
  'standalone',
  'LEAD_PRE_APPROVAL',
  'complex',  -- Fixed: was 7 (integer), now 'complex' (varchar: simple|moderate|complex|critical)
  '{
    "source": "Protocol Enhancement Discussion 2026-01-10",
    "enhancement_type": "PLAN phase workflow",
    "streams": {
      "design": ["Information Architecture", "UX Design", "UI Design", "Data Models"],
      "architecture": ["Technical Setup", "API Design", "Security Design", "Performance Design"]
    },
    "decisions": {
      "human_review": "Sub-agent only. Human review at Gate 4, not per-stream.",
      "performance_stream": "Recommended with soft prompt, not keyword-triggered.",
      "retroactive_application": "Full adoption. All SDs must complete applicable streams.",
      "rollout_strategy": "Full implementation. All streams and SD types at once."
    },
    "plan_file": "/home/rickf/.claude/plans/linked-gliding-wand.md"
  }'::jsonb,
  '[
    {"criterion": "sd_stream_requirements table exists with full activation matrix", "verified": false},
    {"criterion": "sd_stream_completions table tracks per-SD stream completion", "verified": false},
    {"criterion": "PLAN phase displays applicable streams for each SD type", "verified": false},
    {"criterion": "Gate 1 includes stream completion in scoring", "verified": false},
    {"criterion": "Gate 1.5 (Design-Architecture Coherence) validates cross-stream consistency", "verified": false},
    {"criterion": "Sub-agents validate their respective streams", "verified": false},
    {"criterion": "PRD template includes stream sections", "verified": false}
  ]'::jsonb,
  '[
    {"risk": "Increased PLAN phase overhead", "mitigation": "Skip/Optional streams for simple SDs; sub-agent-only validation"},
    {"risk": "Sub-agent capacity", "mitigation": "Parallel stream validation"},
    {"risk": "Existing SD disruption", "mitigation": "Clear migration path; streams populate as pending"},
    {"risk": "False positives on conditional triggers", "mitigation": "Conservative 2+ keyword match requirement"}
  ]'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  sd_key = EXCLUDED.sd_key,
  title = EXCLUDED.title,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  description = EXCLUDED.description,
  rationale = EXCLUDED.rationale,
  scope = EXCLUDED.scope,
  sd_type = EXCLUDED.sd_type,
  relationship_type = EXCLUDED.relationship_type,
  current_phase = EXCLUDED.current_phase,
  complexity_level = EXCLUDED.complexity_level,  -- Fixed: was 'complexity'
  metadata = strategic_directives_v2.metadata || EXCLUDED.metadata,
  success_criteria = EXCLUDED.success_criteria,
  risks = EXCLUDED.risks;

-- Verify the insert
SELECT id, title, status, sd_type, current_phase, priority, complexity_level
FROM strategic_directives_v2
WHERE id = 'SD-LEO-STREAMS-001';
