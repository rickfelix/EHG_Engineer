import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';

const SD_KEY = 'SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001';
const supabase = await getSupabaseClient();

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary:
    'Adversarial EXEC_TO_PLAN security review of the YouTube OAuth encrypt-at-rest remediation. The SD\'s own deliverables VERIFY CLEAN under independent measurement: live row 5ea38ba3 source_metadata is genuinely {} (re-measured directly, all 5 eva_sync_state rows scanned for ya29./1//0/token-key shapes: zero hits); no raw token was ever committed on this branch (git log --all -S"ya29." and -S"1//0" return only synthetic fixtures and prose in 1c75196ac5b, plus one false positive from an inline base64 PNG in 04d9623f226); oauth-manager.js is the ONLY code path in the repo that reads or writes eva_sync_state.source_metadata for the youtube_oauth identifier (all 4 sibling consumers verified: playlist-sync/todoist-sync write only counter columns via the atomic RPC, eva-idea-status selects a column list excluding source_metadata, cron-assert .neq\'s the credential row out); encryption is genuinely AES-256-GCM with a per-call random salt+IV; 12/12 tests pass. TWO residuals warrant conditions, neither a blocker and neither introduced by the SD\'s own code: (S-1) any authenticated JWT can read eva_sync_state TODAY -- measured, not inferred, by minting an HS256 role=authenticated token from SUPABASE_JWT_SECRET and getting HTTP 200 with all 5 rows including the youtube_oauth row; anon additionally holds table-level UPDATE (PATCH returned 204, not 403). The lockdown is staged chairman-gated under a SIBLING SD and is unapplied. This makes this SD\'s encrypt-at-rest the SOLE control over any future token in that row rather than defence-in-depth. (S-2) the AES master key .leo-keys is repo-root-relative (path.join(__dirname,"../../.leo-keys")), so key custody is now bound to the working tree while the ciphertext lives in a SHARED database -- a coupling that did not exist pre-fix. Measured: .leo-keys exists in exactly 1 of 222 worktrees (this SD\'s, auto-generated today) and NOT in the main repo root.',
  findings: [
    {
      id: 'S-1',
      severity: 'high',
      status: 'residual_out_of_scope_tracked_elsewhere',
      title: 'eva_sync_state is readable by ANY authenticated JWT and writable by anon TODAY; the lockdown is chairman-gated and unapplied',
      detail:
        'Measured with two independent instruments, not read from a doc. (a) Minted an HS256 JWT with role=authenticated / aud=authenticated from SUPABASE_JWT_SECRET and issued a raw fetch GET to /rest/v1/eva_sync_state?select=id,source_identifier,source_metadata -> HTTP 200, 5 rows returned, INCLUDING row 5ea38ba3 (youtube_oauth) with its full source_metadata. (b) Raw fetch PATCH with the anon key -> HTTP 204 (not 401/403), proving anon holds table-level UPDATE. The remediation for this is database/chairman-gated/20260826_eva_sync_state_rls_lockdown.sql, which carries "@approved-by: PENDING" and "STAGED, NOT APPLIED", and belongs to a DIFFERENT SD (SD-LEO-FEAT-IDEATION-INGESTION-CONNECTORS-001 FR-3). Impact on THIS SD: nothing leaks right now because source_metadata is {}. But the moment the chairman re-runs `npm run eva:ideas:auth:youtube`, an encrypted_tokens blob lands in a row that every signed-in app user can read. Encrypt-at-rest downgrades that from credential disclosure to ciphertext disclosure -- which is exactly why this SD matters -- but it means the SD is shipping its control as the ONLY layer, not as defence-in-depth. Also note anon\'s UPDATE right lets an attacker plant a fake legacy `tokens` key or a bogus encrypted_tokens blob; BOTH are correctly neutralised by this fix (getStoredTokens trusts only encrypted_tokens, and a forged blob fails the GCM auth tag -> null -> re-auth), so the fix is robust against the write half of the exposure. Verified this residual is NOT recorded anywhere on this SD: the strategic_directives_v2 row contains zero occurrences of rls/lockdown/anon/authenticated/pg_default_acl/TRUNCATE.',
      recommendation:
        'Do not block this SD. Cross-reference the chairman-gated lockdown from this SD\'s record and hold the next `eva:ideas:auth:youtube` re-auth until 20260826_eva_sync_state_rls_lockdown.sql is applied, so the new token never sits in an authenticated-readable row even as ciphertext.',
    },
    {
      id: 'S-2',
      severity: 'medium',
      status: 'new_coupling_introduced_by_this_fix',
      title: 'Master-key custody is now working-tree-scoped while the ciphertext lives in a shared DB',
      detail:
        'encryption.cjs sets keyPath = path.join(__dirname, "../../.leo-keys"), i.e. relative to the checkout the module is loaded from. Pre-fix, the token was plaintext in a shared DB and was readable from any tree. Post-fix, decryptability is bound to a per-tree file. Measured: .leo-keys exists in exactly ONE of 222 worktrees under .worktrees/ -- this SD\'s, mtime 2026-08-26 11:01, i.e. auto-generated by the first encrypt() call during this SD\'s work -- and does NOT exist in the main repo root at all. Consequence: auth performed from tree A produces ciphertext that tree B (or main, or a pruned-worktree future) cannot decrypt. This is availability, NOT confidentiality: getStoredTokens catches the decrypt failure, emits an explicit "vault present but UNREADABLE (tamper/corruption/key-rotation?)" warning, and returns null, so getAuthenticatedClient degrades to the "No stored tokens. Run npm run eva:ideas:auth:youtube" re-auth path. The failure is loud and fail-closed, which is why this is medium and not high. Materially distinct from the already-known F1 (.leo-keys file MODE 644): this is about key PATH SCOPING and cross-tree portability, not file permissions.',
      recommendation:
        'Resolve .leo-keys against the git COMMON dir (`git rev-parse --git-common-dir`) or an explicit LEO_MASTER_KEY_PATH env override, so all worktrees and the main checkout share one key. Interim: perform the YouTube re-auth from the MAIN repo checkout, never from a worktree, and back up .leo-keys before pruning any tree.',
    },
    {
      id: 'S-3',
      severity: 'low',
      status: 'pre_existing_shared_module_defect_newly_inherited',
      title: 'encryption.cjs#getMasterKey silently REGENERATES and OVERWRITES the master key on ANY read error, not just ENOENT',
      detail:
        'lines 26-55: the try block wraps fs.access + fs.readFile + JSON.parse, and the catch is a bare `catch (_error)` that unconditionally mints a new random key and fs.writeFile()s it over the existing path -- with no backup (unlike rotateKey(), which does back up). So a corrupt file, a JSON parse error, or a transient Windows EBUSY/EPERM lock (plausible in a 222-worktree concurrent fleet) silently destroys the ability to decrypt EVERY existing vault, and destroys the key file itself in the same action. Pre-existing and shared with lib/operator/cash-sources/token-vault.js, so NOT a regression from this SD -- but this SD newly makes DB-resident OAuth credentials depend on it, so the blast radius grew. Distinct from the already-known F1 (mode 644).',
      recommendation: 'Follow-up SD on the shared module: narrow the catch to ENOENT only, and refuse to overwrite an existing-but-unreadable .leo-keys.',
    },
    {
      id: 'S-4',
      severity: 'informational',
      status: 'not_a_regression_analysed_and_cleared',
      title: 'storeTokens read-modify-write race is PRE-EXISTING and cannot resurrect plaintext',
      detail:
        'Answering the TOCTOU question directly and comparing against 1c75196ac5b^. The pre-fix code was `const metadata = { ...(existing?.source_metadata || {}), tokens }` followed by an UPDATE by id -- structurally IDENTICAL read-modify-write to the new `const { tokens: _legacyPlaintext, ...restMetadata } = existing?.source_metadata || {}`. So the lost-update window is pre-existing, not introduced. Critically, the race cannot reintroduce plaintext: both racing writers destructure the legacy `tokens` key out of THEIR OWN snapshot, so whichever write lands, the legacy key is gone. Worst case is one valid ciphertext overwriting another valid ciphertext, and the loser is recovered by the normal expiry-refresh path. Cross-writer clobber with the new atomic RPC (20260826_eva_sync_state_atomic_result_rpc.sql) is also a non-issue: that RPC sets only counter columns, and PostgreSQL READ COMMITTED applies an UPDATE\'s SET list to the latest committed row version, so disjoint-column updates on the same row do not clobber each other.',
      recommendation: 'No action. Recorded so a future reviewer does not re-open it.',
    },
    {
      id: 'S-5',
      severity: 'low',
      status: 'new_failure_point_hardening_suggestion',
      title: 'runOAuthFlow can orphan a freshly-minted Google refresh_token if the encrypt/persist step fails',
      detail:
        'Read runOAuthFlow end-to-end and confirmed it works with the new storeTokens: getToken(code) -> storeTokens(tokens) -> encrypt -> UPDATE/INSERT, and getStoredTokens round-trips it (proven live by the round-trip test and by the INSERT-branch test). Also confirmed the refresh path in getAuthenticatedClient is safe: google-auth-library oauth2client.js:288-290 explicitly re-attaches this.credentials.refresh_token onto the refreshed token object, so storeTokens never persists a vault that has lost its refresh_token. The new risk is narrow: adding an encryption step between getToken and persist creates one more way for persistence to fail AFTER the browser consent has already been burned and Google has already minted a long-lived refresh_token (e.g. .leo-keys unwritable). storeTokens now correctly THROWS instead of swallowing, which is a strict improvement, but the just-minted token is then live at Google with no local record and no revoke. Orphaning was possible pre-fix too (the old code swallowed DB errors silently), so this is an incremental new failure POINT, not a new failure CLASS.',
      recommendation: 'Wrap the storeTokens call in runOAuthFlow so that a persist failure revokes the just-issued token via oauth2.googleapis.com/revoke before rethrowing.',
    },
    {
      id: 'S-6',
      severity: 'informational',
      status: 'verified_clean',
      title: 'No remaining code path can reintroduce plaintext; no token ever entered git',
      detail:
        'Broad grep, not single-file. Every repo reference to eva_sync_state was enumerated and each consumer read: lib/integrations/youtube/playlist-sync.js (RPC + a consecutive_failures SELECT only), lib/integrations/todoist/todoist-sync.js and lib/integrations/claude-code/release-monitor.js (no source_metadata reference at all), scripts/eva-idea-status.js (explicit column list that EXCLUDES source_metadata), scripts/eva-idea-sync-cron-assert.mjs (.neq on SYNC_STATE_IDENTIFIER, so it never touches the credential row), scripts/eva/eva-trend-snapshot.mjs. grep for source_metadata across lib/ scripts/ tests/ returns oauth-manager plus only the unrelated risk-classifier evidence system. The two committed one-off scripts that DO read the legacy `tokens` key (purge-exposed-youtube-oauth-token.mjs, revoke-exposed-youtube-oauth-token.mjs) are read-then-delete utilities that write no plaintext to disk or stdout and are verified idempotent no-ops post-purge ("No plaintext `tokens` key present on this row -- already purged"). Git history: `git log --all -S"ya29."` and `-S"1//0"` return only 1c75196ac5b (synthetic fixtures ya29.a0-fixture-access-token / 1//01-fixture-refresh-token plus descriptive prose) and 04d9623f226 (false positive: an inline base64 PNG in an HTML review packet). .env and .leo-keys are both gitignored and neither is tracked. The archived pre_purge_evidence is genuinely structure-only (types, lengths, 4-char prefixes "ya29"/"1//0").',
      recommendation: 'No action.',
    },
  ],
  warnings: [
    'S-1: this SD\'s encrypt-at-rest is currently the SOLE control over the credential row, not defence-in-depth, because the eva_sync_state RLS/grant lockdown is chairman-gated and unapplied. Verified live (authenticated JWT -> HTTP 200, 5 rows; anon PATCH -> HTTP 204).',
    'S-2: the AES master key exists in exactly 1 of 222 worktrees and nowhere in the main repo root. Re-auth from a worktree will produce ciphertext that becomes undecryptable when that worktree is pruned.',
    'Criterion #5 (third-party consent-grant verification at the Google account level, as distinct from this token\'s validity) remains only partially satisfiable without chairman console access -- already documented by the LEAD-phase VALIDATION pass, restated here only for handoff completeness, not as a new finding.',
  ],
  recommendations: [
    'Merge as-is. The SD\'s stated remediation is independently verified complete and the fix is materially robust (it neutralises both the read and the write half of the underlying exposure).',
    'Cross-reference database/chairman-gated/20260826_eva_sync_state_rls_lockdown.sql from this SD and hold the next YouTube re-auth until it is applied (S-1).',
    'Resolve .leo-keys against `git rev-parse --git-common-dir` or a LEO_MASTER_KEY_PATH override so key custody is not worktree-scoped; until then, re-auth ONLY from the main checkout (S-2).',
    'File a follow-up on lib/security/encryption.cjs#getMasterKey to narrow its catch-all key-regeneration to ENOENT (S-3).',
    'Add revoke-on-persist-failure to runOAuthFlow so a burned consent cannot leave an orphaned live refresh_token (S-5).',
  ],
  validation_mode: 'retrospective',
  metadata: {
    recorded_by: 'security-agent (Task tool dispatch)',
    assessment_type: 'exec_to_plan_security_review',
    commit_reviewed: '1c75196ac5b',
    branch: 'feat/SD-FDBK-ENH-SECURITY-CRITICAL-SAFETY-001',
    files_read_in_full: [
      'lib/integrations/youtube/oauth-manager.js',
      'lib/integrations/youtube/oauth-manager.test.js',
      'lib/security/encryption.cjs',
      'lib/operator/cash-sources/token-vault.js',
      'database/migrations/20260826_eva_sync_state_atomic_result_rpc.sql',
      'database/chairman-gated/20260826_eva_sync_state_rls_lockdown.sql',
      '1c75196ac5b^:lib/integrations/youtube/oauth-manager.js (pre-fix, for regression comparison)',
    ],
    live_measurements: {
      eva_sync_state_row_5ea38ba3_source_metadata: '{} (re-measured directly via service role; all 5 rows scanned, zero token-shaped values in any column)',
      anon_select_eva_sync_state: 'HTTP 200, 0 rows (RLS-filtered; table grant present)',
      anon_patch_eva_sync_state: 'HTTP 204 (not 403) => anon holds table-level UPDATE',
      authenticated_jwt_select_eva_sync_state: 'HTTP 200, 5 rows returned INCLUDING the youtube_oauth credential row with full source_metadata',
      git_log_all_S_ya29: '1 commit (this branch, synthetic fixtures + prose only)',
      git_log_all_S_refresh_token_prefix: '2 commits (this branch fixtures; 04d9623f226 false positive = inline base64 PNG)',
      leo_keys_worktree_census: '1 of 222 worktrees has .leo-keys; main repo root has none',
      unit_tests: '12/12 passed (vitest, lib/integrations/youtube/oauth-manager.test.js)',
    },
    already_known_not_re_flagged: ['F1 (.leo-keys mode 644)', 'F2 (appId is a label not a domain separator)', 'criterion #5 partial satisfiability'],
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_KEY,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  supabase,
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', SD_KEY, null, results, { phase: 'EXEC_TO_PLAN' });
console.log('Stored SECURITY evidence id:', stored.id);
console.log('verdict stored:', results.verdict, '| findings:', results.findings.length);
