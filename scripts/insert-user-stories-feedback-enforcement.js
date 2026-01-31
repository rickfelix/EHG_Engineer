import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map complexity to story points
const complexityToPoints = {
  'S': 3,
  'M': 5,
  'L': 8
};

const stories = [
  {
    sd_id: 'SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001',
    story_key: 'FEEDBACK-ENF:US-001',
    title: 'Resolve feedback with Quick-Fix or Strategic Directive linkage',
    user_role: 'Chairman (Solo Entrepreneur)',
    user_want: 'to resolve feedback items by linking them to a Quick-Fix or Strategic Directive',
    user_benefit: 'every resolved issue has traceable work artifact and I can track ROI on feedback resolution. Every resolved feedback item has a traceable work artifact (QF or SD), enabling ROI tracking, auditability, and preventing feedback from disappearing without action.',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-001-1',
        scenario: 'Happy path - Resolve feedback with Quick-Fix link',
        given: 'A feedback item exists with status="open" AND a valid Quick-Fix record exists',
        when: 'User sets feedback.quick_fix_id to the QF id AND sets status="resolved"',
        then: 'Database UPDATE succeeds AND feedback.status="resolved" AND feedback.quick_fix_id is populated',
        test_data: { feedback_id: 'fb-123', quick_fix_id: 'QF-20260131-001', status: 'open' }
      },
      {
        id: 'AC-001-2',
        scenario: 'Happy path - Resolve feedback with Strategic Directive link',
        given: 'A feedback item exists with status="open" AND a valid SD exists',
        when: 'User sets feedback.strategic_directive_id to the SD id AND sets status="resolved"',
        then: 'Database UPDATE succeeds AND feedback.status="resolved" AND feedback.strategic_directive_id is populated',
        test_data: { feedback_id: 'fb-124', sd_id: 'SD-TEST-001', status: 'open' }
      },
      {
        id: 'AC-001-3',
        scenario: 'Error path - Attempt to resolve without linkage',
        given: 'A feedback item exists with status="open" AND quick_fix_id IS NULL AND strategic_directive_id IS NULL',
        when: 'User attempts to set status="resolved" without setting quick_fix_id or strategic_directive_id',
        then: 'Database UPDATE fails with constraint error AND API returns HTTP 409 with message "Resolved requires a Quick-Fix or Strategic Directive link."',
        expected_error: 'Resolved requires a Quick-Fix or Strategic Directive link.'
      },
      {
        id: 'AC-001-4',
        scenario: 'Edge case - Resolve with both QF and SD linked',
        given: 'A feedback item exists with status="open"',
        when: 'User sets both quick_fix_id and strategic_directive_id AND sets status="resolved"',
        then: 'Database UPDATE succeeds AND both linkages are preserved',
        test_data: { feedback_id: 'fb-125', quick_fix_id: 'QF-20260131-002', sd_id: 'SD-TEST-002' }
      }
    ]),
    story_points: complexityToPoints['M'],
    priority: 'critical',
    status: 'draft',
    implementation_context: JSON.stringify({
      database_tables: ['feedback', 'quick_fixes', 'strategic_directives_v2'],
      constraints: ['CHECK constraint: (status != "resolved" OR quick_fix_id IS NOT NULL OR strategic_directive_id IS NOT NULL)'],
      api_endpoints: ['PUT /api/feedback/:id', 'PATCH /api/feedback/:id/status'],
      ui_components: ['FeedbackStatusDialog.tsx', 'FeedbackLinkSelector.tsx']
    }),
    architecture_references: JSON.stringify({
      similar_components: ['scripts/create-quick-fix.js', 'database/migrations/*_feedback_*.sql'],
      patterns_to_follow: ['CHECK constraint pattern', 'Foreign key with ON DELETE RESTRICT', 'API constraint error mapping'],
      integration_points: ['Feedback API Service -> Database', 'UI -> Feedback API']
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/feedback/US-FEEDBACK-001-resolve-with-linkage.spec.ts',
      test_cases: [
        { id: 'TC-001', scenario: 'Resolve with QF link', priority: 'P0' },
        { id: 'TC-002', scenario: 'Resolve with SD link', priority: 'P0' },
        { id: 'TC-003', scenario: 'Reject resolve without link', priority: 'P0' },
        { id: 'TC-004', scenario: 'Resolve with both links', priority: 'P2' }
      ],
      edge_cases: [
        'Both quick_fix_id and strategic_directive_id populated (should succeed)',
        'Foreign key violation if QF/SD id does not exist (should fail with FK error)',
        'Concurrent updates to same feedback item'
      ]
    })
  },
  {
    sd_id: 'SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001',
    story_key: 'FEEDBACK-ENF:US-002',
    title: 'Mark feedback as wont_fix with required justification',
    user_role: 'Chairman (Solo Entrepreneur)',
    user_want: 'to mark feedback as "wont_fix" with a clear justification in resolution_notes',
    user_benefit: 'stakeholders understand why an issue was not addressed and I can avoid repetitive "why wasn\'t this fixed?" questions. All wont_fix decisions are documented with justification, reducing ambiguity, preventing re-opening of decided issues, and providing audit trail for strategic decisions.',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-002-1',
        scenario: 'Happy path - Mark as wont_fix with notes',
        given: 'A feedback item exists with status="open"',
        when: 'User sets status="wont_fix" AND provides resolution_notes with non-empty text',
        then: 'Database UPDATE succeeds AND feedback.status="wont_fix" AND feedback.resolution_notes is populated',
        test_data: { feedback_id: 'fb-201', status: 'open', resolution_notes: 'Out of scope for MVP, conflicts with core design principle' }
      },
      {
        id: 'AC-002-2',
        scenario: 'Error path - Attempt wont_fix without notes',
        given: 'A feedback item exists with status="open"',
        when: 'User sets status="wont_fix" AND resolution_notes IS NULL',
        then: 'Database UPDATE fails with constraint error AND API returns message "Wont fix requires resolution notes."',
        expected_error: 'Wont fix requires resolution notes.'
      },
      {
        id: 'AC-002-3',
        scenario: 'Error path - Attempt wont_fix with whitespace-only notes',
        given: 'A feedback item exists with status="open"',
        when: 'User sets status="wont_fix" AND resolution_notes contains only whitespace ("   ")',
        then: 'Database UPDATE fails with constraint error (trim check) AND API returns message "Wont fix requires resolution notes."',
        expected_error: 'Wont fix requires resolution notes.'
      },
      {
        id: 'AC-002-4',
        scenario: 'Edge case - Update existing wont_fix notes',
        given: 'A feedback item exists with status="wont_fix" AND resolution_notes="Initial reason"',
        when: 'User updates resolution_notes to "Updated reason with more context"',
        then: 'Database UPDATE succeeds AND resolution_notes reflects new value',
        test_data: { feedback_id: 'fb-202', old_notes: 'Initial reason', new_notes: 'Updated reason with more context' }
      }
    ]),
    story_points: complexityToPoints['S'],
    priority: 'critical',
    status: 'draft',
    implementation_context: JSON.stringify({
      database_tables: ['feedback'],
      constraints: ['CHECK constraint: (status != "wont_fix" OR (resolution_notes IS NOT NULL AND trim(resolution_notes) != ""))'],
      api_endpoints: ['PUT /api/feedback/:id', 'PATCH /api/feedback/:id/status'],
      ui_components: ['FeedbackStatusDialog.tsx', 'ResolutionNotesTextarea.tsx']
    }),
    architecture_references: JSON.stringify({
      similar_components: ['database/migrations/*_feedback_*.sql'],
      patterns_to_follow: ['CHECK constraint with trim() function', 'API validation with user-friendly messages'],
      integration_points: ['Feedback API Service -> Database', 'UI -> Feedback API']
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/feedback/US-FEEDBACK-002-wont-fix-with-notes.spec.ts',
      test_cases: [
        { id: 'TC-005', scenario: 'Wont fix with valid notes', priority: 'P0' },
        { id: 'TC-006', scenario: 'Reject wont fix without notes', priority: 'P0' },
        { id: 'TC-007', scenario: 'Reject wont fix with whitespace', priority: 'P1' },
        { id: 'TC-008', scenario: 'Update existing notes', priority: 'P2' }
      ],
      edge_cases: [
        'Resolution notes with special characters/emojis (should preserve)',
        'Very long resolution notes (test VARCHAR limits)',
        'Concurrent updates to resolution_notes'
      ]
    })
  },
  {
    sd_id: 'SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001',
    story_key: 'FEEDBACK-ENF:US-003',
    title: 'Mark feedback as duplicate with canonical reference',
    user_role: 'EVA (AI Chief of Staff)',
    user_want: 'to mark feedback as "duplicate" by referencing the canonical feedback item',
    user_benefit: 'I can deduplicate the feedback backlog systematically and trace all related reports back to a single source of truth. Duplicate feedback items are traceable to canonical feedback, reducing backlog noise, enabling aggregation of related issues, and preventing accidental resolution of duplicates as independent items.',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-003-1',
        scenario: 'Happy path - Mark as duplicate with valid reference',
        given: 'Two feedback items exist: A (id=1) and B (id=2)',
        when: 'User sets B.status="duplicate" AND B.duplicate_of_id=1',
        then: 'Database UPDATE succeeds AND B.status="duplicate" AND B.duplicate_of_id=1',
        test_data: { feedback_a_id: 1, feedback_b_id: 2, duplicate_of_id: 1 }
      },
      {
        id: 'AC-003-2',
        scenario: 'Error path - Attempt duplicate without reference',
        given: 'A feedback item exists (id=1)',
        when: 'User sets status="duplicate" AND duplicate_of_id IS NULL',
        then: 'Database UPDATE fails with constraint error AND API returns message "Duplicate requires a valid duplicate_of_id (not self)."',
        expected_error: 'Duplicate requires a valid duplicate_of_id (not self).'
      },
      {
        id: 'AC-003-3',
        scenario: 'Error path - Attempt self-duplicate',
        given: 'A feedback item exists (id=1)',
        when: 'User sets status="duplicate" AND duplicate_of_id=1 (same row)',
        then: 'Database UPDATE fails with constraint error AND API returns message "Duplicate requires a valid duplicate_of_id (not self)." with invalid id',
        expected_error: 'Duplicate requires a valid duplicate_of_id (not self).'
      },
      {
        id: 'AC-003-4',
        scenario: 'Error path - Foreign key violation (non-existent reference)',
        given: 'A feedback item exists (id=1)',
        when: 'User sets status="duplicate" AND duplicate_of_id=999 (does not exist)',
        then: 'Database UPDATE fails with foreign key constraint error',
        expected_error: 'Foreign key violation'
      }
    ]),
    story_points: complexityToPoints['M'],
    priority: 'critical',
    status: 'draft',
    implementation_context: JSON.stringify({
      database_tables: ['feedback'],
      constraints: [
        'CHECK constraint: (status != "duplicate" OR duplicate_of_id IS NOT NULL)',
        'CHECK constraint: duplicate_of_id != id (no self-reference)',
        'FOREIGN KEY: duplicate_of_id -> feedback.id ON DELETE RESTRICT'
      ],
      api_endpoints: ['PUT /api/feedback/:id', 'PATCH /api/feedback/:id/status'],
      ui_components: ['FeedbackStatusDialog.tsx', 'DuplicateSelector.tsx']
    }),
    architecture_references: JSON.stringify({
      similar_components: ['database/migrations/*_feedback_*.sql'],
      patterns_to_follow: ['Self-referential foreign key', 'CHECK constraint preventing self-reference', 'ON DELETE RESTRICT for referential integrity'],
      integration_points: ['Feedback API Service -> Database', 'UI -> Feedback API']
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/feedback/US-FEEDBACK-003-mark-duplicate.spec.ts',
      test_cases: [
        { id: 'TC-009', scenario: 'Mark as duplicate with valid ref', priority: 'P0' },
        { id: 'TC-010', scenario: 'Reject duplicate without ref', priority: 'P0' },
        { id: 'TC-011', scenario: 'Reject self-duplicate', priority: 'P0' },
        { id: 'TC-012', scenario: 'Reject non-existent ref (FK)', priority: 'P1' }
      ],
      edge_cases: [
        'Duplicate of duplicate (B->A, C->B) - should track transitively',
        'Circular duplicate references (prevented by self-ref check)',
        'Deleting canonical feedback when duplicates exist (ON DELETE RESTRICT should prevent)'
      ]
    })
  },
  {
    sd_id: 'SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001',
    story_key: 'FEEDBACK-ENF:US-004',
    title: 'Mark feedback as invalid without additional requirements',
    user_role: 'EVA (AI Chief of Staff)',
    user_want: 'to mark feedback as "invalid" without requiring QF/SD linkage or resolution notes',
    user_benefit: 'I can quickly filter out spam, malformed submissions, or non-actionable reports without unnecessary overhead. Invalid feedback can be marked quickly without bureaucratic overhead, streamlining backlog hygiene and allowing focus on actionable items.',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-004-1',
        scenario: 'Happy path - Mark as invalid with no linkage',
        given: 'A feedback item exists with status="open" AND all linkage fields NULL',
        when: 'User sets status="invalid"',
        then: 'Database UPDATE succeeds AND feedback.status="invalid" AND all linkage fields remain NULL',
        test_data: { feedback_id: 'fb-301', status: 'open' }
      },
      {
        id: 'AC-004-2',
        scenario: 'Happy path - Insert new feedback as invalid',
        given: 'No existing feedback record',
        when: 'System inserts new feedback with status="invalid" AND all linkage fields NULL',
        then: 'Database INSERT succeeds AND feedback.status="invalid"',
        test_data: { feedback_id: 'fb-302', status: 'invalid' }
      },
      {
        id: 'AC-004-3',
        scenario: 'Edge case - Invalid with optional linkage (should allow)',
        given: 'A feedback item exists',
        when: 'User sets status="invalid" AND optionally includes resolution_notes for context',
        then: 'Database UPDATE succeeds AND notes are preserved',
        test_data: { feedback_id: 'fb-303', status: 'invalid', resolution_notes: 'Spam submission' }
      }
    ]),
    story_points: complexityToPoints['S'],
    priority: 'high',
    status: 'draft',
    implementation_context: JSON.stringify({
      database_tables: ['feedback'],
      constraints: ['CHECK constraints for other statuses must NOT block status="invalid"'],
      api_endpoints: ['PUT /api/feedback/:id', 'PATCH /api/feedback/:id/status'],
      ui_components: ['FeedbackStatusDialog.tsx']
    }),
    architecture_references: JSON.stringify({
      similar_components: ['database/migrations/*_feedback_*.sql'],
      patterns_to_follow: ['CHECK constraint exclusion pattern (status != X OR ...)'],
      integration_points: ['Feedback API Service -> Database', 'UI -> Feedback API']
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/feedback/US-FEEDBACK-004-mark-invalid.spec.ts',
      test_cases: [
        { id: 'TC-013', scenario: 'Mark as invalid (no constraints)', priority: 'P0' },
        { id: 'TC-014', scenario: 'Insert as invalid', priority: 'P1' },
        { id: 'TC-015', scenario: 'Invalid with optional notes', priority: 'P2' }
      ],
      edge_cases: [
        'Transition from any status to invalid (should always succeed)',
        'Invalid feedback with all linkage fields populated (should allow but not require)'
      ]
    })
  },
  {
    sd_id: 'SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001',
    story_key: 'FEEDBACK-ENF:US-005',
    title: 'Assist workflow creates Quick-Fix automatically for Phase 1 feedback',
    user_role: 'EVA (AI Chief of Staff)',
    user_want: 'Phase 1 feedback resolution to automatically invoke the /quick-fix skill, create a QF record, link it to the feedback, and then resolve',
    user_benefit: '100% of Phase 1 resolutions have traceable work artifacts without manual intervention. Phase 1 feedback resolution is fully automated with guaranteed traceability, eliminating manual QF creation, preventing bypass, and ensuring consistent workflow compliance.',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-005-1',
        scenario: 'Happy path - Assist creates QF and resolves',
        given: 'A Phase 1 feedback item exists AND Assist workflow is enabled AND /quick-fix endpoint returns 201 with quick_fix_id',
        when: 'Assist initiates resolution for the feedback item',
        then: 'System calls /quick-fix with feedback_id AND persists feedback.quick_fix_id AND sets feedback.status="resolved" AND observability logs include correlation_id and quick_fix_id',
        test_data: { feedback_id: 'fb-401', phase: 1, quick_fix_id: 'QF-20260131-003' }
      },
      {
        id: 'AC-005-2',
        scenario: 'Error path - /quick-fix fails (500 error)',
        given: 'A Phase 1 feedback item exists AND /quick-fix returns 500',
        when: 'Assist initiates resolution',
        then: 'Feedback status remains unchanged (not resolved) AND workflow returns failure state AND logs include error category="quick_fix_create_failed" AND metrics increment failure counter',
        expected_error: 'quick_fix_create_failed'
      },
      {
        id: 'AC-005-3',
        scenario: 'Error path - /quick-fix timeout',
        given: 'A Phase 1 feedback item exists AND /quick-fix times out',
        when: 'Assist initiates resolution',
        then: 'Feedback status remains unchanged AND workflow returns failure state AND logs include timeout error',
        expected_error: 'timeout'
      },
      {
        id: 'AC-005-4',
        scenario: 'Edge case - Idempotency on retry',
        given: 'Assist previously called /quick-fix with feedback_id as idempotency key',
        when: 'Assist retries resolution (network issue)',
        then: '/quick-fix returns existing quick_fix_id (idempotent) AND feedback is resolved without creating duplicate QF',
        test_data: { feedback_id: 'fb-402', idempotency_key: 'fb-402', retry_count: 2 }
      }
    ]),
    story_points: complexityToPoints['L'],
    priority: 'high',
    status: 'draft',
    implementation_context: JSON.stringify({
      workflow_components: ['Assist Workflow Orchestrator', 'Quick-Fix Service'],
      api_endpoints: ['POST /api/quick-fix (skill endpoint)', 'PATCH /api/feedback/:id'],
      retry_policy: 'Exponential backoff, max 3 retries, 30s timeout',
      idempotency: 'Key by feedback_id to prevent duplicate QF creation',
      observability: ['Metrics: quick_fix_create_success/failure', 'Logs: correlation_id, feedback_id, quick_fix_id']
    }),
    architecture_references: JSON.stringify({
      similar_components: ['scripts/create-quick-fix.js', 'lib/assist/workflow-orchestrator.js'],
      patterns_to_follow: ['Idempotent API calls', 'Retry with exponential backoff', 'Correlation ID tracing'],
      integration_points: ['Assist Workflow -> /quick-fix skill', 'Assist Workflow -> Feedback API', 'Workflow -> Observability Stack']
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/feedback/US-FEEDBACK-005-assist-auto-quickfix.spec.ts',
      test_cases: [
        { id: 'TC-016', scenario: 'Assist creates QF and resolves', priority: 'P0' },
        { id: 'TC-017', scenario: 'Assist handles /quick-fix failure', priority: 'P0' },
        { id: 'TC-018', scenario: 'Assist handles timeout', priority: 'P1' },
        { id: 'TC-019', scenario: 'Idempotent retry', priority: 'P1' }
      ],
      edge_cases: [
        'Concurrent resolution attempts for same feedback (idempotency key prevents duplicates)',
        '/quick-fix returns malformed response (should fail gracefully)',
        'Database constraint blocks resolution after QF creation (rollback QF or leave orphaned?)'
      ]
    })
  },
  {
    sd_id: 'SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001',
    story_key: 'FEEDBACK-ENF:US-006',
    title: 'View actionable error messages when constraints block status changes',
    user_role: 'Chairman (Solo Entrepreneur)',
    user_want: 'when a database constraint blocks a feedback status change, to see a clear, actionable error message telling me exactly what is required',
    user_benefit: 'I can fix the issue immediately without digging through logs or asking DevOps. Constraint violations provide immediate, actionable guidance, reducing friction, eliminating support requests, and enabling self-service resolution.',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-006-1',
        scenario: 'Resolved without linkage - friendly error',
        given: 'User attempts to resolve feedback without QF/SD link',
        when: 'Database constraint blocks the update',
        then: 'API returns HTTP 409 with message "Resolved requires a Quick-Fix or Strategic Directive link." AND raw constraint name logged for DevOps',
        expected_error: 'Resolved requires a Quick-Fix or Strategic Directive link.'
      },
      {
        id: 'AC-006-2',
        scenario: 'Wont fix without notes - friendly error',
        given: 'User attempts to set status="wont_fix" without resolution_notes',
        when: 'Database constraint blocks the update',
        then: 'API returns HTTP 409 with message "Wont fix requires resolution notes." AND raw constraint name logged',
        expected_error: 'Wont fix requires resolution notes.'
      },
      {
        id: 'AC-006-3',
        scenario: 'Duplicate without reference - friendly error',
        given: 'User attempts to set status="duplicate" without duplicate_of_id',
        when: 'Database constraint blocks the update',
        then: 'API returns HTTP 409 with message "Duplicate requires a valid duplicate_of_id (not self)." AND if duplicate_of_id was provided, includes the invalid id',
        expected_error: 'Duplicate requires a valid duplicate_of_id (not self).'
      },
      {
        id: 'AC-006-4',
        scenario: 'Logs include correlation ID for DevOps',
        given: 'Any constraint violation occurs',
        when: 'Error is logged',
        then: 'Log entry includes correlation_id, raw constraint name, user_id, feedback_id for debugging',
        test_data: { correlation_id: 'req-12345', constraint: 'chk_feedback_resolved_linkage' }
      }
    ]),
    story_points: complexityToPoints['M'],
    priority: 'medium',
    status: 'draft',
    implementation_context: JSON.stringify({
      api_components: ['Constraint Error Mapper', 'Error Response Formatter'],
      constraint_names: [
        'chk_feedback_resolved_linkage -> "Resolved requires a Quick-Fix or Strategic Directive link."',
        'chk_feedback_wont_fix_notes -> "Wont fix requires resolution notes."',
        'chk_feedback_duplicate_ref -> "Duplicate requires a valid duplicate_of_id (not self)."'
      ],
      logging: ['Include: correlation_id, constraint_name, user_id, feedback_id, timestamp']
    }),
    architecture_references: JSON.stringify({
      similar_components: ['lib/api/error-handler.js', 'lib/api/constraint-mapper.js'],
      patterns_to_follow: ['Error mapping middleware', 'Structured logging', 'User-friendly vs DevOps-friendly errors'],
      integration_points: ['Feedback API -> Error Mapper -> Response', 'Error Handler -> Observability Stack']
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/feedback/US-FEEDBACK-006-constraint-error-messages.spec.ts',
      test_cases: [
        { id: 'TC-020', scenario: 'Resolved constraint error message', priority: 'P0' },
        { id: 'TC-021', scenario: 'Wont fix constraint error message', priority: 'P0' },
        { id: 'TC-022', scenario: 'Duplicate constraint error message', priority: 'P0' },
        { id: 'TC-023', scenario: 'Logs include correlation ID', priority: 'P1' }
      ],
      edge_cases: [
        'Multiple constraint violations in same request (return all errors or first?)',
        'Unknown constraint name (fallback to generic error)',
        'Database error vs application error (distinguish clearly)'
      ]
    })
  },
  {
    sd_id: 'SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001',
    story_key: 'FEEDBACK-ENF:US-007',
    title: 'Monitor constraint violations and alert on anomalies',
    user_role: 'DevOps Engineer',
    user_want: 'to monitor constraint violation rates by type and receive alerts when violations spike',
    user_benefit: 'I can detect rollout issues, workflow failures, or attempted bypasses before they impact users. Proactive detection of issues via metrics/alerts prevents silent failures, enables rapid response to workflow bugs, and provides visibility into enforcement effectiveness.',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-007-1',
        scenario: 'Metrics emitted for constraint violations',
        given: 'Database constraint blocks a status change',
        when: 'Constraint violation occurs',
        then: 'Metric counter increments for constraint type (resolved_linkage, wont_fix_notes, duplicate_ref) AND metric includes labels: constraint_type, endpoint, user_role',
        test_data: { constraint_type: 'resolved_linkage', endpoint: '/api/feedback/123', user_role: 'chairman' }
      },
      {
        id: 'AC-007-2',
        scenario: 'Metrics emitted for /quick-fix workflow outcomes',
        given: 'Assist workflow calls /quick-fix',
        when: 'Workflow completes (success or failure)',
        then: 'Metric counter increments for outcome (success/failure) AND metric includes labels: outcome, retry_count, duration_ms',
        test_data: { outcome: 'success', retry_count: 1, duration_ms: 250 }
      },
      {
        id: 'AC-007-3',
        scenario: 'Alert on constraint violation spike',
        given: 'Constraint violation rate for resolved_linkage exceeds 10/minute for 5 minutes',
        when: 'Alert threshold breached',
        then: 'Alert fires with title "High constraint violation rate: resolved_linkage" AND includes dashboard link AND runbook link',
        expected_alert: 'High constraint violation rate: resolved_linkage'
      },
      {
        id: 'AC-007-4',
        scenario: 'Alert on /quick-fix failure rate',
        given: '/quick-fix failure rate exceeds 2% over 15 minutes',
        when: 'Alert threshold breached',
        then: 'Alert fires with title "Quick-Fix creation failures elevated" AND includes recent error samples',
        expected_alert: 'Quick-Fix creation failures elevated'
      }
    ]),
    story_points: complexityToPoints['M'],
    priority: 'medium',
    status: 'draft',
    implementation_context: JSON.stringify({
      observability_components: ['Metrics Emitter', 'Alert Manager', 'Dashboard'],
      metrics: [
        'constraint_violation_count{constraint_type, endpoint, user_role}',
        'quick_fix_create_outcome{outcome, retry_count}',
        'quick_fix_create_duration_ms{outcome}'
      ],
      alerts: [
        'ConstraintViolationSpike: rate > 10/min for 5min',
        'QuickFixFailureRateHigh: failure_rate > 2% over 15min'
      ],
      dashboards: ['Feedback Resolution Enforcement Dashboard', '/quick-fix Workflow Health Dashboard']
    }),
    architecture_references: JSON.stringify({
      similar_components: ['lib/observability/metrics-emitter.js', 'config/alerts/*.yaml'],
      patterns_to_follow: ['Structured metrics with labels', 'Alert thresholds with runbooks', 'Sampling for high-volume events'],
      integration_points: ['Feedback API -> Metrics Emitter', 'Assist Workflow -> Metrics Emitter', 'Metrics -> Alert Manager']
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/feedback/US-FEEDBACK-007-monitoring-alerts.spec.ts',
      test_cases: [
        { id: 'TC-024', scenario: 'Constraint violation metrics emitted', priority: 'P0' },
        { id: 'TC-025', scenario: '/quick-fix outcome metrics emitted', priority: 'P0' },
        { id: 'TC-026', scenario: 'Constraint spike alert fires', priority: 'P1' },
        { id: 'TC-027', scenario: '/quick-fix failure alert fires', priority: 'P1' }
      ],
      edge_cases: [
        'High volume of legitimate violations (e.g., bulk import) - use sampling',
        'Alert fatigue from repeated spikes - implement alert dampening',
        'Metrics lag during observability system outage'
      ]
    })
  }
];

async function insertStories() {
  console.log(`Inserting ${stories.length} user stories for SD-LEO-INFRA-FEEDBACK-RESOLUTION-ENFORCEMENT-001...\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const story of stories) {
    const { data, error } = await sb.from('user_stories').insert(story).select();
    if (error) {
      console.error(`❌ Error inserting ${story.story_key}:`, error.message);
      errorCount++;
    } else {
      console.log(`✅ Inserted ${story.story_key}: ${story.title}`);
      successCount++;
    }
  }

  console.log('\n=== User Story Generation Summary ===');
  console.log(`Total stories: ${stories.length}`);
  console.log(`Successfully inserted: ${successCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log('\nCoverage by persona:');
  console.log('  - Chairman: 3 stories (US-FEEDBACK-001, US-FEEDBACK-002, US-FEEDBACK-006)');
  console.log('  - EVA: 3 stories (US-FEEDBACK-003, US-FEEDBACK-004, US-FEEDBACK-005)');
  console.log('  - DevOps: 1 story (US-FEEDBACK-007)');
  console.log('\nComplexity distribution:');
  console.log('  - Small (3 pts): 2 stories');
  console.log('  - Medium (5 pts): 4 stories');
  console.log('  - Large (8 pts): 1 story');
  console.log('\nPriority distribution:');
  console.log('  - Critical: 4 stories');
  console.log('  - High: 2 stories');
  console.log('  - Medium: 1 story');
  console.log(`\nTotal story points: ${stories.reduce((sum, s) => sum + s.story_points, 0)}`);
}

insertStories()
  .then(() => {
    console.log('\n✅ User story insertion complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  });
