---
category: reference
status: draft
version: 1.0.0
author: auto-fixer
last_updated: 2026-02-28
tags: [reference, auto-generated]
---
# SD Workflow Templates

**SD**: SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001

## Overview

The SD workflow templates system (`sd_workflow_templates` + `sd_workflow_template_steps` tables) provides database-driven, per-SD-type progress calculation. Instead of hardcoded phase weights in `get_progress_breakdown()`, each SD type has a configurable template defining workflow steps, ordering, and weights.

## How It Works

1. `get_progress_breakdown(sd_id)` loads the SD's type
2. Looks up the active template for that type in `sd_workflow_templates`
3. If found: iterates template steps, evaluates completion signals, calculates weighted progress
4. If not found: falls back to the original hardcoded logic (zero regression guarantee)

## Template Structure

```sql
-- Template: One per SD type (active)
sd_workflow_templates:
  id, sd_type, name, is_active, version

-- Steps: Ordered phases with weights
sd_workflow_template_steps:
  template_id, step_key, step_label, step_order, weight, completion_signal
```

## Completion Signals

| Signal | Evaluation |
|--------|-----------|
| `handoff:LEAD-TO-PLAN` | LEAD-TO-PLAN handoff accepted |
| `handoff:PLAN-TO-EXEC` | PLAN-TO-EXEC handoff accepted |
| `handoff:EXEC-TO-PLAN` | EXEC-TO-PLAN handoff accepted |
| `handoff:PLAN-TO-LEAD` | PLAN-TO-LEAD handoff accepted |
| `handoff:LEAD-FINAL-APPROVAL` | LEAD-FINAL-APPROVAL handoff accepted |
| `artifact:retrospective` | Retrospective record exists |
| `handoff:PLAN-TO-LEAD\|handoff:PLAN-TO-EXEC` | Either handoff accepted (OR) |
| `children:all_complete` | All child SDs completed (partial credit) |

## Current Templates

### Standard Types (6 steps, weights: 10/10/50/10/10/10)

Applies to: `feature`, `bugfix`, `enhancement`, `refactor`, `performance`, `security`, `infrastructure`, `documentation`, `docs`, `process`, `uat`

| Step | Weight | Signal |
|------|--------|--------|
| LEAD_approval | 10% | handoff:LEAD-TO-PLAN |
| PLAN_verification | 10% | handoff:PLAN-TO-EXEC |
| EXEC_implementation | 50% | handoff:EXEC-TO-PLAN |
| LEAD_review | 10% | handoff:PLAN-TO-LEAD |
| RETROSPECTIVE | 10% | artifact:retrospective |
| LEAD_final_approval | 10% | handoff:LEAD-FINAL-APPROVAL |

### Orchestrator Type (4 steps, weights: 20/5/15/60)

| Step | Weight | Signal |
|------|--------|--------|
| LEAD_initial | 20% | handoff:LEAD-TO-PLAN |
| FINAL_handoff | 5% | handoff:PLAN-TO-LEAD OR handoff:PLAN-TO-EXEC |
| RETROSPECTIVE | 15% | artifact:retrospective |
| CHILDREN_completion | 60% | children:all_complete (partial credit) |

## Adding a New SD Type Template

```sql
-- 1. Create the template
INSERT INTO sd_workflow_templates (sd_type, name, is_active, version)
VALUES ('spike', 'spike workflow v1', true, 1);

-- 2. Add steps (weights must sum to 100)
INSERT INTO sd_workflow_template_steps (template_id, step_key, step_label, step_order, weight, completion_signal)
VALUES
  ((SELECT id FROM sd_workflow_templates WHERE sd_type = 'spike' AND is_active), 'LEAD_approval', 'LEAD Approval', 1, 20.00, 'handoff:LEAD-TO-PLAN'),
  ((SELECT id FROM sd_workflow_templates WHERE sd_type = 'spike' AND is_active), 'EXEC_implementation', 'Implementation', 2, 60.00, 'handoff:EXEC-TO-PLAN'),
  ((SELECT id FROM sd_workflow_templates WHERE sd_type = 'spike' AND is_active), 'LEAD_final_approval', 'Final Approval', 3, 20.00, 'handoff:LEAD-FINAL-APPROVAL');

-- 3. Validate
SELECT * FROM validate_sd_workflow_template(
  (SELECT id FROM sd_workflow_templates WHERE sd_type = 'spike' AND is_active)
);
-- Should return empty (no violations)
```

## Querying

```sql
-- View all active templates with stats
SELECT * FROM v_active_sd_workflow_templates;

-- Validate a specific template
SELECT * FROM validate_sd_workflow_template('template-uuid-here');

-- Check which SD types use fallback (no template)
SELECT DISTINCT sd_type
FROM strategic_directives_v2
WHERE sd_type NOT IN (SELECT sd_type FROM sd_workflow_templates WHERE is_active);
```

## Source Tracking

Progress responses include a `source` field per step:
- `"source": "template"` - Calculated from workflow template
- `"source": "hardcoded"` - Using fallback logic

Template responses also include `template_id` and `template_version` at the top level.
