<!-- Archived from: C:\Users\rickf/.claude/plans/sd-ehg-venture-pipeline-house-tech-stack-001-plan.md -->
<!-- SD Key: SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001 -->
<!-- Archived at: 2026-04-28T21:30:27.479Z -->

# SD: Constrain Stage 14 to an EHG House Tech Stack for Cross-Venture Compounding

## Type
enhancement

## Priority
high

## Problem

Stage 14 (`lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture.js:88`) prompts Gemini with a JSON schema example whose infrastructure layer has `"technology": "AWS/GCP/Vercel/etc"` as a placeholder list. The LLM picks one independently for each venture based on its own judgment — there is no house-stack constraint, no scale-tier guidance, and no cross-venture consistency mechanism.

**Concrete observation (2026-04-28):** LexiGuard (an MVP being built on Replit Agent) was assigned **AWS** as its infrastructure layer. AWS is enterprise-grade, wildly over-scoped for a Replit-Agent-built MVP, and inconsistent with sibling ventures that may receive Vercel, GCP, Firebase, or Supabase based on the LLM's mood that day.

**Why this is structurally important:** every venture's compounding capability depends on consistent stack choices across the portfolio. Specifically:

- **Shared auth:** if Venture A is on Supabase Auth and Venture B is on Cognito, users cannot SSO across the portfolio.
- **Shared design system:** brand tokens compile to different runtimes (Tailwind vs. NativeWind vs. styled-components) when the presentation layer drifts.
- **Shared deployment pipeline:** CI/CD templates, IaC modules, secrets management — none of these can be templated when each venture lives on a different cloud.
- **Shared observability:** Sentry/Datadog/etc. dashboards, alerting runbooks, on-call rotations all assume a baseline stack.
- **Shared operational tooling:** schema migrations, backup orchestration, cost monitoring — these require the same database engine and the same hosting model.

If the portfolio ships 10 ventures across 5 different stacks, the operations footprint is 5× wider than it needs to be, and there's no shared platform to compound on. The chairman's stated objective — "be consistent with the technology stack so that all of our ventures can work together and have compounding capabilities" — is structurally blocked at Stage 14.

## Strategic Intent

Define the **EHG House Tech Stack** as a first-class config asset and constrain Stage 14's LLM prompt to it. Provide an explicit, auditable override hatch for ventures that genuinely need different infrastructure (regulated industries, on-prem requirements, customer-mandated stacks). Make house-stack adherence a §1.0 pre-approval check so the constraint is verified on every venture before chairman sign-off.

## Success Criteria

1. **House-stack config exists.** A new module `lib/eva/config/house-tech-stack.js` exports an explicit `EHG_HOUSE_TECH_STACK` object with concrete technology choices for presentation, api, business_logic, data, and infrastructure layers, plus auth strategy and hosting target. Each layer has a one-line rationale citing a portfolio compounding benefit.
2. **Stage 14 prompt is constrained.** The system prompt at `lib/eva/stage-templates/analysis-steps/stage-14-technical-architecture.js` no longer offers free-choice placeholders (`"AWS/GCP/Vercel/etc"`). Instead it provides the house stack as a **constraint** ("use the EHG House Stack defined below; do not deviate") and tells the LLM to populate `architecture_summary`, `components`, and `rationale` *given* the fixed technologies.
3. **Override hatch exists and is auditable.** A separate input field `architecture_override_request` (off by default, requires explicit pass-through from upstream stages) allows a venture to motivate a deviation. When set, the LLM is permitted to deviate but must populate an `override_reason` field. Deviations without an override_request are rejected at the schema-validation layer.
4. **Pre-approval review covers it.** Section 1.0 of `docs/guides/workflow/stage-pipeline-pre-approval-playbook.md` is amended with a "house-stack adherence" check: chairman-side review verifies that the venture's `architecture.layers.infrastructure.technology` matches `EHG_HOUSE_TECH_STACK.infrastructure` OR contains a populated `override_reason`.
5. **Existing ventures audited, not retrofit.** A one-shot audit script (`scripts/one-off/audit-house-stack-adherence.mjs`) lists every venture whose Stage 14 output deviates from the house stack and writes a CSV report. Retrofitting historical ventures is **out of scope** for this SD — the audit informs a follow-up decision.
6. **Tests cover the constraint.** New vitest cases verify (a) the house stack is well-formed, (b) Stage 14's system prompt includes the house stack, (c) deviation without an override_reason fails schema validation, (d) deviation with an override_reason passes.
7. **Sibling stages are flagged.** Any future stage that prompts an LLM for technology choices (potentially S15, S20, S21) must check the house stack first. This is captured as Rule 8 of the pre-approval playbook (already added 2026-04-28).

## Scope

### In scope

- **Define** `lib/eva/config/house-tech-stack.js` with `EHG_HOUSE_TECH_STACK` and a documented selection rationale.
- **Refactor** Stage 14's system prompt to inline the house stack as a hard constraint and remove the `"AWS/GCP/Vercel/etc"` style placeholders.
- **Add** schema validation at the analyzer level rejecting deviations without `override_reason`.
- **Add** an `architecture_override_request` input pass-through path from venture metadata → analyzer.
- **Write** the one-shot audit script.
- **Update** `docs/guides/workflow/stage-pipeline-pre-approval-playbook.md` §1.0 with the house-stack check.
- **Test** all of the above with vitest.

### Out of scope

- **Retrofitting historical ventures.** Existing Stage 14 artifacts stay as they are. The audit script's output may motivate a follow-up SD.
- **Defining stack policy for stages other than Stage 14.** S15, S20, S21 etc. are not touched in this SD; Rule 8 of the playbook captures the principle for future review.
- **Per-tenant or per-venture stack policies.** This SD assumes one house stack across the portfolio. Tiered stacks (e.g., "MVP stack" vs. "growth-stage stack") are a follow-up if needed.
- **Alternate-cloud override governance UI.** Override requests are captured in venture metadata for now; a chairman-facing approval UI is a future SD.

## House Stack — initial proposal (subject to LEAD review)

This is a starting proposal informed by the EHG_Engineer and EHG codebases. LEAD will finalize during SD approval.

| Layer | Technology | Rationale |
|---|---|---|
| Presentation (web) | React + Vite + Tailwind | Already used in EHG, shared design tokens, low cold-start |
| Presentation (mobile) | Expo (React Native) | Already used by LexiGuard sample, code-share with web |
| API | REST via Vercel Functions / Express | Standard, debuggable, no GraphQL operational burden |
| Business logic | Node.js (TypeScript) | Single-language portfolio reduces context-switching for chairman/operators |
| Data | PostgreSQL via Supabase | Already used by EHG_Engineer; built-in auth + RLS |
| Auth | Supabase Auth | SSO across portfolio possible; magic-link & social OAuth ready |
| Infrastructure / hosting | Vercel (web) + Replit (MVP scaffolding) + Supabase (DB) | Replit Agent friendly; Vercel for production web; no AWS operational tax |
| Observability | Sentry | Already wired in EHG; standard error/perf/replay |
| File storage | Supabase Storage / Vercel Blob | Same auth boundary as data layer |

## Estimated Effort

- House stack config: ~50 LOC + tests
- Stage 14 prompt refactor: ~80 LOC change + tests
- Schema validation + override path: ~60 LOC + tests
- Audit script: ~120 LOC
- Playbook §1.0 amendment: ~30 LOC docs

**Total: ~340 LOC change, ~3-4 hours active work.** Tier 3 / full SD per work-item routing matrix (schema-decision keywords, framework-surface impact).

## Dependencies

- None blocking. This SD can start immediately at LEAD approval.
- Recommended sequencing: complete current LexiGuard build first to validate the playbook end-to-end before constraining Stage 14 — LexiGuard becomes an n=1 sample that motivates the house stack choices.

## Risk / Tradeoffs

- **Risk: prescriptive stack reduces venture-level flexibility.** Mitigation: explicit override hatch with audit trail. Some ventures legitimately need different stacks (regulated industries, customer mandates).
- **Risk: house stack becomes stale.** Mitigation: versioning the config (`EHG_HOUSE_TECH_STACK_V2026_04`) and a process rule that updates require LEAD approval and a propagation review of in-flight ventures.
- **Tradeoff: LLM "creativity" reduced at Stage 14.** Acceptance: this is the goal. Stage 14 should be deterministic; "creative" stack choices are a bug, not a feature.
