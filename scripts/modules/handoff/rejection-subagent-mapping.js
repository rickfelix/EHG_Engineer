/**
 * Centralized Rejection-to-SubAgent Mapping
 * SD-LEO-INFRA-ACTIONABLE-REJECTION-TEMPLATES-001
 *
 * Maps all 36+ rejection codes to Task tool invocations with Five-Point Brief prompts.
 * Single source of truth — imported by all remediation files.
 */

/**
 * Build a Five-Point Brief prompt for a sub-agent invocation.
 *
 * @param {Object} opts
 * @param {string} opts.symptom - What IS happening (observable behavior)
 * @param {string} opts.location - Files, endpoints, DB tables involved
 * @param {string} opts.frequency - How often, when it started, pattern
 * @param {string} opts.priorAttempts - What was already tried
 * @param {string} opts.desiredOutcome - What success looks like
 * @returns {string} Formatted Five-Point Brief
 */
function fivePointBrief({ symptom, location, frequency, priorAttempts, desiredOutcome }) {
  return [
    `Symptom: ${symptom}`,
    `Location: ${location}`,
    `Frequency: ${frequency}`,
    `Prior attempts: ${priorAttempts}`,
    `Desired outcome: ${desiredOutcome}`
  ].join('\n');
}

/**
 * Generate a Task tool invocation string for a rejection code.
 *
 * @param {string} subagentType - The subagent_type parameter
 * @param {string} prompt - The Five-Point Brief prompt
 * @returns {string} Formatted Task tool invocation
 */
function taskInvocation(subagentType, prompt) {
  return [
    '',
    '--- TASK TOOL INVOCATION ---',
    `subagent_type: "${subagentType}"`,
    'prompt: |',
    ...prompt.split('\n').map(line => `  ${line}`),
    '--- END INVOCATION ---'
  ].join('\n');
}

/**
 * Master mapping: rejection code → { subagentType, promptFn, category }
 *
 * promptFn receives a context object: { sdId, gateName, details, score }
 * Returns the full remediation string (human message + Task invocation).
 *
 * Categories: quality, testing, design, stories, infrastructure, workflow, git
 */
const REJECTION_MAP = {
  // ═══════════════════════════════════════════════════
  // QUALITY CATEGORY (improvement-guidance.js codes)
  // ═══════════════════════════════════════════════════

  'NO_PRD': {
    subagentType: 'general-purpose',
    category: 'quality',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `No PRD exists for ${ctx.sdId}. PLAN-TO-EXEC handoff blocked.`,
        location: `product_requirements_v2 table, sd_id=${ctx.sdId}`,
        frequency: 'First attempt at PLAN-TO-EXEC for this SD',
        priorAttempts: 'None — PRD has not been created yet',
        desiredOutcome: `Generate a complete PRD for ${ctx.sdId} and insert into product_requirements_v2. Read docs/reference/prd-inline-schema.md for the exact field structure. Set status to "approved".`
      });
      return 'Create comprehensive PRD before EXEC phase.' +
        taskInvocation('general-purpose', brief);
    }
  },

  'PRD_QUALITY': {
    subagentType: 'general-purpose',
    category: 'quality',
    promptFn: (ctx) => {
      const score = ctx.details?.actualScore || 'unknown';
      const required = ctx.details?.requiredScore || 70;
      const failingDimensions = ctx.details?.prdValidation?.errors || [];
      const brief = fivePointBrief({
        symptom: `PRD quality score ${score}% is below ${required}% threshold. Failing areas: ${failingDimensions.join(', ') || 'unspecified'}.`,
        location: `product_requirements_v2 WHERE id='PRD-${ctx.sdId}'`,
        frequency: 'Gate failure on PLAN-TO-EXEC attempt',
        priorAttempts: `Current PRD scored ${score}%. ${failingDimensions.length} validation errors detected.`,
        desiredOutcome: `Update PRD fields to resolve all validation errors. Target score >= ${required}%. Focus on: ${failingDimensions.slice(0, 3).join(', ') || 'requirements depth, architecture quality, test scenarios'}.`
      });
      return `PRD quality score: ${score}% (min: ${required}%). Fix failing dimensions.` +
        taskInvocation('general-purpose', brief);
    }
  },

  'PRD_BOILERPLATE': {
    subagentType: 'general-purpose',
    category: 'quality',
    promptFn: (ctx) => {
      const score = ctx.details?.qualityValidation?.score || 'unknown';
      const brief = fivePointBrief({
        symptom: `PRD contains boilerplate/placeholder content. Quality score: ${score}%.`,
        location: `product_requirements_v2 WHERE id='PRD-${ctx.sdId}'`,
        frequency: 'Gate failure on PLAN-TO-EXEC attempt',
        priorAttempts: 'PRD was generated but contains generic text (TBD, placeholder, generic statements)',
        desiredOutcome: `Replace all boilerplate with SD-specific content. Forbidden patterns: "TBD", "To be defined", "Will be determined". Every requirement must be specific and measurable.`
      });
      return `PRD has boilerplate content (score: ${score}%). Replace with specific requirements.` +
        taskInvocation('general-purpose', brief);
    }
  },

  'PLAN_INCOMPLETE': {
    subagentType: null,
    category: 'quality',
    promptFn: (ctx) => 'Complete PLAN phase activities and update PRD status to "approved" before requesting EXEC handoff.'
  },

  'NO_USER_STORIES': {
    subagentType: 'general-purpose',
    category: 'stories',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `No user stories found for ${ctx.sdId}. PLAN-TO-EXEC handoff blocked by NO_USER_STORIES gate.`,
        location: `user_stories table WHERE sd_id='${ctx.sdId}', PRD: PRD-${ctx.sdId}`,
        frequency: 'Blocking on first PLAN-TO-EXEC attempt',
        priorAttempts: 'None — user stories have not been generated',
        desiredOutcome: `Generate 5-8 user stories from the PRD acceptance criteria. Each story: {story_key, title, user_role, user_want, user_benefit, acceptance_criteria (Given/When/Then), priority, story_points}. Insert into user_stories table. Set status to "ready".`
      });
      return 'User stories are MANDATORY before EXEC phase.' +
        taskInvocation('general-purpose', brief);
    }
  },

  'USER_STORIES_ERROR': {
    subagentType: 'rca-agent',
    category: 'infrastructure',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: 'Database error when querying user_stories table during PLAN-TO-EXEC handoff.',
        location: 'user_stories table, scripts/modules/handoff/verifiers/plan-to-exec/',
        frequency: 'On current PLAN-TO-EXEC attempt',
        priorAttempts: 'Handoff attempted but user_stories query returned error',
        desiredOutcome: 'Identify root cause of database access failure. Check table existence, RLS policies, and connection settings.'
      });
      return 'Database error accessing user_stories table.' +
        taskInvocation('rca-agent', brief);
    }
  },

  'USER_STORY_QUALITY': {
    subagentType: 'general-purpose',
    category: 'stories',
    promptFn: (ctx) => {
      const avgScore = ctx.details?.qualityValidation?.averageScore || 0;
      const minScore = ctx.details?.qualityValidation?.minimumScore || 70;
      const poorCount = ctx.details?.qualityValidation?.qualityDistribution?.poor || 0;
      const brief = fivePointBrief({
        symptom: `User story quality score ${avgScore}% below ${minScore}% threshold. ${poorCount} stories scored below minimum.`,
        location: `user_stories table WHERE sd_id='${ctx.sdId}'`,
        frequency: 'Gate failure on PLAN-TO-EXEC attempt',
        priorAttempts: `Stories exist but ${poorCount} have poor quality (boilerplate criteria, generic roles, short descriptions)`,
        desiredOutcome: `Update user stories: (1) Replace boilerplate acceptance_criteria with Given/When/Then format, (2) Use specific personas instead of "user", (3) Ensure user_want >= 20 chars, user_benefit >= 15 chars. Target score >= ${minScore}%.`
      });
      return `User story quality: ${avgScore}% (min: ${minScore}%). Fix ${poorCount} poor-quality stories.` +
        taskInvocation('general-purpose', brief);
    }
  },

  'HANDOFF_INVALID': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Handoff document must include all 7 required elements per LEO Protocol. Review handoff validation errors and update.'
  },

  'PLAN_PRESENTATION_INVALID': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Add complete plan_presentation to handoff metadata: goal_summary (<=300 chars), file_scope, execution_plan steps, and testing_strategy (unit_tests + e2e_tests).'
  },

  'WORKFLOW_REVIEW_FAILED': {
    subagentType: 'design-agent',
    category: 'design',
    promptFn: (ctx) => {
      const vr = ctx.details?.workflowAnalysis?.validation_results || {};
      const issues = [
        ...(vr.dead_ends || []),
        ...(vr.circular_flows || []),
        ...(vr.error_recovery || [])
      ];
      const brief = fivePointBrief({
        symptom: `Workflow validation failed with ${issues.length} issues. UX score: ${ctx.details?.workflowAnalysis?.ux_impact_score || 'unknown'}/10.`,
        location: `user_stories WHERE sd_id='${ctx.sdId}', acceptance_criteria and implementation_context fields`,
        frequency: 'Gate failure on PLAN-TO-EXEC attempt',
        priorAttempts: 'Design sub-agent flagged workflow issues in user stories',
        desiredOutcome: `Fix workflow issues: dead ends, circular flows, missing error recovery. Update user story acceptance_criteria and implementation_context. Target UX score >= 6.0/10.`
      });
      return `Workflow validation failed (${issues.length} issues). Fix user story workflows.` +
        taskInvocation('design-agent', brief);
    }
  },

  // ═══════════════════════════════════════════════════
  // GATE CODES (ResultBuilder + executor remediations)
  // ═══════════════════════════════════════════════════

  'GATE1_VALIDATION_FAILED': {
    subagentType: 'design-agent',
    category: 'design',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Gate 1 (Design/Database) validation failed for ${ctx.sdId}. Score: ${ctx.score || 'unknown'}/100.`,
        location: 'scripts/modules/handoff/executors/plan-to-exec/, PRD and user stories',
        frequency: 'Blocking PLAN-TO-EXEC handoff',
        priorAttempts: 'Handoff attempted without running DESIGN/DATABASE sub-agents',
        desiredOutcome: `Run design analysis for ${ctx.sdId}. Analyze PRD requirements, generate component recommendations, validate architecture patterns.`
      });
      return 'Gate 1 failed. Run DESIGN and DATABASE sub-agents.' +
        taskInvocation('design-agent', brief);
    }
  },

  'GATE1_DESIGN_DATABASE': {
    subagentType: 'design-agent',
    category: 'design',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `GATE1_DESIGN_DATABASE failed for ${ctx.sdId}. Design and database analysis required.`,
        location: 'product_requirements_v2, user_stories tables',
        frequency: 'Blocking PLAN-TO-EXEC handoff',
        priorAttempts: 'No design/database analysis has been run for this SD',
        desiredOutcome: `Complete design analysis: component architecture, data flow, integration points. Then run database-agent for schema analysis.`
      });
      return 'Execute DESIGN and DATABASE sub-agents before EXEC.' +
        taskInvocation('design-agent', brief);
    }
  },

  'GATE2_VALIDATION_FAILED': {
    subagentType: 'validation-agent',
    category: 'quality',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Gate 2 (Implementation Fidelity) failed for ${ctx.sdId}. Code does not match PRD requirements.`,
        location: 'sd_phase_handoffs.metadata.gate2_validation',
        frequency: 'Blocking EXEC-TO-PLAN handoff',
        priorAttempts: 'Implementation exists but fidelity check failed',
        desiredOutcome: `Validate implementation against PRD. Check: unit tests passing, no stubbed code, correct directory, all FIXME/TODO resolved.`
      });
      return 'Gate 2 implementation fidelity failed. Review PRD alignment.' +
        taskInvocation('validation-agent', brief);
    }
  },

  'GATE2_IMPLEMENTATION_FIDELITY': {
    subagentType: 'validation-agent',
    category: 'quality',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Implementation fidelity check failed for ${ctx.sdId}. Code does not match PRD specifications.`,
        location: 'Implementation files referenced in PRD, sd_phase_handoffs metadata',
        frequency: 'Blocking EXEC-TO-PLAN handoff',
        priorAttempts: 'Code written but fidelity score below threshold',
        desiredOutcome: 'Verify: (1) Unit tests passing, (2) Server restarted and verified, (3) No stubbed/incomplete code, (4) Correct application directory, (5) All FIXME/TODO resolved.'
      });
      return 'Implementation fidelity failed. Fix code quality issues.' +
        taskInvocation('validation-agent', brief);
    }
  },

  'GATE3_VALIDATION_FAILED': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Verify traceability from requirements to implementation to tests. Ensure EXEC-TO-PLAN metadata contains gate2_validation data.'
  },

  'GATE3_TRACEABILITY': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Gate 3 traceability: Verify EXEC followed DESIGN/DATABASE recommendations. Check implementation quality score, test coverage, and PRD-to-code mapping.'
  },

  'GATE4_VALIDATION_FAILED': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Review workflow ROI. Ensure deliverables justify process overhead and answer 6 LEAD pre-approval questions.'
  },

  'GATE4_WORKFLOW_ROI': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Gate 4 workflow ROI: Verify process adherence, business value delivered, and strategic alignment.'
  },

  'GATE5_VALIDATION_FAILED': {
    subagentType: null,
    category: 'git',
    promptFn: (ctx) => 'Git commit verification failed. Run: git status, then commit and push all changes.'
  },

  'GATE5_GIT_COMMIT_ENFORCEMENT': {
    subagentType: null,
    category: 'git',
    promptFn: (ctx) => 'All implementation work must be committed and pushed. Run: git add, git commit, git push.'
  },

  'GATE6_VALIDATION_FAILED': {
    subagentType: null,
    category: 'git',
    promptFn: (ctx) => 'Create a feature branch before starting EXEC work.'
  },

  'GATE6_BRANCH_ENFORCEMENT': {
    subagentType: null,
    category: 'git',
    promptFn: (ctx) => 'Branch enforcement: Create or switch to feature branch for this SD before EXEC.'
  },

  'GATE_ARCHITECTURE_VERIFICATION': {
    subagentType: 'validation-agent',
    category: 'design',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Architecture mismatch detected for ${ctx.sdId}. PRD implementation approach conflicts with actual application framework.`,
        location: 'Target application directory, PRD system_architecture field',
        frequency: 'Blocking PLAN-TO-EXEC — prevents 30-52 hour rework',
        priorAttempts: 'PRD created but may reference wrong framework patterns',
        desiredOutcome: `Verify detected framework matches PRD implementation approach. Common fixes: Vite SPA → Supabase client (not API routes), Next.js → app/api/, Remix → loader/action.`
      });
      return 'Architecture mismatch detected. Verify framework alignment.' +
        taskInvocation('validation-agent', brief);
    }
  },

  'GATE_CONTRACT_COMPLIANCE': {
    subagentType: null,
    category: 'design',
    promptFn: (ctx) => 'PRD violates parent SD contract boundaries. Review allowed_tables and component_paths in parent contract. Cultural design style is inherited and cannot be overridden.'
  },

  'GATE_PRD_EXISTS': {
    subagentType: 'general-purpose',
    category: 'quality',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `No approved PRD found for ${ctx.sdId}. PLAN-TO-EXEC handoff blocked.`,
        location: `product_requirements_v2 table, id=PRD-${ctx.sdId}`,
        frequency: 'Blocking PLAN-TO-EXEC handoff',
        priorAttempts: 'PRD may not exist or may be in "draft" status',
        desiredOutcome: `Create or update PRD for ${ctx.sdId}. Read docs/reference/prd-inline-schema.md for schema. Set status to "approved".`
      });
      return 'PRD required before EXEC phase.' +
        taskInvocation('general-purpose', brief);
    }
  },

  'GATE_EXPLORATION_AUDIT': {
    subagentType: null,
    category: 'quality',
    promptFn: (ctx) => 'Insufficient codebase exploration. Update exploration_summary in PRD: minimum 3 files (5+ recommended), include key_findings for each.'
  },

  'GATE_DELIVERABLES_PLANNING': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Define deliverables in sd_scope_deliverables table before EXEC. They will auto-populate from PRD exec_checklist if available.'
  },

  // ═══════════════════════════════════════════════════
  // BMAD CODES
  // ═══════════════════════════════════════════════════

  'BMAD_VALIDATION_FAILED': {
    subagentType: 'general-purpose',
    category: 'stories',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `BMAD validation failed for ${ctx.sdId}. User stories lack proper acceptance criteria.`,
        location: `user_stories table WHERE sd_id='${ctx.sdId}'`,
        frequency: 'Blocking handoff',
        priorAttempts: 'Stories exist but do not meet BMAD quality standards',
        desiredOutcome: 'Regenerate user stories with proper Given/When/Then acceptance criteria, specific personas, and measurable outcomes.'
      });
      return 'Run STORIES sub-agent to fix acceptance criteria.' +
        taskInvocation('general-purpose', brief);
    }
  },

  'BMAD_PLAN_TO_EXEC_FAILED': {
    subagentType: 'general-purpose',
    category: 'stories',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `BMAD PLAN-TO-EXEC validation failed for ${ctx.sdId}.`,
        location: `user_stories table WHERE sd_id='${ctx.sdId}'`,
        frequency: 'Blocking PLAN-TO-EXEC handoff',
        priorAttempts: 'Handoff attempted but story quality insufficient',
        desiredOutcome: 'Generate or improve user stories with proper acceptance criteria. Each story needs Given/When/Then format.'
      });
      return 'BMAD check failed. Improve user story quality.' +
        taskInvocation('general-purpose', brief);
    }
  },

  'BMAD_EXEC_TO_PLAN_FAILED': {
    subagentType: 'testing-agent',
    category: 'testing',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `BMAD EXEC-TO-PLAN validation failed for ${ctx.sdId}. Test plans incomplete or E2E coverage insufficient.`,
        location: `Test files, playwright-report/, coverage/ directories`,
        frequency: 'Blocking EXEC-TO-PLAN handoff',
        priorAttempts: 'Implementation complete but test coverage insufficient',
        desiredOutcome: 'Complete test plans and achieve 100% E2E test coverage for all user stories.'
      });
      return 'Test plans incomplete. Run TESTING sub-agent.' +
        taskInvocation('testing-agent', brief);
    }
  },

  // ═══════════════════════════════════════════════════
  // TESTING / EVIDENCE CODES
  // ═══════════════════════════════════════════════════

  'MANDATORY_TESTING_VALIDATION': {
    subagentType: 'testing-agent',
    category: 'testing',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `ERR_TESTING_REQUIRED: TESTING sub-agent is mandatory for ${ctx.sdId} (feature/qa SD type).`,
        location: 'Test files, scripts/modules/handoff/executors/exec-to-plan/',
        frequency: 'Blocking EXEC-TO-PLAN handoff',
        priorAttempts: 'Implementation complete but TESTING sub-agent has not been run',
        desiredOutcome: 'Run test suite: unit tests (npm test) and E2E tests (npx playwright test). Achieve passing results. Exempt types: documentation, infrastructure, orchestrator, database.'
      });
      return 'ERR_TESTING_REQUIRED: Run TESTING sub-agent before EXEC-TO-PLAN.' +
        taskInvocation('testing-agent', brief);
    }
  },

  'TEST_EVIDENCE_AUTO_CAPTURE': {
    subagentType: 'testing-agent',
    category: 'testing',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Test evidence not found for ${ctx.sdId}. No test reports in standard locations.`,
        location: 'playwright-report/report.json, test-results/.last-run.json, coverage/coverage-summary.json',
        frequency: 'Advisory gate during EXEC-TO-PLAN',
        priorAttempts: 'Tests may have run but evidence not captured',
        desiredOutcome: 'Run tests to generate evidence: npx playwright test (E2E), npm test -- --coverage (unit). Then: node scripts/test-evidence-ingest.js --sd-id <SD-ID>.'
      });
      return 'Generate test evidence for story_test_mappings.' +
        taskInvocation('testing-agent', brief);
    }
  },

  'E2E_COVERAGE_INCOMPLETE': {
    subagentType: 'testing-agent',
    category: 'testing',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `E2E test coverage incomplete for ${ctx.sdId}. Not all user stories have corresponding tests.`,
        location: `user_stories and story_test_mappings tables`,
        frequency: 'Blocking handoff',
        priorAttempts: 'Some tests exist but coverage is not 100%',
        desiredOutcome: 'Write E2E tests for uncovered user stories. Each story must have at least one passing E2E test.'
      });
      return 'E2E coverage incomplete. Write tests for all user stories.' +
        taskInvocation('testing-agent', brief);
    }
  },

  // ═══════════════════════════════════════════════════
  // RCA / PREREQUISITE / MISC CODES
  // ═══════════════════════════════════════════════════

  'RCA_BLOCKING_ISSUES': {
    subagentType: 'rca-agent',
    category: 'infrastructure',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Blocking RCA issues exist for ${ctx.sdId}. P0/P1 root cause records need verified CAPAs.`,
        location: 'root_cause_records table, capa_actions table',
        frequency: 'Blocking handoff until CAPAs verified',
        priorAttempts: 'RCA exists but CAPAs not yet verified',
        desiredOutcome: 'Verify all CAPAs for P0/P1 RCRs. Run: node scripts/root-cause-agent.js capa verify --capa-id <UUID>'
      });
      return 'Resolve blocking RCA issues before handoff.' +
        taskInvocation('rca-agent', brief);
    }
  },

  'RCA_GATE': {
    subagentType: 'rca-agent',
    category: 'infrastructure',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `RCA gate failed for ${ctx.sdId}. Unresolved P0/P1 root cause records.`,
        location: 'root_cause_records, capa_actions tables',
        frequency: 'Blocking EXEC-TO-PLAN handoff',
        priorAttempts: 'RCA records exist but CAPAs not verified',
        desiredOutcome: 'Run CAPA verification for all P0/P1 issues. Ensure all corrective actions are implemented and verified.'
      });
      return 'RCA gate: Verify all P0/P1 CAPAs.' +
        taskInvocation('rca-agent', brief);
    }
  },

  'SUB_AGENT_ORCHESTRATION': {
    subagentType: 'retro-agent',
    category: 'workflow',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Sub-agent orchestration failed for ${ctx.sdId}. Required sub-agents did not complete successfully.`,
        location: 'Sub-agent results in handoff metadata',
        frequency: 'Blocking handoff',
        priorAttempts: 'Sub-agents were triggered but failed or incomplete',
        desiredOutcome: 'Review sub-agent failures, fix root causes, and re-run failed sub-agents.'
      });
      return 'Fix sub-agent failures before handoff.' +
        taskInvocation('retro-agent', brief);
    }
  },

  'PREREQUISITE_HANDOFF_CHECK': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'ERR_CHAIN_INCOMPLETE: Complete the prerequisite handoff first. Check sd_phase_handoffs for the required prior handoff.'
  },

  'HUMAN_VERIFICATION_GATE': {
    subagentType: 'uat-agent',
    category: 'testing',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Human verification required for ${ctx.sdId}. Feature SDs need verifiable outcomes.`,
        location: 'SD smoke_test_steps, user stories acceptance criteria',
        frequency: 'Blocking EXEC-TO-PLAN for feature SDs',
        priorAttempts: 'Implementation complete but no UAT evidence',
        desiredOutcome: 'Generate and execute UAT tests. Add smoke_test_steps to SD. Verify UX score meets threshold.'
      });
      return 'Feature SDs require human-verifiable outcomes.' +
        taskInvocation('uat-agent', brief);
    }
  },

  // ═══════════════════════════════════════════════════
  // LEAD-FINAL-APPROVAL CODES
  // ═══════════════════════════════════════════════════

  'PLAN_TO_LEAD_HANDOFF_EXISTS': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'PLAN-TO-LEAD handoff must be accepted before final approval. Run: node scripts/handoff.js execute PLAN-TO-LEAD <SD-ID>'
  },

  'USER_STORIES_COMPLETE': {
    subagentType: null,
    category: 'stories',
    promptFn: (ctx) => `All user stories for ${ctx.sdId} must have status "completed" before LEAD-FINAL-APPROVAL.`
  },

  'RETROSPECTIVE_EXISTS': {
    subagentType: 'retro-agent',
    category: 'workflow',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `No quality retrospective found for ${ctx.sdId}. LEAD-FINAL-APPROVAL blocked.`,
        location: `sd_retrospectives table WHERE sd_id='${ctx.sdId}'`,
        frequency: 'Blocking final approval',
        priorAttempts: 'Retrospective not yet generated',
        desiredOutcome: `Generate retrospective for ${ctx.sdId} with quality score >= 60%. Include SD-specific learnings, not boilerplate.`
      });
      return 'Quality retrospective required for final approval.' +
        taskInvocation('retro-agent', brief);
    }
  },

  'RETROSPECTIVE_QUALITY_GATE': {
    subagentType: 'retro-agent',
    category: 'workflow',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Retrospective quality insufficient for ${ctx.sdId}. Contains boilerplate or generic learnings.`,
        location: `sd_retrospectives table WHERE sd_id='${ctx.sdId}'`,
        frequency: 'Blocking PLAN-TO-LEAD handoff',
        priorAttempts: 'Retrospective exists but quality is too low',
        desiredOutcome: 'Replace boilerplate learnings with SD-specific insights. Add at least one concrete improvement area. Ensure key_learnings are not generic phrases.'
      });
      return 'Retrospective quality insufficient. Improve with specific insights.' +
        taskInvocation('retro-agent', brief);
    }
  },

  'PR_MERGE_VERIFICATION': {
    subagentType: 'github-agent',
    category: 'git',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `Unmerged code for ${ctx.sdId}. LEAD-FINAL-APPROVAL requires all PRs merged to main.`,
        location: 'GitHub PRs, feature branches',
        frequency: 'Blocking final approval',
        priorAttempts: 'Code is on feature branch but not merged',
        desiredOutcome: `Merge all open PRs for ${ctx.sdId}. For unmerged branches: push, create PR, merge, then verify on main.`
      });
      return 'All code must be merged to main before completion.' +
        taskInvocation('github-agent', brief);
    }
  },

  // ═══════════════════════════════════════════════════
  // NOT FOUND / SYSTEM CODES
  // ═══════════════════════════════════════════════════

  'SD_NOT_FOUND': {
    subagentType: null,
    category: 'infrastructure',
    promptFn: (ctx) => `SD not found in strategic_directives_v2. Create using: node scripts/leo-create-sd.js`
  },

  'PRD_NOT_FOUND': {
    subagentType: 'general-purpose',
    category: 'quality',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `PRD not found for ${ctx.sdId}. Cannot proceed without PRD.`,
        location: `product_requirements_v2 WHERE sd_id='${ctx.sdId}'`,
        frequency: 'Blocking handoff',
        priorAttempts: 'No PRD created yet',
        desiredOutcome: `Create PRD for ${ctx.sdId}. Read docs/reference/prd-inline-schema.md for schema. Insert into product_requirements_v2.`
      });
      return 'PRD not found. Create one before proceeding.' +
        taskInvocation('general-purpose', brief);
    }
  },

  'TEMPLATE_NOT_FOUND': {
    subagentType: null,
    category: 'infrastructure',
    promptFn: (ctx) => 'Handoff template not found. Contact administrator.'
  },

  'DELIVERABLES_INCOMPLETE': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => `Not all deliverables completed. Query: SELECT * FROM sd_scope_deliverables WHERE sd_id = '<UUID>' AND completion_status != 'completed'`
  },

  'FIDELITY_DATA_MISSING': {
    subagentType: null,
    category: 'workflow',
    promptFn: (ctx) => 'Gate 2 fidelity data missing from EXEC-TO-PLAN handoff. Update sd_phase_handoffs.metadata.gate2_validation with {score, passed, gate_scores}.'
  },

  'BRANCH_ENFORCEMENT_FAILED': {
    subagentType: null,
    category: 'git',
    promptFn: (ctx) => 'Create a feature branch: git checkout -b feat/<SD-ID>-short-description'
  },

  'GIT_COMMIT_VERIFICATION_FAILED': {
    subagentType: null,
    category: 'git',
    promptFn: (ctx) => 'Commit all changes with proper messages before handoff. Run: git status, then commit and push.'
  },

  'USER_STORY_EXISTENCE_GATE': {
    subagentType: 'general-purpose',
    category: 'stories',
    promptFn: (ctx) => {
      const brief = fivePointBrief({
        symptom: `No user stories exist for ${ctx.sdId}. Required for this SD type.`,
        location: `user_stories table WHERE sd_id='${ctx.sdId}'`,
        frequency: 'Blocking PLAN-TO-LEAD handoff',
        priorAttempts: 'Stories were never created for this SD',
        desiredOutcome: `Generate user stories from PRD acceptance criteria. Insert into user_stories table with status "ready".`
      });
      return 'User stories must exist for this SD type.' +
        taskInvocation('general-purpose', brief);
    }
  }
};

/**
 * Get the full remediation message for a rejection code.
 *
 * @param {string} reasonCode - The rejection reason code
 * @param {Object} context - { sdId, gateName, details, score }
 * @returns {{ message: string, subagentType: string|null, category: string } | null}
 */
export function getRemediation(reasonCode, context = {}) {
  const entry = REJECTION_MAP[reasonCode];
  if (!entry) return null;

  return {
    message: entry.promptFn(context),
    subagentType: entry.subagentType,
    category: entry.category
  };
}

/**
 * Get just the sub-agent type for a rejection code.
 *
 * @param {string} reasonCode
 * @returns {string|null}
 */
export function getSubagentType(reasonCode) {
  return REJECTION_MAP[reasonCode]?.subagentType || null;
}

/**
 * Get all rejection codes and their categories.
 *
 * @returns {Array<{ code: string, subagentType: string|null, category: string }>}
 */
export function getAllCodes() {
  return Object.entries(REJECTION_MAP).map(([code, entry]) => ({
    code,
    subagentType: entry.subagentType,
    category: entry.category
  }));
}

/**
 * Check if a rejection code has a sub-agent mapping.
 *
 * @param {string} reasonCode
 * @returns {boolean}
 */
export function hasSubagentMapping(reasonCode) {
  return REJECTION_MAP[reasonCode]?.subagentType != null;
}

export default {
  getRemediation,
  getSubagentType,
  getAllCodes,
  hasSubagentMapping,
  fivePointBrief,
  taskInvocation
};
