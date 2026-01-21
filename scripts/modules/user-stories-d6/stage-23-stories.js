/**
 * User Stories for Stage 23: Production Launch
 * Part of SD-VISION-TRANSITION-001D6 (Stages 21-25: LAUNCH & LEARN)
 *
 * @module stage-23-stories
 */

export const stage23Stories = [
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-023001',
    title: 'Go/No-Go Decision Gate with Multi-Dimensional Assessment',
    user_role: 'Product Manager',
    user_want: 'evaluate venture readiness across marketing, technical, operational, and legal dimensions before launch',
    user_benefit: 'I can make informed go/no-go decisions based on comprehensive readiness assessment',
    story_points: 8,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-23-001-1',
        scenario: 'Happy path - Complete readiness checklist',
        given: 'Venture is in Go/No-Go stage AND user has decision authority',
        when: 'User evaluates all 4 readiness categories (marketing, technical, operational, legal) AND marks checklist items as complete/incomplete AND system calculates readiness scores',
        then: 'Overall readiness score calculated AND category scores displayed (each 0-100%) AND recommendation shown (GO if all >= 80%, NO-GO otherwise) AND decision recorded in venture_stage_work'
      },
      {
        id: 'AC-23-001-2',
        scenario: 'Happy path - GO decision approved',
        given: 'Readiness scores are: Marketing 90%, Technical 95%, Operational 85%, Legal 100%',
        when: 'User reviews assessment AND clicks "Approve Launch" AND Chairman approves',
        then: 'Venture status remains "active" AND venture advances to Stage 24 (Analytics) AND launch decision logged AND team notified'
      },
      {
        id: 'AC-23-001-3',
        scenario: 'Happy path - NO-GO decision triggers Kill Protocol',
        given: 'Readiness scores are: Marketing 60%, Technical 50%, Operational 40%, Legal 75%',
        when: 'User reviews assessment AND clicks "Kill Venture" AND enters kill reason AND confirms',
        then: 'Kill Protocol triggered (US-D6-23-002) AND venture status = "killed" AND kill event logged AND team notified'
      },
      {
        id: 'AC-23-001-4',
        scenario: 'Edge case - Chairman approval integration',
        given: 'User approves launch AND Chairman approval required',
        when: 'System requests Chairman approval',
        then: 'Approval request sent to Chairman AND decision pending until approval received AND venture cannot advance without approval'
      }
    ]),
    definition_of_done: JSON.stringify([
      'Go/No-Go UI implemented with 4 readiness categories',
      'Auto-calculated readiness scores working',
      'Chairman approval integration functional',
      'Decision recorded in venture_stage_work',
      'E2E test US-D6-23-001 passing'
    ]),
    implementation_context: 'Build readiness checklist with 4 main categories, each with subcategory checkboxes. Calculate readiness score as (completed items / total items) * 100 per category. Store decision in venture_stage_work with work_type = "go_no_go_decision". Integrate with Chairman approval workflow (may be separate system or database flag).',
    architecture_references: JSON.stringify({
      decision_workflow: [
        'Checklist component pattern',
        'Approval workflow integration',
        'venture_stage_work decision recording'
      ],
      patterns_to_follow: [
        'Multi-step form with validation',
        'Score calculation logic',
        'Approval workflow pattern'
      ],
      integration_points: [
        'venture_stage_work table',
        'ventures table (status field)',
        'Chairman approval system'
      ]
    }),
    example_code_patterns: JSON.stringify({
      readiness_calculation: `
const calculateReadiness = (checklist) => {
  const categories = ['marketing', 'technical', 'operational', 'legal'];
  const scores = categories.map(cat => {
    const items = checklist[cat];
    const completed = items.filter(i => i.completed).length;
    return (completed / items.length) * 100;
  });
  const overall = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { categories: scores, overall, recommendation: overall >= 80 ? 'GO' : 'NO-GO' };
};
      `,
      decision_record: `
await supabase.from('venture_stage_work').insert({
  venture_id: ventureId,
  stage_number: 23,
  work_type: 'go_no_go_decision',
  work_data: {
    decision: 'GO',
    readiness_scores: { marketing: 90, technical: 95, operational: 85, legal: 100 },
    decided_by: userId,
    decided_at: new Date().toISOString(),
    chairman_approved: true
  }
});
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-23-001-go-no-go-decision.spec.ts',
      test_cases: [
        { id: 'TC-23-001-1', scenario: 'GO decision with high readiness', priority: 'P0' },
        { id: 'TC-23-001-2', scenario: 'NO-GO decision triggers Kill Protocol', priority: 'P0' },
        { id: 'TC-23-001-3', scenario: 'Chairman approval integration', priority: 'P1' }
      ]
    })
  },
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-023002',
    title: 'Kill Protocol Execution',
    user_role: 'System',
    user_want: 'automatically execute Kill Protocol when venture fails decision gate',
    user_benefit: 'Venture is properly archived, all work cancelled, and resources released',
    story_points: 5,
    priority: 'critical',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-23-002-1',
        scenario: 'Happy path - Kill Protocol triggered',
        given: 'Venture receives NO-GO decision from decision gate',
        when: 'Kill Protocol executes',
        then: 'ventures.status = "killed" AND all open SDs for venture cancelled (status = "cancelled") AND all pending venture_stage_work marked cancelled AND kill event logged with reason AND venture visible in archive but cannot progress'
      },
      {
        id: 'AC-23-002-2',
        scenario: 'Happy path - Kill event logging',
        given: 'Kill Protocol is triggered',
        when: 'System logs kill event',
        then: 'Kill event stored in venture_stage_work with kill reason AND timestamp recorded AND user who initiated kill recorded AND kill reason visible in venture details'
      },
      {
        id: 'AC-23-002-3',
        scenario: 'Happy path - Cancelled SDs',
        given: 'Venture has 3 open SDs: 1 in PLAN, 2 in EXEC',
        when: 'Kill Protocol executes',
        then: 'All 3 SDs status set to "cancelled" AND SD cannot be resumed AND SD visible in history with "Cancelled due to venture kill" note'
      },
      {
        id: 'AC-23-002-4',
        scenario: 'Edge case - Venture archive visibility',
        given: 'Venture is killed',
        when: 'User searches for killed venture',
        then: 'Venture visible in archive/history view AND clearly marked as "KILLED" AND kill reason displayed AND venture NOT editable AND no new SDs can be created'
      },
      {
        id: 'AC-23-002-5',
        scenario: 'Error path - Atomic transaction',
        given: 'Kill Protocol execution starts',
        when: 'One step fails (e.g., SD cancellation fails)',
        then: 'Entire transaction rolled back AND venture status NOT changed AND error logged AND retry mechanism triggered OR manual intervention required'
      }
    ]),
    definition_of_done: JSON.stringify([
      'Kill Protocol execution implemented',
      'Atomic transaction ensures data integrity',
      'All related records updated (ventures, SDs, stage work)',
      'Kill event logging working',
      'E2E test US-D6-23-002 passing'
    ]),
    implementation_context: 'Implement Kill Protocol as database transaction to ensure atomicity. Update ventures table status to "killed", set all strategic_directives_v2 records with matching venture_id to status = "cancelled", mark all venture_stage_work as cancelled. Log kill event in venture_stage_work. Must complete within 2s as per performance requirements.',
    architecture_references: JSON.stringify({
      transaction_pattern: [
        'Database transaction for atomicity',
        'Cascade update pattern',
        'Event logging pattern'
      ],
      patterns_to_follow: [
        'ACID transaction principles',
        'Error handling and rollback',
        'Audit logging'
      ],
      integration_points: [
        'ventures table',
        'strategic_directives_v2 table',
        'venture_stage_work table'
      ]
    }),
    example_code_patterns: JSON.stringify({
      kill_protocol_transaction: `
await supabase.rpc('execute_kill_protocol', {
  p_venture_id: ventureId,
  p_kill_reason: killReason,
  p_killed_by: userId
});

-- SQL function:
CREATE OR REPLACE FUNCTION execute_kill_protocol(
  p_venture_id UUID,
  p_kill_reason TEXT,
  p_killed_by TEXT
) RETURNS void AS $$
BEGIN
  -- Update venture status
  UPDATE ventures SET status = 'killed' WHERE id = p_venture_id;

  -- Cancel all open SDs
  UPDATE strategic_directives_v2
  SET status = 'cancelled',
      metadata = metadata || jsonb_build_object('kill_reason', p_kill_reason)
  WHERE venture_id = p_venture_id AND status != 'completed';

  -- Cancel pending stage work
  UPDATE venture_stage_work
  SET status = 'cancelled'
  WHERE venture_id = p_venture_id AND status = 'pending';

  -- Log kill event
  INSERT INTO venture_stage_work (venture_id, stage_number, work_type, work_data)
  VALUES (p_venture_id, 23, 'kill_event', jsonb_build_object(
    'reason', p_kill_reason,
    'killed_by', p_killed_by,
    'killed_at', NOW()
  ));
END;
$$ LANGUAGE plpgsql;
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-23-002-kill-protocol.spec.ts',
      test_cases: [
        { id: 'TC-23-002-1', scenario: 'Kill Protocol executes atomically', priority: 'P0' },
        { id: 'TC-23-002-2', scenario: 'All SDs cancelled', priority: 'P0' },
        { id: 'TC-23-002-3', scenario: 'Kill event logged correctly', priority: 'P0' },
        { id: 'TC-23-002-4', scenario: 'Transaction rollback on failure', priority: 'P1' }
      ]
    })
  },
  {
    story_key: 'SD-VISION-TRANSITION-001D6:US-023003',
    title: 'Launch Checklist and Countdown',
    user_role: 'Product Manager',
    user_want: 'work through an interactive launch checklist with completion tracking and countdown timer',
    user_benefit: 'I ensure all launch tasks are completed on schedule and nothing is forgotten',
    story_points: 5,
    priority: 'high',
    status: 'draft',
    acceptance_criteria: JSON.stringify([
      {
        id: 'AC-23-003-1',
        scenario: 'Happy path - Generate launch checklist',
        given: 'Venture receives GO decision',
        when: 'System generates launch checklist',
        then: 'launch_checklist artifact created in venture_artifacts AND checklist includes pre-launch, launch day, and post-launch sections AND each item has assignee and due date AND checklist visible in launch dashboard'
      },
      {
        id: 'AC-23-003-2',
        scenario: 'Happy path - Complete checklist items',
        given: 'Launch checklist exists with 10 items',
        when: 'Team members mark items as complete AND system tracks progress',
        then: 'Completion percentage calculated (7/10 = 70%) AND completed items checked off AND remaining items highlighted AND progress bar updated'
      },
      {
        id: 'AC-23-003-3',
        scenario: 'Happy path - Launch countdown timer',
        given: 'Launch date set to 2025-12-25 00:00:00',
        when: 'User views launch dashboard',
        then: 'Countdown timer displayed showing days, hours, minutes until launch AND timer updates in real-time AND color changes as launch approaches (green > 7 days, yellow 3-7 days, red < 3 days)'
      },
      {
        id: 'AC-23-003-4',
        scenario: 'Edge case - Overdue checklist items',
        given: 'Launch date is tomorrow AND 3 checklist items are incomplete',
        when: 'User views checklist',
        then: 'Overdue items highlighted in red AND assignees notified AND risk warning displayed AND launch readiness indicator shows "At Risk"'
      }
    ]),
    definition_of_done: JSON.stringify([
      'Launch checklist generation implemented',
      'Artifact stored in venture_artifacts',
      'Checklist item completion tracking working',
      'Countdown timer functional',
      'E2E test US-D6-23-003 passing'
    ]),
    implementation_context: 'Generate launch_checklist artifact with template-based items. Store checklist state in venture_artifacts content field (JSONB). Update completion status via UI. Countdown timer uses client-side JavaScript with launch date from venture metadata. Follow artifact generation patterns from previous stages.',
    architecture_references: JSON.stringify({
      similar_components: [
        'UAT report generation (Stage 21)',
        'Task tracking UI patterns'
      ],
      patterns_to_follow: [
        'Template-based checklist generation',
        'Real-time countdown timer',
        'Progress tracking UI'
      ],
      integration_points: [
        'venture_artifacts table',
        'ventures table (metadata for launch date)',
        'User notification system'
      ]
    }),
    example_code_patterns: JSON.stringify({
      checklist_generation: `
const launchChecklist = {
  pre_launch: [
    { task: 'Final QA review', assignee: 'qa_lead', due_date: '2025-12-20', completed: false },
    { task: 'Marketing materials ready', assignee: 'marketing_manager', due_date: '2025-12-22', completed: false }
  ],
  launch_day: [
    { task: 'Deploy to production', assignee: 'devops_lead', due_date: '2025-12-25 00:00', completed: false },
    { task: 'Monitor deployment health', assignee: 'devops_lead', due_date: '2025-12-25 01:00', completed: false }
  ],
  post_launch: [
    { task: 'Send launch announcement', assignee: 'marketing_manager', due_date: '2025-12-25 09:00', completed: false }
  ]
};

await supabase.from('venture_artifacts').insert({
  venture_id: ventureId,
  artifact_type: 'launch_checklist',
  content: launchChecklist
});
      `,
      countdown_timer: `
const calculateCountdown = (launchDate) => {
  const now = new Date();
  const launch = new Date(launchDate);
  const diff = launch - now;
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  };
};
      `
    }),
    testing_scenarios: JSON.stringify({
      e2e_test_location: 'tests/e2e/ventures/US-D6-23-003-launch-checklist.spec.ts',
      test_cases: [
        { id: 'TC-23-003-1', scenario: 'Generate and view launch checklist', priority: 'P0' },
        { id: 'TC-23-003-2', scenario: 'Complete checklist items', priority: 'P1' },
        { id: 'TC-23-003-3', scenario: 'Countdown timer displays correctly', priority: 'P2' }
      ]
    })
  }
];
