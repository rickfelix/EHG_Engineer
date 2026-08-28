---
category: architecture
status: approved
version: 1.0.0
author: EXEC (SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D)
last_updated: 2026-08-28
tags: [architecture, adr, creative-media, schema]
---

# ADR-0013: Defer creative_media_assets / creative_campaigns / research_creative_workflows

## Decision

`ehg/supabase/migrations/20251004230000_creative_media_rd_integration.sql` (which
creates `creative_media_assets`, `creative_campaigns`, `research_creative_workflows`)
and its undeclared prerequisite `ehg/supabase/migrations/20251004210000_rd_department_schema.sql`
(~255 lines / 5 tables / 10 policies, creating `rd_research_findings` /
`rd_research_requests` and others that the first migration's FK statements
require) are explicitly **DEFERRED, not applied**, as part of
SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D.

## Reasons

1. **Unrouted orphans today.** The only real consumers of this schema --
   `ehg/src/services/creative-media/CreativeMediaIntegrationService.ts` and
   `ehg/src/services/rd-department/RDDepartmentService.ts:409` -- are called only
   from components (`ContentGenerationEngine.tsx`, `VideoProductionPipeline.tsx`,
   `CreativeOptimization.tsx`, `creative-media-automation.tsx` and siblings) that
   have **zero references** in `ehg/src/routes/`, `ehg/src/App.tsx`, or
   `ehg/src/config/` -- verified by direct grep during this SD (see Evidence
   below). There is no live production defect forcing application today, unlike
   `video_prompts` (FR-1 of this SD), which blocks the actually nav-linked
   `/creative-media` route.

2. **Third divergent data model.** `creative_media_assets` uses a different
   primary key (`asset_id` vs `id`) and no shared campaign/tenancy model with the
   unified `creative_assets` table this SD's FR-3/FR-5 wire into. Applying it as-is
   would create a THIRD divergent creative-asset data model alongside
   `creative_assets` (EHG_Engineer, company-access RLS) and
   `marketing_content_variants` (ventures.created_by RLS) -- directly opposing
   this SD's own reconciliation objective ("Reconcile ehg app creative-media/
   video-variant subsystem into unified media seam").

## Evidence

- DATABASE sub-agent evidence `04433ba0-7de4-43a5-a404-6001b70e5662`: the
  `creative_media_rd_integration` migration fails at its first FK statement
  (missing `rd_research_findings`/`rd_research_requests`), confirming the
  undeclared `rd_department_schema` prerequisite.
- DESIGN sub-agent evidence `8fda6dec-d2fa-4262-a592-6fdd0f493612`: confirmed
  `CreativeMediaIntegrationService.ts` and its consumer components are not
  reachable from any routed page.
- EXEC-time re-verification (this SD, 2026-08-28) -- diff-scoped, not
  repo-wide, per US-002 AC-3: `git diff` against the PLAN-TO-EXEC branch point
  shows this SD introduces **zero new** reads/writes to
  `creative_media_assets`, `creative_campaigns`, or
  `research_creative_workflows`. `CreativeMediaIntegrationService.ts` (9
  pre-existing references) and `RDDepartmentService.ts:409` (1 pre-existing
  reference) are both untouched by this SD's diff -- they pre-date this SD and
  are cited here only as the unrouted-orphan evidence, not modified by it.

## Revisit trigger

Revisit this decision if either becomes true:

- One of the currently-unrouted consumer pages (`ContentGenerationEngine.tsx`,
  `VideoProductionPipeline.tsx`, `CreativeOptimization.tsx`, or
  `creative-media-automation.tsx`) is added to `ehg/src/routes/`,
  `ehg/src/App.tsx`, or `ehg/src/config/`.
- A follow-on SD explicitly re-scopes and re-evaluates this decision.

Until then, no code should apply
`20251004230000_creative_media_rd_integration.sql` or
`20251004210000_rd_department_schema.sql`, and no new code should read from or
write to `creative_media_assets`, `creative_campaigns`, or
`research_creative_workflows`.

---
Status: accepted
Accepted at: 2026-08-28T00:00:00.000000+00:00
Approved by: EXEC (SD-LEO-FEAT-MEDIA-PRODUCTION-CAPABILITY-001-D)
