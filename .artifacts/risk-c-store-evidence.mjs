#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..'), '.env') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const SD_ID = '591400cf-7b88-4974-832a-6043e4f59152';
const SD_KEY = 'SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C';

const risk_domains = {
  security_risk: { score: 6, level: 'MEDIUM', rationale: "Asset is the chairman's personal Gmail refresh token at gmail.modify. Controls are unusually complete for a PLAN artifact: ciphertext-only writes with a real-AES-256-GCM test (TS-2), MICHAEL_ENCRYPTION_KEY as the only key source with named refusals and no self-generation (FR-2/TR-1), key_fingerprint compared BEFORE decrypt (TR-4/TS-3), assertHostVenue refusing GITHUB_ACTIONS/CI in code rather than by workflow convention (TR-3/TS-6), requireAuth mount proven by a test that reads server/index.js source (FR-6/TS-9), no blob column on the status route, and a SECURITY sub-agent gate with provenance before EXEC-TO-PLAN (FR-7). MEASURED: grep of .github/workflows for MICHAEL_ENCRYPTION_KEY / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET returns zero files today, so the FR-2 criterion starts satisfied. Residual, and it is inherited rather than introduced: the master key lives in the host .env, which nearly every script in this repo loads via dotenv (81 vars injected on each run observed here), so the key is in-process for any repo script that also holds a service-role client able to read encrypted_blob; and lib/security/encryption.cjs decrypt ignores its metadata argument with no AAD, so TOKEN_VAULT_APP_ID is an operational label and not a domain separator (the PRD says this outright at FR-2). Windows does not enforce the POSIX mode bits that module relies on, a weakness already recorded against .leo-keys in this repo's own retro material and equally true of .env." },
  operational_risk: { score: 7, level: 'HIGH', rationale: "The seven-day re-consent posture (D4, ratification 8e6ac764) makes lapse a HIGH-probability recurring event by design, and the PRD accepts that. What raises this domain above the others is the sequencing around it. FIRST: the michael-oauth-health gauge that turns last_error='invalid_grant' and expires_at<48h into a chairman-visible warning is child G's, not this child's. Between C landing and G landing, the module writes those columns and nothing reads them, so the first lapse is silent and the failure surfaces as a degraded brief. SECOND: MEASURED, MICHAEL_ENCRYPTION_KEY is absent from the host .env right now (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both present). The PRD's assumptions name the Google client pair but never the key, and the FR-4 runbook comment documents re-consent without documenting key provisioning or backup. The first real consent therefore refuses at pre-flight until someone generates 64 hex bytes, and no step in the child says who does that or where the backup lives. THIRD: port 3456 is shared with lib/integrations/youtube/oauth-manager.js:29 (confirmed the only other user) and never-concurrent is a documented human convention with no code check; the only signal is an EADDRINUSE. The runbook itself is genuinely one command, and TR-7's separate-storage split is real, so this is a HIGH that mitigations can close rather than a structural problem." },
  technical_complexity: { score: 4, level: 'MEDIUM', rationale: "Low blast radius, well-measured. The shared-module change is one appended export line on lib/security/encryption.cjs (singleton export at :247 stays default); its four consumers are enumerated and TS-10 pins them green. VALIDATION b4ed3c2c already measured that encrypt/decrypt both route through this.getMasterKey, so the subclass binds the key source without duplicating crypto. TR-6 worried about vitest collection: CHECKED, vitest.config.js already includes a repo-wide '**/*.test.js' glob (the narrow .mjs anchors are for lib/org and venture-email only), so *.test.js files under lib/integrations/google, lib/michael and server/routes will be collected. Import-time purity (TR-5) is precisely stated and testable, and the reason is concrete: scripts/michael/gmail-act.mjs:30-39 re-throws anything that is not module-not-found, so an import-time throw becomes exit 1 instead of the designed exit-2 refusal. The one structural footgun: HostKeyEncryption inherits a self-generating getMasterKey it must never call, and 'never touches .leo-keys' is asserted only behaviorally." },
  delivery_risk: { score: 6, level: 'MEDIUM', rationale: "Five greenfield files plus four test files against a 100 LOC target; the PRD acknowledges this and FR-7 requires the justification in the PR body under the tiered rule, but the 400 LOC non-test ceiling is plausibly close given an OAuth module, a CLI with a five-stage pre-flight, a Gmail client, an Express router and a mount edit. The larger delivery issue is what 'done' will mean. MEASURED: michael_credentials, michael_feeder_runs and michael_rules all return PGRST205 live, so the -B migration is unapplied and every one of the ten test scenarios is unit-level with injected sb/enc/gmail factories. This child can go fully green without a single real token ever being encrypted, stored, read back, refreshed or used to modify a thread. That is the right call for a chairman-gated migration, but the child must not read as 'the grant works'. Cross-child dependency on B being chairman-applied is outside this child's control and correctly declared." },
  data_risk: { score: 6, level: 'MEDIUM', rationale: "Scope is gmail.modify over the chairman's personal mailbox, and the PRD is right that no narrower scope covers label-plus-archive. Child C stores no message bodies and reads no mail; it ships the write primitive. The gap is that the primitive is unbounded at this layer. MEASURED: scripts/michael/gmail-act.mjs takes --label <labelId> as an arbitrary string (planModify pushes it straight into addLabelIds) and child C's modifyThread passes addLabelIds through to users.threads.modify unfiltered, so '--label TRASH' trashes a chairman thread through a code path whose stated purpose is labelling. The MICHAEL_GMAIL_MODIFY_CEILING of 60 that Solomon Q1.3 asked for lives in child D's gmail-triage feeder, not in the client, so nothing in C or B bounds volume or blocks the destructive system labels. Offsetting this: gmail-act already pre-flights the recording table before the API call, so nothing changes unrecorded, and drive.readonly / calendar.readonly are correctly read-only, with youtube deferred." },
};

const conditions = [
  'FR-4 runbook must cover key PROVISIONING and backup, not only re-consent. MEASURED: MICHAEL_ENCRYPTION_KEY is absent from the host .env today while GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are both present; the PRD assumptions name only the latter pair. State how the 64 hex bytes are generated, that losing the key costs a re-consent rather than data, and where the backup lives.',
  "lib/michael/gmail-client.mjs modifyThread must refuse TRASH and SPAM in addLabelIds (or require an explicit opt-in argument). MEASURED: gmail-act's --label is an arbitrary unvalidated id and the 60-thread modify ceiling lives in child D, so as specified child C ships an unbounded path to trashing a chairman thread. Add the refusal and a unit test to FR-5.",
  'Add a named post-migration verification step bound to child B being chairman-applied. All three michael_* tables return PGRST205 live, so every acceptance criterion here is an injected-client unit test; the PRD must say that child C completing does not mean the grant was ever exercised, and list the host smoke (real consent, --status, gmail-act --dry-run) that runs after -B lands.',
  'Record the two inherited security residuals in the PRD so the EXEC-phase SECURITY review scopes them deliberately instead of rediscovering them: (a) the host .env key is in-process for every repo script that calls dotenv, alongside service-role read access to encrypted_blob; (b) encryption.cjs has no AAD/domain binding, so TOKEN_VAULT_APP_ID does not isolate the Michael blob from any other holder of the same key.',
  'Close or state the gauge gap: michael-oauth-health is child G. Either sequence G before the first live consent, or add the interim manual check (node scripts/michael/google-consent.mjs --status) to the runbook, so an invalid_grant is not written to a column nobody reads.',
];

const warnings = [
  { severity: 'MEDIUM', issue: "TR-7's never-concurrent rule for port 3456 is a human convention with no code check; the only signal is EADDRINUSE from the callback server.", recommendation: 'Have runConsentFlow report a bound-port collision as a named refusal (PORT_IN_USE) rather than a raw listen error.' },
  { severity: 'MEDIUM', issue: "HostKeyEncryption inherits a self-generating getMasterKey it must never call; 'never touches .leo-keys' is pinned only behaviorally, so a future refactor could reintroduce silent self-generation, which VALIDATION b4ed3c2c measured produces an unrecoverable blob while reporting success.", recommendation: 'Add a test that spies fs reads during encrypt/decrypt and asserts no .leo-keys access.' },
  { severity: 'LOW', issue: 'Five greenfield files plus four test files will exceed the 100 LOC target and may approach the 400 non-test ceiling.', recommendation: 'FR-7 already requires the PR-body justification; measure non-test LOC before opening the PR and split Phase 3 if it breaches 400.' },
  { severity: 'LOW', issue: "This row is written with phase='PLAN' as instructed, while the peer PLAN-phase rows for this SD (SECURITY 05068c1a, DATABASE d08aa420, DESIGN 2ebb3b53) used phase='PLAN_PRD'.", recommendation: 'Confirm the handoff gate reads the phase value this row carries; a second row under PLAN_PRD is cheap if it does not.' },
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence_score: 88,

  timestamp: new Date().toISOString(),
  risk_level: 'HIGH',
  overall_risk_score: 6,
  risk_domains,
  rationale: 'HIGH overall, driven by operational risk 7 rather than by the cryptography. The security design is strong and unusually well evidenced for a PLAN artifact, and the technical change to the shared encryption module is one line with its consumers pinned. What is not yet closed is everything around the grant: the encryption key is not provisioned on the host, the gauge that makes a lapse visible belongs to a later child, the write primitive has no destructive-label or volume bound at this layer, and the unapplied -B migration means the whole child can go green without a real token ever moving. Five conditions, all cheap, none requiring a redesign. HIGH risk requires a documented mitigation plan, which the PRD largely already is; CONDITIONAL_PASS rather than FAIL because no finding blocks the approach and every condition is an addition to the PRD, not a change to it.',
  conditions,
  justification: 'CONDITIONAL_PASS: overall risk HIGH (max domain 7, operational). No finding invalidates the design; five conditions must be added to the PRD before EXEC-TO-PLAN, chiefly host key provisioning, a TRASH/SPAM refusal in modifyThread, and an explicit statement that this child ships fully unit-tested against an unapplied michael_credentials table.',
  critical_issues: [],
  warnings,
  recommendations: conditions,
  summary: 'RISK PLAN assessment for Michael child C (chairman Google OAuth). Overall HIGH (6/10), verdict CONDITIONAL_PASS on five conditions.',
  metadata: {
    sd_key: SD_KEY,
    prd_id: 'PRD-SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C',
    spec_source: 'docs/michael/02-SPEC.md section 4 (auth and credentials) + section 5 (venues)',
    domain_scores: { security_risk: 6, operational_risk: 7, technical_complexity: 4, delivery_risk: 6, data_risk: 6 },
    measurements: [
      'michael_credentials / michael_feeder_runs / michael_rules all return PGRST205 live - the -B migration is unapplied, so TABLES_ABSENT pre-flight (FR-4/TR-2) is load-bearing and all acceptance is unit-level',
      'MICHAEL_ENCRYPTION_KEY absent from host .env; GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET both present',
      'grep of .github/workflows for MICHAEL_ENCRYPTION_KEY / GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET returns zero files (FR-2 criterion already satisfied at PLAN time)',
      "vitest.config.js unit project already includes a repo-wide '**/*.test.js' glob, so TR-6 collection is satisfied without config change",
      'port 3456 appears once in lib and scripts: lib/integrations/youtube/oauth-manager.js:29 (REDIRECT_PORT)',
      'lib/security/encryption.cjs:13 class, :26 getMasterKey with self-generation at :50, :247 singleton module.exports - the FR-1 append point; consumers measured at lib/cleanup/credentials.js:14, lib/integrations/youtube/oauth-manager.js:24, lib/operator/cash-sources/token-vault.js:21',
      'scripts/michael/gmail-act.mjs planModify pushes --label through unvalidated; the lazy loader at :30-39 re-throws non-module-not-found (source of TR-5)',
      'server/index.js requireAuth block precedes the /api optionalAuth mount, so the FR-6 ordering requirement matches the file as it stands',
      'database/migrations/20260906_michael_tables.sql section 10 declares michael_credentials with key_fingerprint, RLS on, service-role-only, REVOKE from anon/authenticated/PUBLIC - FR-7 no-DDL holds',
    ],
    analysis_tree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-C',
    blocking_criteria_applied: 'HIGH risk requires a documented mitigation plan (met, with five additions); CRITICAL would block - no domain scored 9-10',
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID, targetApplication: 'EHG_Engineer', subAgentCode: 'RISK',
  fallback: 'EHG_Engineer', probeExistsRelative: 'package.json', supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution));
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('RISK', SD_ID, { name: 'RISK' }, results, {
  phase: 'PLAN', source: 'sub_agent_executor', sdKey: SD_KEY,
});
console.log('=== STORED ===');
console.log(JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }, null, 2));
