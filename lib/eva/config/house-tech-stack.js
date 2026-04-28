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

export const HOUSE_STACK_VERSION = '2026.04';

export const EHG_HOUSE_TECH_STACK = Object.freeze({
  presentation: Object.freeze({
    technology: 'React + Vite + Tailwind',
    components_hint: ['UI components', 'pages', 'layouts'],
    rationale: 'Already used in EHG; shared design tokens; low cold-start',
  }),
  api: Object.freeze({
    technology: 'REST via Vercel Functions',
    components_hint: ['endpoint groups', 'middleware', 'route handlers'],
    rationale: 'Standard, debuggable; no GraphQL operational burden',
  }),
  business_logic: Object.freeze({
    technology: 'Node.js (TypeScript)',
    components_hint: ['services', 'workers', 'analyzers'],
    rationale: 'Single-language portfolio reduces context-switching for chairman/operators',
  }),
  data: Object.freeze({
    technology: 'PostgreSQL via Supabase',
    components_hint: ['tables', 'views', 'RLS policies'],
    rationale: 'Already used by EHG_Engineer; built-in auth and RLS',
  }),
  infrastructure: Object.freeze({
    technology: 'Vercel + Replit + Supabase',
    components_hint: ['hosting', 'CDN', 'background workers'],
    rationale: 'Replit Agent friendly for MVP scaffolding; Vercel for production web; no AWS operational tax',
  }),
});

export const EHG_HOUSE_AUTH_STRATEGY = Object.freeze({
  technology: 'Supabase Auth',
  rationale: 'SSO across portfolio possible; magic-link and social OAuth ready',
});

export const HOUSE_STACK_LAYER_NAMES = Object.freeze([
  'presentation',
  'api',
  'business_logic',
  'data',
  'infrastructure',
]);
