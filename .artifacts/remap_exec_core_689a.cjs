const fs = require('fs');
const p = 'scripts/section-file-mapping.json';
const m = JSON.parse(fs.readFileSync(p, 'utf8'));
const SD = 'SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001';

// ---- EXEC (FR-3) ----
const execToManual = ['workflow', 'exec_skill_integration', 'exec_requirement', 'exec_component_sizing_guidelines', 'exec_todo_comment_standard', 'auto_merge_workflow', 'exec_ui_parity_verification', 'exec_edge_case_testing_checklist', 'testing_tools', 'e2e_testing_mode_configuration', 'human_like_testing', 'test_coverage_quality_gate', 'integration_test_requirement_gate', 'governance_kr_progress_exec', 'code_quality_pre_commit', 'worktree_freshness_precheck'];
m['CLAUDE_EXEC.md'].sections = m['CLAUDE_EXEC.md'].sections.filter((s) => !execToManual.includes(s));
m['CLAUDE_EXEC.md']._removed_sections_note += ` ${SD} (FR-3): sixteen reference/procedure section_types moved to CLAUDE_EXEC_MANUAL.md (allow-list with per-section justification there); reference rows 375/524/590 retyped exec_manual_reference; carved evidence/rationale to CLAUDE_EXEC_PROVENANCE.md.`;
const manualJust = {
  workflow: 'Three rows share this generic type: the Triangulated Runtime Audit protocol (a manual /runtime-audit doc), branch creation (AUTOMATED at LEAD-TO-PLAN per its own text) and the branch-exists note. All procedure; the branch hygiene RULES stay in CLAUDE_EXEC.md (branch_hygiene_gate). Already listed in CLAUDE_PLAN_MANUAL.md for the same reason.',
  exec_skill_integration: 'A catalogue of skills, chains and a selection guide, consulted while writing code; no standing instruction (the sub-agent first-responder RULE it references lives in sub_agent_phase_guidance_exec, which stays).',
  exec_requirement: 'Describes the AUTOMATED deliverable-tracking mechanism (triggers, sync, verification functions, the manual-update snippet); informational; the EXEC-TO-PLAN verification gate itself is code.',
  exec_component_sizing_guidelines: 'A sizing table with retrospective evidence; guidance, no prohibition.',
  exec_todo_comment_standard: 'A comment template; reference.',
  auto_merge_workflow: 'A recommended command sequence; procedure. The MANDATORY commit/push/merge rule stays (exec_completion_merge_requirement).',
  exec_ui_parity_verification: 'A pre-completion checklist. The binding rule is NC-EXEC-005 (negative_constraints_exec, stays) and the CORE UI Parity Requirement.',
  exec_edge_case_testing_checklist: 'A test-authoring checklist; reference.',
  testing_tools: 'The Playwright MCP tool catalogue; reference.',
  e2e_testing_mode_configuration: 'A port/config note; reference.',
  human_like_testing: 'The human-like E2E fixture catalogue (fixtures, stringency levels, lenses, CI workflow); reference.',
  test_coverage_quality_gate: 'Describes an EXEC-TO-PLAN gate that is ENFORCED IN CODE (createTestCoverageQualityGate); the description is reference, the enforcement does not depend on it being read.',
  integration_test_requirement_gate: 'Describes an EXEC-TO-PLAN gate that is ENFORCED IN CODE (createIntegrationTestRequirementGate); same reasoning as test_coverage_quality_gate.',
  governance_kr_progress_exec: 'A post-ship KR update workflow; procedure.',
  code_quality_pre_commit: 'Lint commands and a failure table; procedure. The pre-commit/pre-push hooks enforce.',
  worktree_freshness_precheck: 'A two-command pre-check before declaring code missing; procedure with its rationale.',
  exec_manual_reference: 'Rows 375 (Validation Rules: gate descriptions), 524 (/batch command reference) and 590 (PRD metadata.db_content_assertions field guide) retyped from the generic "reference" type so they can move without taking rows 536/537 (Context Compaction Nudges Are NOT Pause Points; Directive Priority Hierarchy, both RULES) with them.',
  exec_manual: 'Procedure carved out of rules that stay in CLAUDE_EXEC.md (implementation-checklist template, Gate-0 enforcement-layer list, worktree/merge command blocks, the branch health-check script).',
};
m['CLAUDE_EXEC_MANUAL.md'] = {
  description: `EXEC reference companion (${SD}, FR-3). Reference and procedure lifted out of CLAUDE_EXEC.md so the phase file fits the Read tool 25k single-call cap. RULES AND PROHIBITIONS DO NOT LIVE HERE. They stay in CLAUDE_EXEC.md and bind whether or not this file is read. Also carries the generated Database Schema Constraints and LEO Process Scripts reference blocks.`,
  sections: [...execToManual, 'exec_manual_reference', 'exec_manual'],
  _move_justification: manualJust,
  _allow_list_note: 'This list is an ALLOW-LIST reviewed section by section (same discipline as CLAUDE_LEAD_MANUAL.md / CLAUDE_CORE_MANUAL.md). Sections that carry a live rule were EXCLUDED despite reading as reference: negative_constraints_exec, exec_implementation_requirements (ambiguity-resolution and application-check rules), exec_dual_test_requirement, exec_acceptance_criteria_verification, exec_completion_merge_requirement, branch_hygiene_gate, multi_instance_coordination, migration_script_pattern, exec_atomic_insert_writer_consumer_pattern, sanctioned_ci_wait_pattern, vision_v2_exec, parent_child_exec, vision_arch_doc_check, fleet_worker_loop_continuity, sub_agent_phase_guidance_exec, exec_retrospective_anti_patterns, and the two reference rows 536/537.',
};
m['CLAUDE_EXEC_PROVENANCE.md'] = {
  description: `EXEC provenance companion (${SD}, FR-3). Dated retrospective evidence, incident narratives and rationale carved out of rule sections that stay in CLAUDE_EXEC.md. Every rule in CLAUDE_EXEC.md is in force regardless of whether its history is read here.`,
  sections: ['exec_provenance'],
  _move_justification: { exec_provenance: 'Evidence quotes behind the six retrospective anti-patterns, the dual-test evidence/common-mistakes/why blocks, the multi-instance and branch-hygiene incident evidence: the WHY, never the rule.' },
};

// ---- CORE (FR-4) ----
const coreToManual = ['cascade_invalidation_system', 'db_ops_protocol', 'qf_lifecycle_reconciliation', 'queue_ranking_unified', 'sub_agent_config', 'gate_retrospective_invariants', 'quick_fixes_schema_traps'];
m['CLAUDE_CORE.md'].sections = m['CLAUDE_CORE.md'].sections.filter((s) => !coreToManual.includes(s));
m['CLAUDE_CORE.md']._removed_sections_note += ` ${SD} (FR-4): seven reference section_types moved to CLAUDE_CORE_MANUAL.md and row 612 (Solomon Consultation Protocol) retyped solomon_consultation_protocol and moved there; G3 amendment rationale carved to CLAUDE_CORE_PROVENANCE.md.`;
Object.assign(m['CLAUDE_CORE_MANUAL.md']._move_justification, {
  cascade_invalidation_system: 'Describes a DB trigger mechanism, flag lifecycle and CLI commands; reference.',
  db_ops_protocol: 'Column/JSONB/NOT-NULL/IF-EXISTS pitfalls consulted while writing a query or migration; reference. The migration RULE (invoke the DATABASE sub-agent) stays in migration_execution_protocol.',
  qf_lifecycle_reconciliation: 'Describes the two reconciliation layers, their cron and when to reach for them; mechanism reference. The layers run regardless.',
  queue_ranking_unified: 'Documents the rank-items.js SSOT, the QF track-inference table and severity bands for maintainers; reference.',
  sub_agent_config: 'The database sub-agent auto-invocation trigger table, config and audit trail; mechanism reference. The invocation RULE (ANY database WRITE error -> database-agent) stays in sub_agent_routing_reference.',
  gate_retrospective_invariants: 'Implementation invariants for maintainers touching the two retrospective gates; reference for a code change, not a session rule.',
  quick_fixes_schema_traps: `Column/enum reference consulted at the moment of writing a query (${SD} FR-2/FR-4).`,
  solomon_consultation_protocol: 'Row 612 retyped from signaling_friction: the HOW of a flag-gated consult (command, eligibility counters, dashboard); procedure. The friction-signal RULE (row 592) stays in CLAUDE_CORE.md.',
});
m['CLAUDE_CORE_MANUAL.md'].sections.push(...coreToManual, 'solomon_consultation_protocol');
m['CLAUDE_CORE_PROVENANCE.md'] = {
  description: `CORE provenance companion (${SD}, FR-4). Dated rationale and incident narratives carved out of rule sections that stay in CLAUDE_CORE.md. Every rule in CLAUDE_CORE.md is in force regardless of whether its history is read here.`,
  sections: ['core_provenance'],
  _move_justification: { core_provenance: 'The problem narrative behind the G3 definition-of-done amendment and similar WHY blocks; never the rule.' },
};
fs.writeFileSync(p, JSON.stringify(m, null, 2) + '\n');
console.log('EXEC', m['CLAUDE_EXEC.md'].sections.length, 'EXEC_MANUAL', m['CLAUDE_EXEC_MANUAL.md'].sections.length, 'CORE', m['CLAUDE_CORE.md'].sections.length, 'CORE_MANUAL', m['CLAUDE_CORE_MANUAL.md'].sections.length, 'keys', Object.keys(m).length);
