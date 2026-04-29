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

export const DEFAULT_CAPABILITIES_VERSION = '2026.04';

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
]);

export const DEFAULT_CAPABILITY_IDS = Object.freeze(
  EHG_VENTURE_DEFAULT_CAPABILITIES.map(c => c.capability_id)
);
