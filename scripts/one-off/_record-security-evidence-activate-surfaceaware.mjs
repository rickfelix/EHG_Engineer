import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const row = {
  sd_id: '00d9049a-a0f8-42d8-b222-22979d56f2e0',
  sub_agent_code: 'SECURITY',
  sub_agent_name: 'Security Architect',
  verdict: 'PASS',
  confidence: 96,
  critical_issues: [],
  warnings: [
    'venture_artifacts read is not RLS-scoped at the query level — it relies on the supabase client passed by the runner (service-role in EVA backend). Acceptable for a server-side analysis hook reading the same venture being processed, but treat the supabase arg as trusted-server context, not user-scoped.',
  ],
  recommendations: [
    'When EVA_SURFACE_AWARE_ENABLED is flipped to true in production, confirm the marketing-copy SYSTEM_PROMPT/wireframe interaction_notes still carry auth-surface security guidance (CSRF / input validation / rate limiting / CAPTCHA / OAuth allowlist) for any AUTH-surface screens — that guidance lives in the S15 wireframe generator interaction_notes (untouched here), not in the S18 copy step.',
    'Keep the fail-safe {} contract (return {} on any throw) if this hook is later extended; never let a venture_artifacts lookup failure abort or alter S18 copy generation.',
  ],
  detailed_analysis: JSON.stringify({
    surface: 'read-only flag-gated venture_artifacts query (parameterized .eq filters: venture_id=<ventureId>, lifecycle_stage=15, artifact_type=wireframe_screens; .order/.limit(1)/.maybeSingle()), no writes, fail-safe {} on error, double-guard (flag !== "true" OR missing supabase/ventureId returns {} before any I/O)',
    injection: 'No injection vector. The only dynamic value bound into the query is ventureId, supplied via parameterized .eq("venture_id", ventureId) — no string concatenation/interpolation into a query. classifySurface name extraction (name ?? screen_name ?? title) is pure regex matching, no I/O. Surface-aware PROMPT injection into S18 is strictly additive: buildMarketingWireframeContext + conversionCopyDirectives are APPENDED to existing prompt sections (lines 294-299); SYSTEM_PROMPT (177-241) is unchanged; no prompt section removed. The injected content (wireframe components/ascii layout + conversion-copy directives) is benign marketing-copy guidance.',
    marketing_safe_guidance: 'RETAINED — not weakened. The S18 marketing-copy step generates marketing TEXT (tagline/emails/SEO/social), not auth/form implementation. The CSRF/input-validation/rate-limit/CAPTCHA/OAuth security guidance for auth-surface screens resides in the S15 wireframe generator interaction_notes (stage-15-wireframe-generator.js:641, e.g. "Form validates on submit. Social login opens OAuth flow."), which this diff does NOT modify. The conversionCopyDirectives block adds only value-prop/benefit/CTA/social-proof guidance and explicitly says "Do not fabricate urgency" — no security directive is overridden or stripped.',
    classifier: 'pure regex, no I/O',
    flag_gate: 'EVA_SURFACE_AWARE_ENABLED !== "true" short-circuits to {} before any DB call; flag-off byte-identical prompt parity proven by COND-2 test',
    fail_safe: 'try/catch returns {} on throw; missing supabase/ventureId returns {}; missing or empty screens array returns {} — all verified by 14/14 passing unit tests (tests/unit/stage-18-surface-aware-wiring.test.js)',
    new_attack_surface: 'none — read-only, flag-gated, additive, server-side, no auth change, no secret handling, no external/user-controlled input bound unsafely',
  }),
  metadata: {
    files_reviewed: [
      'lib/eva/stage-templates/stage-18.js',
      'lib/eva/stage-templates/analysis-steps/stage-15-wireframe-generator.js',
    ],
    also_inspected: [
      'lib/eva/stage-templates/analysis-steps/stage-18-marketing-copy.js (injection consumer + SYSTEM_PROMPT + buildUserPrompt)',
      'tests/unit/stage-18-surface-aware-wiring.test.js (14/14 pass)',
    ],
    diff_range: 'bff5312a79..HEAD',
    activation_invariant_verified: true,
  },
  validation_mode: 'retrospective',
  source: 'SECURITY',
  phase: 'EXEC',
  summary:
    'PASS (96). Additive, read-only, flag-gated activation of the surface-aware marketing-copy-grounding pipeline. The new stage-18 onBeforeAnalysis hook performs a fully parameterized (.eq) read against venture_artifacts with a double guard (flag + arg presence) and a fail-safe {} on any error, introducing no writes, no auth/secret handling, and no string-interpolated query input. classifySurface name fallback is pure regex. The surface-aware prompt injection is strictly appended to the existing S18 prompt — SYSTEM_PROMPT and prior sections are unchanged, so no security directive is weakened; auth-surface security guidance (CSRF/validation/rate-limit/CAPTCHA/OAuth) lives in the untouched S15 wireframe interaction_notes and is fully retained. Flag-off byte-identical parity and all fail-safe paths are covered by 14/14 passing unit tests. No new attack surface; no critical issues.',
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id, created_at')
  .single();

if (error) {
  console.error('INSERT FAILED:', error.message);
  process.exit(1);
}
console.log('EVIDENCE_ROW_WRITTEN', JSON.stringify(data));

// Re-query by id to verify
const { data: verify, error: verr } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, verdict, confidence, phase, source')
  .eq('id', data.id)
  .single();

if (verr || !verify) {
  console.error('VERIFY FAILED:', verr?.message || 'no row');
  process.exit(1);
}
console.log('EVIDENCE_VERIFIED', verify.id);
console.log('VERIFY_ROW', JSON.stringify(verify));
