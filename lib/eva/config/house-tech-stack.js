/**
 * EHG House Tech Stack — portfolio-wide technology constraint for EVA's
 * Stage 14 (Technical Architecture) LLM prompts.
 *
 * SD-LEO-ENH-CONSTRAIN-STAGE-EHG-001
 *
 * Why this exists: every venture's compounding capability depends on consistent
 * stack choices across the portfolio. Shared auth, shared design system, shared
 * deployment pipeline, shared observability, shared operational tooling — none
 * of these can be templated when each venture lives on a different cloud or
 * uses a different database. Constraining Stage 14's LLM at the prompt source
 * (rather than retrofitting downstream) keeps the operations footprint bounded.
 *
 * Update procedure: bump HOUSE_STACK_VERSION, file an SD with LEAD approval,
 * and run the audit script (scripts/one-off/audit-house-stack-adherence.mjs)
 * to surface in-flight ventures that may need re-evaluation.
 *
 * @module lib/eva/config/house-tech-stack
 */

export const HOUSE_STACK_VERSION = '2026.06';

export const EHG_HOUSE_TECH_STACK = Object.freeze({
  presentation: Object.freeze({
    technology: 'React + Vite + Tailwind',
    components_hint: ['UI components', 'pages', 'layouts'],
    rationale: 'Already used in EHG; shared design tokens; low cold-start',
  }),
  api: Object.freeze({
    technology: 'REST via Cloudflare Workers',
    components_hint: ['endpoint groups', 'middleware', 'route handlers'],
    rationale: 'Standard, debuggable; no GraphQL operational burden; runs on the Cloudflare-default venture stack (Workers; Cloud Run only for full Node runtimes)',
  }),
  business_logic: Object.freeze({
    technology: 'Node.js (TypeScript)',
    components_hint: ['services', 'workers', 'analyzers'],
    rationale: 'Single-language portfolio reduces context-switching for chairman/operators',
  }),
  data: Object.freeze({
    technology: 'Cloudflare D1 → Neon (graduate)',
    components_hint: ['tables', 'views', 'migrations'],
    rationale: 'Cloudflare-default venture DB: cheap D1 by default, graduate to Neon Postgres on the stakes-router triggers. NEVER Supabase for ventures (Supabase is platform-only).',
  }),
  infrastructure: Object.freeze({
    technology: 'Cloudflare Pages/Workers + R2 + D1→Neon',
    components_hint: ['hosting', 'CDN', 'background workers'],
    rationale: 'Cloudflare-default venture-hosting standard (CD30_stack_cloudflare): ~$5/mo, no vendor AI agents on deployed infra; Cloud Run only for full Node runtimes; Replit is a prototyping opt-in.',
  }),
});

export const EHG_HOUSE_AUTH_STRATEGY = Object.freeze({
  technology: 'Clerk',
  rationale: 'Canonical venture auth (@clerk/tanstack-react-start); SSO across portfolio possible; magic-link and social OAuth ready. NEVER Supabase Auth / Replit Auth for ventures.',
});

export const HOUSE_STACK_LAYER_NAMES = Object.freeze([
  'presentation',
  'api',
  'business_logic',
  'data',
  'infrastructure',
]);
