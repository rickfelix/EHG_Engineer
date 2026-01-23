-- Populate smoke_test_steps for SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001
-- These steps demonstrate the intelligent UAT feedback feature's value

UPDATE strategic_directives
SET smoke_test_steps = '[
  {
    "step_number": 1,
    "instruction": "Run /uat command on a completed SD",
    "expected_outcome": "UAT session starts, prompts for feedback mode"
  },
  {
    "step_number": 2,
    "instruction": "Paste batch text feedback (e.g., '\''The nav menu doesn'\''t highlight active item. Button spacing is off. Got console error on login.'\'')",
    "expected_outcome": "System parses feedback and displays extracted issues with detected modes"
  },
  {
    "step_number": 3,
    "instruction": "Observe multi-model analysis",
    "expected_outcome": "Shows GPT 5.2 and Gemini assessments side-by-side with consensus/disagreement markers"
  },
  {
    "step_number": 4,
    "instruction": "Answer follow-up question for low-confidence item",
    "expected_outcome": "System asks clarifying question, user responds, confidence increases"
  },
  {
    "step_number": 5,
    "instruction": "Confirm action routing",
    "expected_outcome": "Each issue routed to quick-fix, SD creation, or backlog with reasoning displayed"
  }
]'::jsonb,
updated_at = CURRENT_TIMESTAMP
WHERE id = 'SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001';

-- Verify the update
SELECT id, title, smoke_test_steps
FROM strategic_directives
WHERE id = 'SD-LEO-FEAT-INTELLIGENT-UAT-FEEDBACK-001';
