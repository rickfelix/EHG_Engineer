import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

const SD_ID = 'd3851c09-2cfd-4625-ac28-f9dcd3eb32db';

const detailed_analysis = {
  scope: 'EXEC-phase SECURITY review of code-path-aware target_application routing logic',
  injection_surface: {
    finding: 'NONE',
    detail: 'All new matching uses String.prototype.includes() against hard-coded dictionary arrays. No eval/Function, no RegExp-from-input, no child_process, no SQL string concatenation. The one Supabase .update().eq() in the file is pre-existing, parameterized, and the new suppression branch returns before reaching it (no DB write on the suppression path).'
  },
  secret_auth_handling: {
    finding: 'NONE',
    detail: 'No credentials, tokens, secret env reads, session handling, RLS, or auth.uid(). The only env read (TARGET_APP_CROSSCHECK_VERDICT in finalize()) is pre-existing and only selects WARN vs BLOCK verdict level.'
  },
  new_external_input: {
    finding: 'NONE',
    detail: 'Inputs (sd.key_changes / scope / description / title, and crosscheck scope+target_application) are already-trusted DB fields the gate already consumed. detectPathSignalFromSd adds Array.isArray / typeof-object / typeof-string guards so malformed SD shapes return null instead of throwing.'
  },
  can_weaken_routing_security: {
    finding: 'NO',
    detail: 'Suppression branch is fenced to currentTarget===EHG_Engineer && inferredTarget===EHG, so it can only PRESERVE an existing EHG_Engineer target against a vocabulary-driven downgrade — never set EHG_Engineer on an EHG-targeted SD. It only suppresses when path signal is EHG_Engineer or mixed; a clean EHG-only signal (or null) falls through and a genuine EHG SD still flips. The pre-existing target_application_explicit guard runs first and is untouched.'
  },
  attacker_crafted_scope: {
    assessment: 'Narrows rather than widens the surface',
    detail: 'To trigger suppression, scope/key_changes must reference EHG_Engineer paths AND not be a pure-EHG signal, and even then it only keeps EHG_Engineer (the more-restricted governance/LEO-infra repo). Misrouting INTO EHG_Engineer would be a wrong-repo worktree correctness failure caught downstream by sd-start/activation gates, not a privilege escalation or data exposure. Crosscheck additions are advisory (finalize() defaults WARN, BLOCK only under explicit env opt-in) and can only ADD mismatch detections, never suppress one.'
  },
  checklist: {
    authentication: 'N/A — pure classification/routing logic, no auth mechanism touched',
    authorization: 'N/A — no RLS/policy changes',
    sensitive_data: 'None handled',
    input_validation: 'Defensive type guards added; literal-substring matching only',
    output_sanitization: 'N/A — no HTML/DOM output; console.log of literal signal labels',
    sql_injection: 'No new queries; pre-existing update is parameterized via Supabase client',
    secrets: 'No hardcoded credentials; no new secret reads'
  }
};

const row = {
  sd_id: SD_ID,
  sub_agent_code: 'SECURITY',
  sub_agent_name: 'Security Architect',
  verdict: 'PASS',
  confidence: 95,
  critical_issues: [],
  warnings: [
    "PATH_PATTERN_DICTIONARY entry 'database/' is a broad prefix that, combined with 'scripts/', could read an ambiguous scope as EHG_Engineer — routing-precision concern (mitigated by the 'mixed' branch + downstream activation gates), NOT a security weakness.",
    "crosscheck ENGINEER_PATH_HINTS/EHG_PATH_HINTS are an intentional duplicate subset of the canonical dictionary; future drift between the two lists is a maintainability note, not a vulnerability."
  ],
  recommendations: [
    'Keep the canonical PATH_PATTERN_DICTIONARY in target-application.js as the single source; if the crosscheck hint subset must persist, add a unit test asserting it stays a subset to prevent drift.',
    'Consider a comment/test documenting that the suppression branch is one-directional (can only preserve EHG_Engineer, never set it on an EHG-targeted SD) so future edits do not inadvertently make it bidirectional.'
  ],
  detailed_analysis: JSON.stringify(detailed_analysis),
  metadata: {
    files_reviewed: [
      'scripts/modules/handoff/executors/lead-to-plan/gates/target-application.js',
      'scripts/modules/sd-validation/target-application-crosscheck.js'
    ],
    diff_range: 'HEAD~1..HEAD'
  },
  validation_mode: 'retrospective',
  source: 'SECURITY',
  phase: 'EXEC',
  summary: 'EXEC-phase security review of SD-LEO-INFRA-CODE-PATH-AWARE-001 LEO classification/routing changes. The diff adds pure code-path-signal detection (detectPathSignalFromSd) plus a one-directional suppression branch in the LEAD-TO-PLAN target_application gate, and an advisory code-path-mismatch crosscheck. No injection surface (literal String.includes() against hard-coded dictionaries — no eval, dynamic RegExp, child_process, or SQL concatenation), no secret/auth handling, and no new untrusted input (all inputs are already-trusted DB fields, now with added defensive type guards). The change cannot weaken routing security: the suppression only fires when current=EHG_Engineer & inferred=EHG with an EHG_Engineer/mixed path signal, so it can only PRESERVE EHG_Engineer against a vocabulary-driven downgrade — a genuine EHG-only path signal still flips, and the pre-existing target_application_explicit guard is untouched. Attacker-crafted scope would at worst keep an SD in the more-restricted EHG_Engineer repo (a correctness/wrong-worktree issue caught by downstream activation gates), not cause privilege escalation or data exposure. Verdict PASS, confidence 95; two non-blocking maintainability/precision warnings noted.'
};

const { data, error } = await supabase
  .from('sub_agent_execution_results')
  .insert(row)
  .select('id')
  .single();

if (error) {
  console.error('INSERT_FAILED', error.message);
  process.exit(1);
}

const insertedId = data.id;
console.log('INSERTED', insertedId);

const { data: verify, error: verr } = await supabase
  .from('sub_agent_execution_results')
  .select('id, sd_id, sub_agent_code, verdict, confidence, phase, validation_mode, source')
  .eq('id', insertedId)
  .single();

if (verr || !verify) {
  console.error('VERIFY_FAILED', verr?.message);
  process.exit(1);
}

console.log(JSON.stringify(verify, null, 2));
console.log('EVIDENCE_VERIFIED ' + insertedId);
