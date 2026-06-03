/**
 * venture-stack-policy — the SINGLE STRUCTURED SOURCE OF TRUTH for the EHG venture-stack standard.
 * SD-LEO-INFRA-VENTURE-STACK-STANDARDS-001 (FR-1).
 *
 * The canonical standard is authored as PROSE in lib/eva/bridge/claude-md-writer.js (the per-venture
 * CLAUDE.md template) and lib/eva/bridge/build-tasks-writer.js (the build-tasks checklist). This
 * module re-expresses those rules as STRUCTURED DATA so the compliance scanner, the standards doc,
 * and a consistency test can all reference ONE source instead of re-deriving from prose (which
 * silently drifts — the failure this SD exists to prevent). A policy-consistency test
 * (venture-stack-compliance.test.js) binds this module to the rendered writer output: if a writer
 * is edited to positively describe a forbidden stack, the test goes RED.
 *
 * Chairman standard (2026-06-03): Replit-native hosting; Clerk auth; Replit Postgres; Replit Object
 * Storage; Google Gemini images; Sentry errors. NEVER Supabase. NEVER "Replit Auth" (Agent-only).
 * Authoritative prose source: lib/eva/bridge/claude-md-writer.js lines ~48-62.
 */

/**
 * FORBIDDEN — tech that must NOT appear (as a POSITIVE usage) in a venture's artifacts/repo.
 * `patterns` are matched case-insensitively; a match preceded by a negation cue within
 * NEGATION_WINDOW chars is treated as a standard-citation/prohibition and is NOT flagged (so a doc
 * that says "do NOT use Replit Auth" or "NEVER add @supabase/supabase-js" does not red).
 */
export const FORBIDDEN = Object.freeze([
  {
    id: 'supabase_pkg',
    label: '@supabase/supabase-js',
    kind: 'package',
    patterns: [/@supabase\/supabase-js/i, /@supabase\/ssr/i],
    why: 'Ventures use Replit Postgres, never Supabase (claude-md-writer.js: "NEVER add @supabase/supabase-js").',
  },
  {
    id: 'supabase_client',
    label: 'Supabase client / RLS usage',
    kind: 'usage',
    patterns: [/\bsupabase\.(from|auth|rpc|storage|functions)\s*\(/i, /\bcreateClient\s*\([^)]*supabase/i],
    why: 'Supabase client / RLS-as-business-logic is forbidden for ventures (Replit-native only).',
  },
  {
    id: 'replit_auth',
    label: 'Replit Auth',
    kind: 'auth',
    patterns: [/\breplit\s+auth\b/i],
    why: 'Auth is Clerk (@clerk/tanstack-react-start). "Replit Auth" is Agent-only and forbidden (claude-md-writer.js).',
  },
  {
    id: 'cli_as_product',
    label: 'CLI-as-product framing',
    kind: 'framing',
    patterns: [/\bCLI\s+(tool|product|app|application)\b/i, /\bcommand[- ]line\s+(tool|product|app|interface|utility)\b/i, /\bnpm\s+install\s+(?:-g\s+)?[a-z0-9@/_-]+[\s\S]{0,60}\b[a-z0-9-]+\s+run\b/i],
    why: 'Ventures are hosted SaaS web apps, not CLI products.',
  },
]);

/**
 * REQUIRED — tech that SHOULD be positively present in a venture's stack. Reported in `missing[]`
 * when absent. NOTE: absence alone is ADVISORY (does not by itself hold a build) to avoid
 * over-blocking under-specified-but-not-wrong ventures; a positively-present FORBIDDEN item is what
 * holds a build. See venture-stack-compliance.js for the compliant/hold semantics.
 */
export const REQUIRED = Object.freeze([
  {
    id: 'clerk',
    label: 'Clerk (@clerk/tanstack-react-start)',
    kind: 'auth',
    patterns: [/@clerk\/tanstack-react-start/i, /\bClerk\b/],
    why: 'Canonical auth provider for ventures.',
  },
  {
    id: 'replit_postgres',
    label: 'Replit Postgres',
    kind: 'data',
    patterns: [/\bReplit\s+Postgres\b/i, /\bDATABASE_URL\b/],
    why: 'Canonical database for ventures.',
  },
]);

/**
 * Negation cue words: when a forbidden token is preceded (within NEGATION_WINDOW chars) by one of
 * these, it is a prohibition / standard-citation, NOT a positive usage — do NOT flag it. This is the
 * reason a reconciliation can rephrase "Replit Auth" references token-free and why the scanner must
 * never red on "do NOT use Replit Auth" / "never add @supabase" / "remove any Supabase coupling".
 */
export const NEGATION_CUES = Object.freeze([
  'not', 'never', 'avoid', 'forbidden', 'forbid', 'prohibit', 'remove', 'without',
  'instead of', 'rather than', "don't", 'do not', 'must not', 'cannot', "can't",
  'deprecat', 'ban ', 'no longer', 'drop ', 'migrate off', 'stale', 'replace',
]);

export const NEGATION_WINDOW = 56;

export default { FORBIDDEN, REQUIRED, NEGATION_CUES, NEGATION_WINDOW };
