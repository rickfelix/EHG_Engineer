#!/usr/bin/env node
/**
 * Store VALIDATION sub-agent result for SD-LEO-FIX-EDGE-FUNCTION-JWT-001
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const detailedAnalysis = {
    validation_summary: 'PASS with warnings',
    sd_id: 'SD-LEO-FIX-EDGE-FUNCTION-JWT-001',
    sd_title: 'Edge Function JWT Verification and CORS Hardening',

    prd_requirements_coverage: {
      'FR-001: JWT verification on all edge functions': {
        verdict: 'PASS',
        evidence: [
          'All 12 edge functions import verifyJWT from _shared/auth.ts',
          'calibrate-confidence: verifyJWT at line 82',
          'compute-health-score: verifyJWT at line 52',
          'execute-exit: verifyJWT at line 43',
          'observer-code-health: verifyJWT at line 92',
          'observer-dependencies: verifyJWT at line 49',
          'observer-retrospectives: verifyJWT at line 66',
          'openai-realtime-token: verifyJWT at line 31',
          'realtime-relay: verifyJWT at line 40',
          'service-tasks-claim: verifyJWT at line 118',
          'service-tasks-complete: verifyJWT at line 26',
          'service-tasks-poll: verifyJWT at line 26',
          'tier-evaluation: verifyJWT at line 68',
        ],
        notes: 'JWT verification uses supabase.auth.getUser(token) for server-side validation. Pattern: extract Bearer token, call getUser(), return 401 on failure.'
      },
      'FR-002: CORS hardening with origin allowlist': {
        verdict: 'PASS',
        evidence: [
          'All 12 functions call getCorsHeaders(req) from shared auth.ts',
          'ALLOWED_ORIGINS loaded from env var, falls back to localhost:8080',
          'Origin checked against allowlist; unmatched origins get first allowed origin (restrictive default)',
          'All functions handle OPTIONS preflight correctly',
          'No wildcard Access-Control-Allow-Origin in any function',
        ],
      },
      'FR-003: Authorization header parsing utility': {
        verdict: 'PASS',
        evidence: [
          'Shared auth.ts exports verifyJWT, getCorsHeaders, createAdminClient',
          'verifyJWT extracts Bearer token from Authorization header',
          'Returns structured { user, error, status } for consistent error handling',
          'All functions use same error response pattern',
        ],
      },
    },

    test_scenario_coverage: {
      'Reject invalid/expired JWT': { verdict: 'COVERED_IN_CODE', test_exists: false },
      'Reject missing Authorization header': { verdict: 'COVERED_IN_CODE', test_exists: false },
      'Accept valid JWT': { verdict: 'COVERED_IN_CODE', test_exists: false },
      'CORS origin allowlist': { verdict: 'COVERED_IN_CODE', test_exists: false },
      'Case-insensitive header lookup': { verdict: 'PASS_BY_SPEC', test_exists: false },
    },

    implementation_quality: {
      shared_module_pattern: 'Excellent - single auth.ts module with 3 exports, imported by all 12 functions',
      error_handling: 'Good - consistent pattern with try/catch and 500 fallback',
      security_posture: 'Strong - JWT verified server-side via supabase.auth.getUser(). Admin client only created after JWT passes.',
      code_consolidation: 'Good - net -115 LOC through shared module',
      cors_implementation: 'Good - no wildcard origins, env-var-driven allowlist',
    },

    gate_4_checklist: {
      scope_match: 'PASS',
      scope_creep: 'NONE',
      ui_integration: 'N/A - backend-only SD',
    },

    score: { total: 85, max: 100 },
  };

  const criticalIssues = [];

  const warnings = [
    'Dead code: cors.ts file exists but is not imported by any edge function. Consider removing or consolidating with auth.ts.',
    'No automated tests exist for JWT verification and CORS hardening. PRD test scenarios are implemented in code logic but not automated.',
    'Duplicate getCorsHeaders implementations with slight differences between auth.ts and cors.ts (Allow-Methods header, different fallback defaults).',
  ];

  const recommendations = [
    'Create unit tests mocking supabase.auth.getUser() to verify 401 responses for missing/invalid tokens and CORS header correctness.',
    'Remove or consolidate unused cors.ts with auth.ts to eliminate dead code.',
    'Consider adding Access-Control-Allow-Methods to auth.ts getCorsHeaders() for completeness.',
  ];

  const summary = 'VALIDATION PASS (85/100): All 3 PRD functional requirements fully met. ' +
    'All 12 edge functions now verify JWT via supabase.auth.getUser() and use CORS origin allowlist from shared auth.ts module. ' +
    'tier-evaluation gap (noted in task description) was addressed in final code. ' +
    'Deducted 15 points: no automated tests exist (-15). ' +
    '3 warnings: dead cors.ts file, no automated tests, duplicate getCorsHeaders implementations.';

  // Store in sub_agent_execution_results
  const { data, error } = await supabase
    .from('sub_agent_execution_results')
    .insert({
      sd_id: 'SD-LEO-FIX-EDGE-FUNCTION-JWT-001',
      sub_agent_code: 'VALIDATION',
      sub_agent_name: 'Principal Systems Analyst',
      verdict: 'PASS',
      confidence: 85,
      critical_issues: criticalIssues,
      warnings: warnings,
      recommendations: recommendations,
      detailed_analysis: detailedAnalysis,
      summary: summary,
      source: 'validation-agent',
      metadata: {
        phase: 'PLAN_VERIFICATION',
        gate: 'GATE_4',
        model: 'claude-opus-4-6',
        timestamp: new Date().toISOString(),
        files_reviewed: 14,
        functions_validated: 12,
      },
    })
    .select('id, sd_id, sub_agent_code, verdict, confidence, created_at')
    .single();

  if (error) {
    console.error('Insert error:', error);
    process.exit(1);
  }

  console.log('Validation result stored successfully:');
  console.log(JSON.stringify(data, null, 2));
})();
