import dotenv from 'dotenv';
dotenv.config();
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { createSupabaseServiceClient } from '../lib/supabase-client.js';

const SD = 'SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C';
const supabase = createSupabaseServiceClient();

const critical_issues = [];

const warnings = [
  'SEC-1 ADVISORY (pattern hygiene, not a live defect): .or() is the ONE genuinely injectable supabase-js filter shape, and lib/quality/assist-engine.js:298 now uses it WITH template interpolation. Unlike .eq()/.gt() -- whose value is percent-encoded into a single URL search param and can never escape it -- .or(filters) appends `(${filters})` as RAW PostgREST logic-tree grammar that the server parses (measured: postgrest-js 2.103.0 PostgrestFilterBuilder.ts:1949). It is SAFE here ONLY because the sole interpolant is new Date().toISOString(), a machine-generated fixed-format value with zero grammar metacharacters -- confirmed by decoding the generated URL: ?or=(snoozed_until.is.null,snoozed_until.lte.2026-09-12T13:18:27.542Z). There is no caller-reachable path to that position today. RECOMMENDATION: add a one-line comment at the interpolation marking it as machine-generated-only, so a future edit does not drop a caller-supplied variable into a raw-grammar sink that looks superficially identical to the safe .eq() calls three lines away.',

  'SEC-2 ADVISORY (effective-capability expansion, correctly intended by the SD but worth naming): this fix converts a previously-INERT service-role write path into a LIVE one against the 38,208-row shared public.feedback table. MEASURED why it was inert: public.feedback has NO snoozed_at/snoozed_by/snooze_reason columns (information_schema.columns -- only metadata jsonb, snoozed_until timestamptz, status varchar exist), AND feedback_status_check allows exactly {new,triaged,in_progress,resolved,wont_fix,duplicate,invalid,backlog,shipped} -- so the OLD code was broken in BOTH directions: status=snoozed on the snooze path and status=open on the unsnooze/wake paths were BOTH CHECK violations. Every call previously failed. This is NOT a privilege escalation (no boundary is crossed -- the module held createSupabaseServiceClient() before and after, line unchanged by the diff) and NOT an authorization bypass (there was no authz at this layer before and none now, so access control is byte-identical). But it is the same inert-to-reactivated shape sibling child SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G explicitly flagged in its own evidence, and the reactivated writes are unauthenticated-by-design service-role mutations of any row by id. MITIGATED: the only live caller is .claude/skills/inbox.md (operator-typed, single row by explicit id); options.userId/options.reason are passed by NO caller today.',

  'SEC-3 ADVISORY (latent LOW information-disclosure, 0 rows reachable today): metadata.snooze now PERSISTS {active, snoozed_at, snoozed_by, snooze_reason, unsnoozed_at} where previously nothing persisted (the target columns did not exist). snoozed_by is a user identifier and snooze_reason is free-form operator text. MEASURED RLS posture of public.feedback: RLS IS enabled (pg_class.relrowsecurity=t) and exactly ONE anon SELECT policy exists -- telegram_bot_select_feedback USING (source_type=telegram). Reachability is effectively ZERO today on two independent counts: (a) the live /inbox caller passes no options, so snoozed_by and snooze_reason are written as NULL in every real invocation; (b) live census shows 1 telegram row in the entire table and 0 telegram rows that are snoozeable via the inbox view. TREAT snooze_reason as operator-visible, not confidential, if a future caller ever populates it.'
];

const recommendations = [
  'No blocking security action required before EXEC-TO-PLAN. Optionally apply SEC-1 (one comment line at the assist-engine .or() interpolation marking the interpolant as machine-generated-only) -- cheapest possible guard against a future edit turning a safe raw-grammar sink into an injectable one.',
  'DO NOT file a HIGH finding against v_feedback_with_sensemaking on the basis of migration ordering. A derived (unmeasured) reading of 20260704e_widen_feedback_source_application.sql suggests its DROP/CREATE discarded the security_invoker=on set by 20260310_remediate_security_linter_findings.sql, which would make the anon-granted view bypass feedback RLS for all rows. MEASURED AGAINST THE LIVE DB, THIS IS FALSE: pg_class.reloptions for public.v_feedback_with_sensemaking = {security_invoker=on}. The view honors the querying role RLS. Recording this so the false HIGH is not re-derived by a later reviewer from the same migration files.',
  'Longer term (NOT this SD, and NOT a blocker): if feedback.metadata write concurrency ever matters, replace the read-modify-write idiom fleet-wide with an atomic server-side merge (UPDATE ... SET metadata = metadata || jsonb_build_object(...) via RPC) or optimistic concurrency on updated_at. The fresh-read-then-write remedy that sibling SD-001-G standardized narrows the lost-update window but does not close it; at least 5 call sites now share that residual.'
];

const results = {
  verdict: 'PASS',
  confidence: 95,
  critical_issues,
  warnings,
  recommendations,
  summary: 'SECURITY review of the snooze-manager fix at commits 4e7a170d2c2 + f91275aaff3. VERDICT PASS: 0 blocking, 0 high, 3 advisory. All five questions were settled by EXECUTION or by LIVE MEASUREMENT, not by reasoning. (1) INJECTION: NONE, proven by attempt. Read the postgrest-js 2.103.0 source to establish the sink shapes, then fired 7 injection payloads through options.userId -- the only caller-controlled value in any filter -- including &limit=1, an &or=(...) logic-tree breakout, a paren breakout, comma injection, operator-swap and a SQL-ish quote payload. In ALL 7 the generated URL held at exactly 4 search params (never 5), with every PostgREST grammar metacharacter neutralized (& to %26, = to %3D, comma to %2C, parens to %28/%29, quote to %27, percent to %25), because the URLSearchParams x-www-form-urlencoded serializer is STRICTER than encodeURIComponent (only alnum and *-._ survive unescaped). The or-tree-breakout payload was then EXECUTED live and returned 0 rows as a literal value match -- not an error, not a widened result set. TWO NEGATIVE CONTROLS PASSED (malformed .or() gives PGRST100 failed to parse logic tree; malformed column path gives PGRST100 failed to parse tree path), which is what makes the passing results meaningful rather than a silent no-op. All four filter COLUMN paths are fixed string literals; the single grammar-position interpolation is new Date().toISOString(). (2) AUTHZ: UNCHANGED -- createSupabaseServiceClient() before and after, diff does not touch the client line; no authz existed at this layer before and none now. (3) DISCLOSURE at the API boundary: NONE NEW -- getSnoozedItems/snoozeFeedback already used select(*)/select() before AND after, so metadata was ALREADY in every returned object; projectSnoozeCompatFields merely re-projects snoozed_by/snooze_reason out of that same already-returned metadata. Strictly a reshape, zero new information. (4) METADATA RACE: NOT a regression -- mergeSnoozeMetadata fresh-read-then-write is EXACTLY the remedy sibling child SD-001-G shipped ~4h earlier in this same orchestrator (commit a83c9e6af23, lib/uat/risk-router.js) after classifying the snapshot-merge variant as HIGH, so C conforms to the just-ratified in-orchestrator standard. The residual narrowed window is a shared, accepted, pre-existing class. wakeExpiredSnoozes correctly sidesteps it entirely by writing only snoozed_until on the bulk path. (5) SECRETS/PII: CLEAN -- zero new console/log statements, zero new process.env reads, no hardcoded credentials, unit tests mock the client and the integration test is BEGIN...ROLLBACK. The 3 advisories are pattern-hygiene and latent-reachability notes, none action-blocking.',
  evidence: {
    scope: 'EXEC-phase post-implementation SECURITY review, EXEC-TO-PLAN handoff. Files: lib/quality/snooze-manager.js (rewritten), lib/quality/assist-engine.js (1 filter clause), 4 test files.',
    method: 'Read of postgrest-js@2.103.0 src/PostgrestFilterBuilder.ts to establish the actual filter sink shapes (not folklore); full read of the shipped diff for both lib files; an executable injection harness that inspects the REAL generated request URL for 7 adversarial payloads without sending, then sends the worst one; live PostgREST execution of both shipped filter syntaxes WITH two passing negative controls; direct pg queries against the live production DB for column existence, CHECK constraint contents, pg_class.relrowsecurity, pg_policy roles/quals, role_table_grants, pg_class.reloptions (security_invoker) and row census; scoped repo-wide caller sweep for all 5 exported mutators; regex secret scan across the full diff; and inspection of the test files for live-DB mutation risk.',

    q1_injection: {
      verdict: 'NO RISK -- settled by attempting it, not by reasoning about it',
      sink_shapes_read_from_source: {
        eq_gt_lt_gte_lte: 'url.searchParams.append(column, `${op}.${value}`) -- value confined to ONE search param, cannot escape',
        or: 'url.searchParams.append(or, `(${filters})`) -- RAW PostgREST logic-tree grammar, server-parsed: the one genuinely injectable shape',
        file: 'node_modules/@supabase/postgrest-js/src/PostgrestFilterBuilder.ts:155,274,378,1949'
      },
      payloads_attempted_through_options_userId: 7,
      payloads_that_escaped: 0,
      param_count_invariant: 'exactly 4 search params in all 7 cases (select, metadata->snooze->>active, snoozed_until, metadata->snooze->>snoozed_by) -- never 5',
      encoding_observed: 'ampersand to %26 | equals to %3D | comma to %2C | open paren to %28 | close paren to %29 | single quote to %27 | percent to %25 (x-www-form-urlencoded serializer is stricter than encodeURIComponent)',
      live_execution_of_worst_payload: 'eq(metadata->snooze->>snoozed_by, "x&or=(id.not.is.null)") -> OK rows=0, treated as a literal value',
      negative_controls: {
        malformed_or: 'CORRECTLY REJECTED -- PGRST100 failed to parse logic tree ((snoozed_until.is.null,,,snoozed_until.lte.(()) line 1 column 26',
        malformed_column_path: 'CORRECTLY REJECTED -- PGRST100 failed to parse tree path (metadata->>->>snooze) line 1 column 13',
        interpretation: 'PostgREST demonstrably parses and rejects bad syntax on these relations, so the shipped filters passing is real validation rather than silent acceptance.'
      },
      column_path_position: 'ALL FOUR column paths are fixed string literals in source (metadata->snooze->>active, metadata->snooze->>snoozed_by, snoozed_until x2). No caller-controlled value reaches a column position anywhere in either file.',
      only_grammar_position_interpolation: 'new Date().toISOString() inside assist-engine .or() -- machine-generated, fixed YYYY-MM-DDTHH:mm:ss.sssZ, no metacharacters, no caller influence. Decoded URL confirms: or=(snoozed_until.is.null,snoozed_until.lte.2026-09-12T13:18:27.542Z)'
    },

    q2_privilege: {
      verdict: 'NO ESCALATION, NO BYPASS -- access control byte-identical',
      client: 'createSupabaseServiceClient() in BOTH lib/quality/snooze-manager.js:34 and lib/quality/assist-engine.js:38; the diff does not touch either line. Service-role before, service-role after.',
      authz_at_this_layer: 'none before, none after -- unchanged',
      who_can_snooze: 'identical set: any holder of the service-role client, i.e. any code that imports the module. No caller-identity check existed or was added.',
      nuance_effective_capability: 'Previously EVERY call FAILED. MEASURED: feedback has no snoozed_at/snoozed_by/snooze_reason columns, and feedback_status_check allows {new,triaged,in_progress,resolved,wont_fix,duplicate,invalid,backlog,shipped} -- so status=snoozed (snooze path) AND status=open (unsnooze/wake paths) were BOTH CHECK violations. The fix makes an inert write path live. Capability expansion, not privilege escalation.',
      live_callers: 'ONLY .claude/skills/inbox.md (3 call sites: snoozeFeedback(id,duration), unsnoozeFeedback(id), getSnoozedItems()). wakeExpiredSnoozes and resnooze have ZERO callers repo-wide (lib/quality/index.js re-exports only). options.userId and options.reason are passed by NO caller today.'
    },

    q3_disclosure: {
      verdict: 'NO NEW DISCLOSURE at the API boundary; one latent LOW at the DB layer with 0 reachable rows',
      api_boundary_analysis: 'getSnoozedItems used select(*) BEFORE and AFTER (line unchanged) and snoozeFeedback/unsnoozeFeedback used select() returning the full row BEFORE and AFTER. metadata was therefore ALREADY present in every returned object. projectSnoozeCompatFields adds snoozed_by/snooze_reason keys DERIVED from that same already-returned item.metadata. The result is a strict reshape of data the caller already held -- zero additional information crosses the boundary.',
      db_layer_new_persistence: 'metadata.snooze {active, snoozed_at, snoozed_by, snooze_reason, unsnoozed_at} now persists where previously nothing did (target columns did not exist).',
      measured_rls: { relrowsecurity: true, relforcerowsecurity: false },
      measured_anon_select_policies: 'exactly ONE: telegram_bot_select_feedback USING (source_type=telegram). NOTE: venture_user_select_feedback -- which an earlier derived sweep believed live -- is NOT present on the live table.',
      measured_view_security_invoker: '{security_invoker=on} on public.v_feedback_with_sensemaking -- the view HONORS the querying role RLS. The migration-ordering-derived claim that it was silently reset to OFF is FALSE when measured.',
      measured_reachability: { telegram_rows_total: 1, telegram_rows_snoozeable_via_inbox: 0, rows_with_metadata_snooze_marker: 0, rows_anon_readable_carrying_a_snooze_marker: 0 },
      pii_written_today: 'NONE -- the only live caller passes no options, so snoozed_by and snooze_reason are both written as NULL.'
    },

    q4_race: {
      verdict: 'ACCEPTED PRE-EXISTING CLASS -- not a new regression; conforms to the remedy this orchestrator ratified 4 hours earlier',
      pattern: 'mergeSnoozeMetadata() does SELECT metadata -> spread-merge -> UPDATE metadata (non-atomic read-modify-write).',
      in_orchestrator_precedent: 'Sibling child SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G, commit a83c9e6af23 (merged ~4h before this review), classified the WORSE variant (merging from a stale pre-insert in-memory snapshot) as a HIGH live lost-update bug in lib/uat/risk-router.js and fixed it by reading metadata FRESH immediately before merging. mergeSnoozeMetadata implements exactly that remedy. C therefore MATCHES the standard G just set rather than regressing it.',
      honest_residual: 'Fresh-read-then-write NARROWS the lost-update window to the read-to-write round trip; it does NOT eliminate it. Two concurrent cycles can still interleave and silently drop the loser fields. The G comment (so both writers fields survive regardless of ordering) over-claims, and C inherits the same residual. Closing it properly needs an atomic server-side jsonb merge or optimistic concurrency on updated_at.',
      c_specific_exposure: 'LOW. Other feedback.metadata writers fire at INSERT time (risk-router.js, feedback-quality-updated.js) or in sweeps (adversarial-verification-sweep.mjs, prod-error-sweep-loop.cjs), whereas snooze is an operator-typed single-row op on an aged row. Collision probability low but non-zero.',
      positive_design_note: 'wakeExpiredSnoozes() deliberately writes ONLY snoozed_until on the chunked bulk path and never per-row metadata -- which avoids the race ENTIRELY on the one path that could touch thousands of rows. Correct call, and the shipped comment explains it.'
    },

    q5_secrets_pii: {
      verdict: 'CLEAN',
      new_log_statements_in_lib_diff: 0,
      new_process_env_reads: 0,
      hardcoded_secret_scan: 'clean across the FULL diff (patterns: eyJ JWTs, sk-, ghp_, password=, secret=, api_key=, service_role_key=, postgres://user:pass@) -- zero matches',
      test_safety: 'tests/unit/quality/snooze-manager.test.js and tests/unit/assist-engine-snooze-exclusion.test.js vi.mock createSupabaseServiceClient (no live creds, no writes). tests/integration/feedback-lifecycle-allowlist-regression.test.js wraps all writes in BEGIN...ROLLBACK with SAVEPOINTs -- nothing persists.',
      data_newly_stored: 'snoozed_by (user identifier) and snooze_reason (free-form text) -- both NULL in every live invocation today.'
    },

    checklist: {
      authentication_mechanism: 'N/A -- internal library, service-role, unchanged',
      authorization_model: 'unchanged (none at this layer; RLS enforced at DB for non-service roles)',
      sensitive_data_protected: 'no PII written in any live path today',
      api_endpoints_secured: 'no endpoint added or modified',
      input_validation: 'parseDuration() regex-validates duration against ^(digits)(h|d|w|m)$ and throws on mismatch; feedbackId flows only into .eq() value position (percent-encoded, proven non-escaping)',
      output_sanitization: 'no new output surface; returned object is a reshape of already-returned data',
      sql_injection_prevention: 'PostgREST parameterizes; injection attempted 7 ways and failed all 7, with passing negative controls',
      secrets_in_env: 'no new secret handling'
    }
  },
  metadata: {
    measured: true,
    phase: 'EXEC',
    review_type: 'post_implementation_security_validation',
    handoff: 'EXEC-TO-PLAN',
    prd_id: 'PRD-SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-C',
    evaluated_commit_shas: ['4e7a170d2c2', 'f91275aaff3'],
    findings_count: { blocking: 0, high: 0, advisory: 3 },
    injection_payloads_attempted: 7,
    injection_payloads_escaped: 0,
    negative_controls_passed: 2,
    live_db_probes: 11,
    false_claim_corrected: 'v_feedback_with_sensemaking security_invoker -- derived-as-OFF, measured-as-ON',
    sibling_precedent_commit: 'a83c9e6af23 (SD-LEO-INFRA-AUDIT-FIX-FEEDBACK-001-G)'
  }
};

// results-storage enforces a declared-field contract: `evidence` is not a top-level column and is
// not in TOP_LEVEL_FIELDS_PERSISTED_TO_METADATA, so leaving it top-level hard-throws
// UNRECOGNIZED_FIELD_DROPPED. Nest it under metadata (safeMetadata derives from results.metadata),
// which preserves the full payload without declaring a new exemption or bypassing the guard.
results.metadata.evidence = results.evidence;
delete results.evidence;

const resolution = await resolveSubAgentRepo({
  sdId: SD,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  probeExistsRelative: 'lib/quality/snooze-manager.js',
  supabase
});
console.log('repo resolution:', JSON.stringify(resolution, null, 2));
applySubAgentRepoVerdict(results, resolution);
console.log('verdict after repo apply:', results.verdict);

const stored = await storeSubAgentResults('SECURITY', SD, { code: 'SECURITY', name: 'Chief Security Architect' }, results, {
  phase: 'EXEC',
  source: 'manual',
  sdKey: SD
});
console.log('STORED:', JSON.stringify(stored)?.slice(0, 600));
