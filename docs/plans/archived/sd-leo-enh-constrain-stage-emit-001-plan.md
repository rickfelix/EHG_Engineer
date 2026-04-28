<!-- Archived from: C:\Users\rickf/.claude/plans/sd-ehg-venture-pipeline-feedback-defaults-001-plan.md -->
<!-- SD Key: SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001 -->
<!-- Archived at: 2026-04-28T23:41:16.882Z -->

# SD: Constrain Stage 19 to Emit Feedback Widget + Error Capture as Mandatory Sprint Items

## Type
enhancement

## Priority
high

## Problem

The **Quality Lifecycle System Vision** (`docs/reference/vision/quality-lifecycle-system.md`) explicitly mandates that every EHG venture ship with feedback functionality and error capture infrastructure as a portfolio-wide default. From the vision:

> "The Quality Lifecycle System is designed to serve not just EHG, but ALL ventures that EHG creates. Each venture inherits the same feedback and error capture infrastructure."

> "For all future ventures, the feedback/error capture requirements will be a mandatory stage in the Venture Creation Workflow. This ensures every venture inherits the Quality Lifecycle System from day one."

The vision specifies three concrete deliverables every venture must include:
1. **Feedback widget** — Web UI component for user feedback (issues + enhancements)
2. **Error capture middleware** — Auto-logs runtime errors
3. **API integration** — Writes to central `feedback` table with `source_application` set

**The gap:** Stage 19's Sprint Planning analyzer (`lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js`) does NOT instruct the LLM to include any of these as mandatory sprint items. The system prompt enumerates app-type-specific feature priorities and architectural concerns, but is silent on portfolio-default capabilities.

**Concrete observation (2026-04-28):** LexiGuard's freshly re-derived sprint plan (artifact `7f107870-0314-4860-a2cc-4197f0fa31ad`, 5 items, 25 pts) contains zero items related to feedback widget, error capture, or Sentry → `feedback` table integration. If LexiGuard ships, it will land without the Quality Lifecycle System the vision mandates — same drift pattern as the AWS-vs-house-stack issue addressed by **SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001**.

This is the same class of defect: a vision exists, the prompt source isn't constrained to enforce it, ventures ship without the capability, no portfolio compounding.

**Why this matters for compounding:** the central `feedback` table with `source_application` discriminator is the foundation for chairman-side cross-portfolio quality visibility (per the vision's Multi-Venture Architecture section). One venture without the capture infrastructure means one blind spot in chairman-level pattern detection. Five ventures without it means the system never reaches its design goal.

**Adjacent existing infra:** `lib/eva/bridge/replit-repo-seeder.js::generateMonitoringDoc` already writes a `monitoring.md` doc that describes Sentry → `feedback` table integration. So part of the wiring is documented in seeded content; what's missing is the sprint-level enforcement that says "yes, build this in the MVP." The Plan Mode binding contract also doesn't surface `docs/monitoring.md` today.

## Strategic Intent

Constrain Stage 19's Sprint Planning prompt to ALWAYS emit two mandatory sprint items at MVP-tier priority:
- **Feedback Widget Integration** — UI component + API write path to central `feedback` table
- **Error Capture Middleware** — Sentry-equivalent runtime error capture writing to the same `feedback` table

Add `docs/monitoring.md` to the Plan Mode binding contract so Replit Agent reads the existing Sentry+feedback integration spec when planning. Add a §1.0 pre-approval check verifying every venture's sprint plan contains these two mandatory items. Mirror the structural pattern of SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001 (prompt-level constraint + post-parse validation + override hatch + audit script + playbook §1.0 amendment).

## Success Criteria

1. **Mandatory-items config exists.** A new module `lib/eva/config/venture-default-capabilities.js` exports an explicit `EHG_VENTURE_DEFAULT_CAPABILITIES` array describing the two mandatory sprint items (name, description, story-point band, priority, acceptance criteria, target stack components). Each entry references the Quality Lifecycle System Vision section that motivated it.
2. **Stage 19 prompt enforces them.** The system prompt at `lib/eva/stage-templates/analysis-steps/stage-19-sprint-planning.js` is amended so the LLM is instructed to ALWAYS include the two mandatory items in `items[]`, alongside the venture-specific feature work. Story-point budget assumes mandatory items consume ~3-5 points total.
3. **Post-parse validator rejects sprint plans missing them.** A new `validateVentureDefaultCapabilities()` function checks the parsed S19 output and throws `MissingDefaultCapabilityError` if the sprint plan lacks one of the mandatory items. Belt-and-suspenders mirror of the house-stack validator.
4. **Override hatch exists and is auditable.** A `default_capabilities_override` input field (off by default, requires upstream pass-through from venture metadata) allows a venture to skip a mandatory item with `override_reason`. Common legitimate use: B2B-only venture with no end-user UI (no feedback widget needed).
5. **Plan Mode binding contract surfaces `docs/monitoring.md`.** The `formatPlanModePrompt` function in `lib/eva/bridge/replit-format-strategies.js` includes `docs/monitoring.md — Sentry + central feedback table integration. Wire this on day one.` in its binding-contract list.
6. **Pre-approval review covers it.** Section 1.0 of `docs/guides/workflow/stage-pipeline-pre-approval-playbook.md` is amended with a "default-capabilities adherence" check: chairman-side review verifies the sprint plan contains both mandatory items OR has a populated `override_reason`.
7. **Audit script exists.** `scripts/one-off/audit-venture-default-capabilities.mjs` (read-only, idempotent, CSV output) lists every venture whose Stage 19 sprint plan deviates. Mirrors the house-stack audit script idiom.
8. **Tests cover the constraint.** New vitest cases verify (a) the default capabilities list is well-formed, (b) Stage 19's system prompt includes the mandatory-items instruction, (c) sprint plans missing a mandatory item fail validation, (d) overrides with reasons pass.
9. **Sibling stages flagged.** Future stages that emit user-facing capability lists (potentially S20, S22) must check `EHG_VENTURE_DEFAULT_CAPABILITIES`. Captured as Rule 9 of the pre-approval playbook (filed concurrently with this SD).
10. **Backfill consideration documented.** SD does NOT require retrofitting historical ventures; the audit script's output motivates a follow-up decision per venture (similar to SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001 stance).

## Scope

### In scope

- **Define** `lib/eva/config/venture-default-capabilities.js` with `EHG_VENTURE_DEFAULT_CAPABILITIES` and version stamp.
- **Refactor** Stage 19's system prompt to inline the mandatory items as a hard constraint.
- **Add** post-parse validation rejecting sprint plans missing mandatory items without `override_reason`.
- **Add** `default_capabilities_override` input pass-through path from venture metadata → analyzer.
- **Add** `docs/monitoring.md` reference to `formatPlanModePrompt` binding contract (and truncated fallback).
- **Write** the one-shot audit script.
- **Update** `docs/guides/workflow/stage-pipeline-pre-approval-playbook.md` §1.0 with the default-capabilities check.
- **Test** all of the above with vitest.

### Out of scope

- **Retrofitting historical ventures.** Existing Stage 19 sprint plans stay as they are. The audit script's output motivates a follow-up decision per venture.
- **Building the feedback widget itself.** This SD constrains the SPRINT PLANNING prompt; the actual widget build is a per-venture sprint deliverable that flows from the new mandatory item being present in every plan.
- **Modifying `generateMonitoringDoc`** in `replit-repo-seeder.js`. The doc already describes the Sentry → feedback flow correctly. We just need to surface it in the Plan Mode binding contract.
- **Defining default capabilities for non-S19 stages.** Rule 9 of the playbook captures the principle for future review (e.g., if S20 or S22 needs portfolio-default capability injection, file a separate SD).
- **Adding more than 2 mandatory items in this SD.** Scope is intentionally narrow: feedback widget + error capture. Other compounding-portfolio capabilities (shared design system import, SSO wiring, etc.) are separate SDs to keep blast radius small.

## Default Capabilities — initial proposal (subject to LEAD review)

Two MVP-tier sprint items every venture's S19 must emit (unless `override_reason` set):

| Item | Story Points | Priority | Acceptance Criteria |
|---|---|---|---|
| **Integrate Feedback Widget** | 2 | high | Widget visible in app header/sidebar; submits to `feedback` table with `source_application=<venture_slug>`, `type=enhancement\|issue`; deduplicates on title. |
| **Wire Error Capture Middleware** | 1 | high | Sentry SDK initialized with venture-scoped DSN; runtime errors auto-logged to central `feedback` table via Sentry beforeSend hook; PII redaction applied. |

Total: 3 story points reserved out of the typical 25-point sprint budget — manageable overhead.

## Estimated Effort

- Default capabilities config: ~50 LOC + tests
- Stage 19 prompt refactor: ~80 LOC change + tests
- Post-parse validation + override path: ~60 LOC + tests
- Plan Mode binding contract update: ~10 LOC change + tests
- Audit script: ~120 LOC
- Playbook §1.0 amendment: ~30 LOC docs

**Total: ~350 LOC change, ~3-4 hours active work.** Tier 3 / full SD per work-item routing matrix (framework-surface, schema-decision-keyword adjacent).

## Dependencies

- **Hard dependency:** SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001 (already shipped, commit `0f49aeb135`). This SD reuses the constrained-prompt + post-parse + override pattern established there. Without that pattern as precedent, this SD's design choices wouldn't have a sibling to point at.
- **Soft dependency:** Quality Lifecycle System Vision (`docs/reference/vision/quality-lifecycle-system.md`) is the authoritative source for the mandatory items. Any change to the vision (e.g., adding a third mandatory capability) propagates here via a config update.

## Risk / Tradeoffs

- **Risk: prescriptive defaults reduce sprint flexibility.** Mitigation: explicit override hatch with audit trail. Some ventures legitimately don't need a feedback widget (B2B integrations with no UI; backend-only data pipelines).
- **Risk: 3 reserved story points may crowd out feature work for very small sprints.** Mitigation: ventures with <15-point sprints can request override during Stage 19 planning kickoff.
- **Risk: feedback widget requirements drift from current vision.** Mitigation: version the config (`DEFAULT_CAPABILITIES_VERSION_2026_04`) and require LEAD approval for updates.
- **Tradeoff: LLM "creativity" reduced at Stage 19.** Acceptance: same as SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001. Stage 19 should be deterministic on portfolio-default capabilities; "creative" sprint plans that omit them are a bug, not a feature.
