-- Update SD-LEO-ORCH-SELF-IMPROVING-LEO-001 orchestrator and children with proper details

-- Update orchestrator
UPDATE strategic_directives_v2 SET
  title = 'Self-Improving LEO: Automation Completion & Menu Integration',
  description = 'Complete the LEO Self-Improvement infrastructure by: (1) Automating the remaining manual gaps (rubric assessment, multi-model debate, outcome closure), (2) Implementing the unified inbox and menu enhancements, (3) Creating comprehensive analytics capabilities. Expected outcomes: Pipeline Automation 62% → 95%+, Natural command interface for all operations, Full insight into improvement effectiveness, Automatic feedback → outcome → pattern prevention.',
  priority = 'high',
  success_criteria = '[{"criterion": "Pipeline automation reaches 95%+", "measure": "Measure against 14-stage audit"}, {"criterion": "Unified inbox shows all sources", "measure": "/leo inbox displays NEW, SHELF, PENDING SDs"}, {"criterion": "Analytics provides visibility", "measure": "/leo analytics shows all metrics"}]'::jsonb,
  scope = 'Self-improvement infrastructure: rubric assessment AI, multi-model debate, outcome closure, unified inbox, analytics commands, documentation',
  rationale = 'Current pipeline is 62% automated with critical gaps in rubric assessment (0%), multi-model debate (0%), and outcome closure (70%). User feedback indicates need for unified inbox view and analytics menu.',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{automation_context}',
    '"SD creation via orchestrator script - initial type assignment was placeholder"'::jsonb
  )
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001';

-- Update Child A: AI-Powered Rubric Assessment Integration
UPDATE strategic_directives_v2 SET
  title = 'AI-Powered Rubric Assessment Integration',
  description = 'Integrate LLM (Claude) into VettingEngine.assessWithRubric() to replace hardcoded heuristics with semantic AI evaluation. Generate detailed reasoning for each of 6 criteria. Store evaluation artifacts for audit trail.',
  sd_type = 'feature',
  priority = 'high',
  success_criteria = '[{"criterion": "AI evaluates all 6 criteria with reasoning", "measure": "Check vetting_outcomes table for AI-generated reasoning"}, {"criterion": "Scores are semantically meaningful", "measure": "No hardcoded scores in new evaluations"}, {"criterion": "Evaluation takes <5 seconds per proposal", "measure": "Performance benchmark"}, {"criterion": "Audit trail captures full evaluation context", "measure": "Check audit_log entries"}]'::jsonb,
  scope = 'lib/sub-agents/vetting/index.js lines 533-571, new lib/sub-agents/vetting/rubric-evaluator.js',
  rationale = 'Current rubric assessment uses hardcoded heuristics (always returns 75). Need AI evaluation for meaningful semantic analysis.',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{type_change_reason}',
    '"Correcting initial placeholder type to proper feature type - this is a feature implementation SD"'::jsonb
  )
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-A';

-- Update Child B: Multi-Model Debate System Implementation
UPDATE strategic_directives_v2 SET
  title = 'Multi-Model Debate System Implementation',
  description = 'Integrate 3 different LLM providers for critic personas. Implement CONST-002 family separation validation. Auto-trigger debate when proposal reaches submitted status. Record debate transcripts to proposal_debates table.',
  sd_type = 'feature',
  priority = 'high',
  success_criteria = '[{"criterion": "3 distinct model families used", "measure": "Verify Anthropic, OpenAI, Google calls in logs"}, {"criterion": "CONST-002 validation passes", "measure": "Constitutional validation gate passes"}, {"criterion": "Debate auto-triggers on submission", "measure": "Check automation flow"}, {"criterion": "Full transcript captured with reasoning", "measure": "Check proposal_debates table"}]'::jsonb,
  scope = 'scripts/board-vetting.js lines 159-224, new lib/sub-agents/vetting/debate-orchestrator.js, new lib/sub-agents/vetting/critic-personas.js',
  rationale = 'Current debate system creates placeholder records with hardcoded scores (75). Need actual AI model calls.',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{type_change_reason}',
    '"Correcting initial placeholder type to proper feature type - this is a feature implementation SD"'::jsonb
  )
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-B';

-- Update Child C: Outcome Loop Closure Automation
UPDATE strategic_directives_v2 SET
  title = 'Outcome Loop Closure Automation',
  description = 'Link SD completion back to original feedback items. Auto-record outcome_signal when SD completes. Track pattern recurrence after resolution. Measure improvement effectiveness (before/after metrics).',
  sd_type = 'feature',
  priority = 'medium',
  success_criteria = '[{"criterion": "SD completion auto-marks feedback as resolved", "measure": "Check leo_feedback status after SD completion"}, {"criterion": "outcome_signal automatically recorded", "measure": "Check outcome_signals table"}, {"criterion": "Pattern recurrence detected within 30 days", "measure": "Check pattern detection logic"}, {"criterion": "Effectiveness metrics calculated", "measure": "Before/after comparison available"}]'::jsonb,
  scope = 'scripts/modules/handoff/executors/LeadFinalApprovalExecutor.js, new lib/learning/outcome-tracker.js, database triggers',
  rationale = 'Currently no link exists from SD completion back to feedback resolution, preventing loop closure.',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{type_change_reason}',
    '"Correcting initial placeholder type to proper feature type - this is a feature implementation SD"'::jsonb
  )
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-C';

-- Update Child D: Unified Inbox Implementation
UPDATE strategic_directives_v2 SET
  title = 'Unified Inbox Implementation',
  description = 'Expand /leo inbox to show unified view with sections: NEW, ON THE SHELF, PENDING SDs, IN PROGRESS, COMPLETED. Implement deduplication when SD covers multiple items. Data sources: leo_feedback + issue_patterns + audit_findings + SDs.',
  sd_type = 'feature',
  priority = 'high',
  success_criteria = '[{"criterion": "Single view shows all improvement sources", "measure": "/leo inbox displays unified view"}, {"criterion": "Items grouped by lifecycle stage", "measure": "Check section grouping"}, {"criterion": "SDs show linked items (avoids duplicates)", "measure": "No duplicate entries for SD-linked items"}, {"criterion": "Pending SDs on shelf are visible", "measure": "Check SHELF section"}]'::jsonb,
  scope = 'New skill: projectSettings:inbox expansion, new lib/inbox/unified-inbox-builder.js, new scripts/leo-unified-inbox.js',
  rationale = 'User feedback indicates need for unified view of all improvement opportunities across feedback, patterns, and pending SDs.',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{type_change_reason}',
    '"Correcting initial placeholder type to proper feature type - this is a feature implementation SD"'::jsonb
  )
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-D';

-- Update Child E: /leo audit & /leo analytics Commands
UPDATE strategic_directives_v2 SET
  title = '/leo audit & /leo analytics Commands',
  description = 'Implement /leo audit for running internal discovery. Implement /leo analytics for comprehensive metrics view. Include: feedback stats, outcome signals, AEGIS violations, vetting coverage. Status tracking: /leo status [id] for progress visibility.',
  sd_type = 'feature',
  priority = 'medium',
  success_criteria = '[{"criterion": "/leo audit discovers opportunities", "measure": "Command finds patterns/issues"}, {"criterion": "/leo analytics shows all metrics", "measure": "Organized metrics output"}, {"criterion": "/leo status shows item progress", "measure": "Progress through workflow visible"}, {"criterion": "Metrics include all sources", "measure": "Feedback, proposals, patterns, SDs covered"}]'::jsonb,
  scope = 'Update skill: projectSettings:leo, new scripts/leo-audit.js, new scripts/leo-analytics.js, new lib/analytics/self-improvement-metrics.js',
  rationale = 'User wants analytics/reporting menu showing outcome signals, feedback stats, and other metrics.',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{type_change_reason}',
    '"Correcting initial placeholder type to proper feature type - this is a feature implementation SD"'::jsonb
  )
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-E';

-- Update Child F: Documentation & Integration Testing
UPDATE strategic_directives_v2 SET
  title = 'Documentation & Integration Testing',
  description = 'Update /leo skill with new commands. Create integration tests for full pipeline. Update docs/guides/leo-self-improvement-operations.md. Update CLAUDE.md generation to include new capabilities.',
  sd_type = 'documentation',
  priority = 'medium',
  success_criteria = '[{"criterion": "All new commands documented in /leo skill", "measure": "Check skill definition"}, {"criterion": "Integration tests cover full pipeline flow", "measure": "Test file exists and passes"}, {"criterion": "Operations guide reflects actual implementation", "measure": "Doc review"}, {"criterion": "CLAUDE.md includes new command triggers", "measure": "Check generated CLAUDE.md"}]'::jsonb,
  scope = 'projectSettings:leo skill update, docs/guides/leo-self-improvement-operations.md, new tests/integration/self-improvement-pipeline.test.js',
  rationale = 'Documentation and integration testing required after all feature phases complete.',
  governance_metadata = jsonb_set(
    COALESCE(governance_metadata, '{}'::jsonb),
    '{type_change_reason}',
    '"Correcting initial placeholder type to proper documentation type - this is a documentation SD"'::jsonb
  )
WHERE sd_key = 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001-F';

-- Verification query
SELECT sd_key, title, sd_type, priority
FROM strategic_directives_v2
WHERE sd_key LIKE 'SD-LEO-ORCH-SELF-IMPROVING-LEO-001%'
ORDER BY sd_key;
