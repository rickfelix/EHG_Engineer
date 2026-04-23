# user_stories — Field Reference

**Source of truth**: `public.user_stories` table (Supabase).
**Related**: `strategic_directives_v2`, `product_requirements_v2`.

## Purpose

Captures atomic user-facing requirements linked to a Strategic Directive / PRD.
User stories drive STORIES sub-agent validation at PLAN-TO-EXEC and are the
unit of acceptance evaluation during EXEC and EXEC-TO-PLAN.

Not every SD requires user stories — see **Exemption Matrix** below.

## Exemption Matrix

`sd_type` values that are exempt from the USER_STORIES requirement at
PLAN-TO-EXEC. Matches `lib/protocol-policies/orchestrator-bypass.js`
`STORY_EXEMPT_TYPES` (FR-001).

| sd_type         | Stories required? | Notes |
|-----------------|-------------------|-------|
| `feature`       | YES               | User-facing work; STORIES sub-agent runs. |
| `bugfix`        | YES               | Fix must have observable acceptance criteria. |
| `infrastructure`| NO                | Pipeline / tooling; minimum validation profile. |
| `documentation` | NO                | No runtime behaviour to capture. |
| `database`      | NO                | Schema changes; DATABASE sub-agent covers validation. |
| `security`      | NO                | Auth / RLS; SECURITY sub-agent covers validation. |
| `refactor`      | NO                | Behaviour unchanged by definition. |
| `orchestrator`  | NO                | Coordinates children; children may still require stories. |
| `fix`           | YES (default)     | Fallback for unknown types — treated like bugfix. |
| _unknown_       | YES (safe default)| Caller enforces when type is absent. |

## Key Fields

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `id` | uuid | YES (default) | Primary key. |
| `story_key` | text | **YES** | Canonical key `<SD-KEY>:US-NNN` (e.g. `SD-FEATURE-001:US-001`). |
| `sd_id` | uuid | **YES** | FK → `strategic_directives_v2.id`. |
| `prd_id` | uuid | Optional | FK → `product_requirements_v2.id`. |
| `title` | text | **YES** | Short imperative user-facing summary. |
| `user_role` | text | YES (for feature) | "As a <role>". |
| `user_want` | text | YES (for feature) | "I want <capability>". |
| `user_benefit` | text | YES (for feature) | "So that <outcome>". |
| `acceptance_criteria` | jsonb[] | **YES** | Array of testable criteria. |
| `given_when_then` | text | Optional | BDD-style scenario. |
| `definition_of_done` | jsonb[] | Optional | DoD checklist. |
| `priority` | text | Recommended | `critical` / `high` / `medium` / `low`. |
| `story_points` | int | Optional | Estimate. |
| `sprint` | text | Optional | Sprint / iteration tag. |
| `depends_on` | text[] | Optional | Array of blocking story_keys. |
| `blocks` | text[] | Optional | Array of blocked story_keys. |
| `technical_notes` | text | Optional | Implementation hints. |
| `implementation_approach` | text | Optional | How EXEC should build it. |
| `implementation_context` | text | Recommended | Links to code, prior art, references. |
| `test_scenarios` | jsonb[] | **Required for feature/bugfix** | Test vectors. |
| `testing_scenarios` | jsonb[] | Optional | Additional non-unit test coverage. |
| `validation_status` | text | Optional | See **validation_status enum** below. |
| `status` | text | **YES** | Lifecycle state — see **status enum** below. |
| `implementation_status` | text | Optional | See **implementation_status enum** below. |
| `e2e_test_path` | text | Optional | Path to E2E test file. |
| `e2e_test_status` | text | Optional | `pass` / `fail` / `skipped` / `pending`. |
| `e2e_test_last_run` | timestamptz | Optional | Last run. |
| `e2e_test_evidence` | jsonb | Optional | Run logs / screenshots. |
| `e2e_test_failure_reason` | text | Optional | Populated when `e2e_test_status='fail'`. |
| `architecture_references` | text[] | Optional | Links to architecture docs. |
| `example_code_patterns` | jsonb | Optional | Reference implementations. |
| `created_at` / `updated_at` / `completed_at` | timestamptz | DB-managed | Lifecycle timestamps. |
| `created_by` / `updated_by` / `completed_by` | text | Optional | Actor attribution. |
| `actual_points` | int | Optional | Actual effort after completion. |
| `time_spent_hours` | numeric | Optional | Tracked effort. |
| `metadata` | jsonb | Optional | Free-form extension. |

## status enum

Observed values (sampled from production data; enum constraint in DB):

| Value | Meaning |
|-------|---------|
| `draft` | Newly created; content may still be evolving. |
| `ready` | Ready for EXEC; all required fields populated. |
| `in_progress` | EXEC actively implementing. |
| `completed` | EXEC finished; acceptance criteria met. |
| `blocked` | External dependency unresolved. |
| `cancelled` | Won't fix / descoped. |

`ready`, `in_progress`, `completed` satisfy the STORIES sub-agent precondition.
`draft` / `blocked` / `cancelled` do not count toward the "stories exist" check.

## validation_status enum

| Value | Meaning |
|-------|---------|
| `pending` | Awaiting validation. |
| `passed` | Validation passed — ready for EXEC. |
| `failed` | Validation failed — address issues and revalidate. |
| `waived` | Explicitly waived by LEAD (requires justification in metadata). |

## implementation_status enum

| Value | Meaning |
|-------|---------|
| `not_started` | No implementation work yet. |
| `in_progress` | EXEC actively working. |
| `complete` | Implementation finished; awaiting verification. |
| `verified` | PLAN verification passed. |

## Common errors

### `USER_STORIES_MISSING` at PLAN-TO-EXEC preflight

Raised when `shouldRequireUserStories(sd.sd_type) === true` but `user_stories`
has no rows for this `sd_id`. Remediation:

```sql
INSERT INTO user_stories (
  story_key, sd_id, title, user_role, user_want, user_benefit,
  acceptance_criteria, status
) VALUES (
  'SD-XXX-001:US-001',
  '<sd_uuid>',
  'Short imperative title',
  'chairman',
  'to do X',
  'so that Y',
  '[{"criterion": "...", "measure": "..."}]'::jsonb,
  'draft'
);
```

### `USER_STORIES_BYPASSED` (info-severity)

Raised when `sd_type` is on the exemption list. Informational only — not a
failure. (Fixed in SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 commit 177f74c298 —
preflight now correctly treats info entries as non-blocking.)

## References

- `lib/protocol-policies/orchestrator-bypass.js` (`STORY_EXEMPT_TYPES`)
- `scripts/modules/handoff/pre-checks/prerequisite-preflight.js` (gate logic)
- `CLAUDE_CORE.md` — "Required Sub-Agents by Type" matrix
- SD-LEO-INFRA-LEO-PROTOCOL-POLICY-001 — created this reference (FR-008 / Issue #6).
