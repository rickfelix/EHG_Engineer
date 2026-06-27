/**
 * EHG Venture Default Capabilities — portfolio-wide capability constraint for
 * EVA's Stage 19 (Sprint Planning) LLM prompts.
 *
 * SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001
 *
 * Why this exists: every venture's contribution to chairman-side cross-portfolio
 * quality visibility depends on a central `feedback` table populated by per-venture
 * feedback widget + error capture middleware. Without these, every new venture is
 * a chairman blind spot — and blind spots compound across the portfolio. Constraining
 * Stage 19's sprint planner at the prompt source (rather than retrofitting downstream
 * after sprints ship) keeps the Quality Lifecycle System Vision (`docs/reference/vision/quality-lifecycle-system.md`)
 * actually enforced.
 *
 * Update procedure: bump DEFAULT_CAPABILITIES_VERSION, file an SD with LEAD approval,
 * and run the audit script (scripts/one-off/audit-venture-default-capabilities.mjs)
 * to surface in-flight ventures whose sprint plans may need re-evaluation.
 *
 * Sibling pattern: lib/eva/config/house-tech-stack.js (Stage 14 / SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001).
 *
 * @module lib/eva/config/venture-default-capabilities
 */

// SD-LEO-INFRA-VENTURE-DEFAULT-CAPABILITIES-EXPAND-001: bumped from '2026.04'
// when the portfolio-default set grew from 2 to 7 capabilities.
export const DEFAULT_CAPABILITIES_VERSION = '2026.06';

export const EHG_VENTURE_DEFAULT_CAPABILITIES = Object.freeze([
  Object.freeze({
    capability_id: 'feedback-widget',
    name: 'Integrate Feedback Widget',
    description: 'Add a user-facing feedback widget at /feedback that submits to the central `feedback` table with source_application=<venture_slug>, type=enhancement|issue, and dedupes by title. Visible in app header/sidebar.',
    story_points: 2,
    priority: 'high',
    acceptance_criteria: 'Feedback page reachable from primary nav; submitted entries land in the central `feedback` table with source_application set to this venture; duplicate-title submissions within 24h are deduplicated server-side; rate limit of 50 submissions/hour/venture enforced.',
    target_stack_components: ['presentation', 'api', 'data'],
    vision_source_section: 'docs/reference/vision/quality-lifecycle-system.md — Multi-Venture Architecture / Per-venture deliverables',
  }),
  Object.freeze({
    capability_id: 'error-capture-middleware',
    name: 'Wire Error Capture Middleware',
    description: 'Initialize Sentry SDK with venture-scoped DSN; runtime errors are auto-logged to the central `feedback` table via Sentry beforeSend hook with PII redaction (authorization headers, cookies stripped). Includes graceful shutdown via SIGTERM handler.',
    story_points: 1,
    priority: 'high',
    acceptance_criteria: 'Sentry SDK initialized at app entrypoint; thrown errors arrive in central `feedback` table within 30s; PII (auth headers, cookies) redacted via beforeSend; SENTRY_DSN sourced from Replit Secrets; SIGTERM closes Sentry cleanly.',
    target_stack_components: ['business_logic', 'infrastructure'],
    vision_source_section: 'docs/reference/vision/quality-lifecycle-system.md — Multi-Venture Architecture / Per-venture deliverables (error capture)',
  }),
  // ── SD-LEO-INFRA-VENTURE-DEFAULT-CAPABILITIES-EXPAND-001 (FR-1..FR-5) ──
  // Five capabilities the joint Adam<->coordinator assessment ranked as the
  // recurring portfolio blind spots, ordered by what the fleet sees ventures
  // consistently MISSING.
  Object.freeze({
    capability_id: 'cost-instrumentation',
    name: 'Instrument Operating Cost into the Cash-Burn Feed',
    description: 'Auto-instrument the venture\'s operating burn into the central cash-burn / distance-to-quit feed: emit the venture\'s rolling AI + infra burn into `income_capture.business_expenses` (and the substrate `ai_burn`) tagged source_application=<venture_slug>, so the north-star ($18k/mo-net) gauge stays accurate portfolio-wide instead of dark per new venture. Lower-bound, fail-soft (never blocks the app), mirroring the engineer-side feed-operator-cash-burn capture.',
    story_points: 2,
    priority: 'high',
    acceptance_criteria: 'The venture writes its rolling-window operating burn to `income_capture.business_expenses`/`ai_burn` with source_application set to this venture; the distance-to-quit gauge reflects this venture\'s burn within one capture cycle; capture is fail-soft (a capture failure never throws into the request path); no hardcoded $0 (honest-NULL when a cost source is absent).',
    target_stack_components: ['business_logic', 'data', 'infrastructure'],
    vision_source_section: 'docs/reference/vision — distance-to-quit / cash-burn north-star (income_capture business_expenses / ai_burn)',
  }),
  Object.freeze({
    capability_id: 'telemetry-analytics',
    name: 'Wire Baseline Usage Telemetry/Analytics',
    description: 'Wire a baseline usage-analytics layer (page/route views, key conversion events, active-user counts) so the Stage-25 post-launch review has real data to assess against rather than running blind. Privacy-respecting (no PII in event payloads); events land somewhere the post-launch review can query.',
    story_points: 1,
    priority: 'high',
    acceptance_criteria: 'Page/route views and at least the venture\'s core conversion event are recorded; an active-user count is queryable for the Stage-25 window; event payloads carry no PII; the telemetry layer is initialized at app entrypoint and degrades silently if the sink is unreachable.',
    target_stack_components: ['presentation', 'business_logic', 'data'],
    vision_source_section: 'docs/reference/vision/quality-lifecycle-system.md — Stage-25 post-launch review data baseline',
  }),
  Object.freeze({
    capability_id: 'calm-decision-card',
    name: 'Standardize Chairman-Facing Decision Card',
    description: 'Standardize the chairman-facing decision-card brief on every chairman-facing surface ONLY (not internal/agent surfaces): each decision card renders what / why / confidence / recommendation / alternatives / cost-of-delay, per the vision\'s calm-cockpit standard. Prevents the Stage-17 RED-on-green / empty-summary contradiction class by guaranteeing the brief is populated whenever a decision is surfaced to the chairman.',
    story_points: 1,
    priority: 'high',
    acceptance_criteria: 'Every chairman-facing decision card exposes the six fields (what, why, confidence, recommendation, alternatives, cost-of-delay); a decision surfaced to the chairman never renders an empty summary or a health badge contradicting its underlying verdict; scope is limited to chairman-facing surfaces (internal/agent surfaces unchanged).',
    target_stack_components: ['presentation'],
    vision_source_section: 'docs/reference/vision — calm-cockpit decision-card doctrine (chairman-facing surfaces); fixes the Stage-17 health-provenance class',
  }),
  Object.freeze({
    capability_id: 'health-uptime-probe',
    name: 'Expose a Health/Uptime Liveness Probe',
    description: 'Expose a basic liveness endpoint (e.g. GET /healthz returning 200 + minimal status JSON) so the factory can verify a deployed venture is actually running, closing the merged != running gap (deploy-verification). The endpoint is unauthenticated, dependency-light, and safe to poll frequently.',
    story_points: 1,
    priority: 'high',
    acceptance_criteria: 'GET /healthz (or equivalent) returns HTTP 200 with a minimal status payload when the app is up; the endpoint requires no auth and does not depend on downstream services being healthy to answer liveness; the factory can poll it post-deploy to confirm the venture is running.',
    target_stack_components: ['api', 'infrastructure'],
    vision_source_section: 'docs/reference/vision — merged != running deploy-verification (liveness probe)',
  }),
  Object.freeze({
    capability_id: 'operating-model-grounding',
    name: 'Inherit the Operating-Model Grounding SSOT',
    description: 'Inherit the operating-model SSOT (lib/eva/standards/operating-model.js) as a first-class grounding input — seeded at venture creation in lib/eva/bridge/venture-provisioner.js — rather than re-deriving generic-SaaS assumptions (solo chairman + all-AI labor, built-in hosting standard + GTM). This grounds, not re-derives, fixing the Stage-5/Stage-16 false-kill root where generic payroll/hosting assumptions kill viable agentic ventures. Verify INHERITANCE, not re-derivation.',
    story_points: 1,
    priority: 'high',
    acceptance_criteria: 'The venture record is seeded at creation with a reference to the operating-model SSOT (lib/eva/standards/operating-model.js); downstream cost/financial stages (S5, S16) consume the inherited operating-model assumptions rather than generic-SaaS defaults; the inheritance is verifiable (the grounding input is present, not re-derived per stage).',
    target_stack_components: ['business_logic', 'data'],
    vision_source_section: 'lib/eva/standards/operating-model.js — operating-model SSOT (fixes S5/S16 generic-SaaS false-kill)',
  }),
]);

export const DEFAULT_CAPABILITY_IDS = Object.freeze(
  EHG_VENTURE_DEFAULT_CAPABILITIES.map(c => c.capability_id)
);
