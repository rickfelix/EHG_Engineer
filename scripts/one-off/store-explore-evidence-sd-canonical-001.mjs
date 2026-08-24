// SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 — Explore sub-agent evidence writer (LEAD phase).
// Canonical path: resolveSubAgentRepo -> applySubAgentRepoVerdict -> storeSubAgentResults.
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const SD_ID = 'SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001';
const PHASE = 'LEAD';

const results = {
  verdict: 'PASS',
  confidence: 90,
  summary:
    'Explored the full canonical-writer-choke investigation surface for strategic_directives_v2: the quarantined guard test ' +
    '(tests/unit/governance/canonical-helper-bypass-guard.test.js, a GENERIC registry-driven test covering two rows ' +
    '-- strategic_directives_v2->handoff.js and feedback->emit-feedback.js -- quarantined via tests/quarantine-manifest.json:757-764 ' +
    'because the feedback row failed, not the SD-v2 row); the per-line regex scanner (verifyHelperCoverage(), ' +
    'scripts/lib/lead-precheck-helpers.js:300-421, requiring .from() and .insert/upsert/update( on the SAME physical line, ' +
    '0% recall on the dominant multi-line Supabase chain style -- confirmed live it does not see SDRepository.js or ' +
    'lib/sd-park.js, the two most important lifecycle-column writers); real non-exempted lifecycle-column writers ' +
    '(scripts/cancel-sd.js/npm run sd:cancel, scripts/reactivate-sd.js/sd:reactivate, scripts/sd-recover.js/sd:recover -- ' +
    'confirmed LIVE npm commands via package.json, not dead code; scripts/leo-orchestrator-enforced.js/leo:execute; ' +
    'scripts/update-directive-status.js/update-status using the ANON key; lib/sd-park.js writing via raw SQL and load-bearing ' +
    'per its own header comment documenting a deliberate dependency on auto_transition_status firing off the progress column); ' +
    'the existing current_setting(\'app.actor\') GUC precedent (database/chairman-gated/20260802_sd_mutation_audit_trigger.sql, ' +
    'read by log_sd_mutation_audit() but with zero set_config(\'app.actor\') call sites anywhere in the codebase -- confirmed dead); ' +
    'the handoff_actor_policy(created_by) SSOT registry-function precedent (database/migrations/20260530_unify_handoff_actor_policy_ssot.sql, ' +
    'already consumed by 2 live triggers); the very recent same-day freeze-trigger precedent (database/chairman-gated/' +
    '20260823_eva_stage_gate_attempts.sql and 20260823_chairman_ratifications.sql, both using ENABLE ALWAYS TRIGGER + custom SQLSTATEs); ' +
    'and the architecture eval document (.artifacts/solomon-arch-eval-20260823.md, S2 finding 1 / R5, the chairman-approved provenance).',
  findings: [
    { id: 'quarantine-is-generic-not-sdv2-specific', severity: 'warning', note: 'The quarantined test covers TWO registry rows; it was quarantined because the feedback row failed (13 unexempted sites per the manifest), not because of the strategic_directives_v2 row. Un-quarantining requires resolving BOTH rows or restructuring the test so SD-v2 disposition is independent.' },
    { id: 'scanner-zero-recall-on-real-writers', severity: 'critical', note: 'verifyHelperCoverage() is per-line-regex and requires .from()/.update( on the same physical line -- confirmed live it does not detect SDRepository.js (the canonical writer itself) or lib/sd-park.js (load-bearing raw-SQL writer). Its 16 live findings are 100% metadata/scope/description writes, none of which are the invariant it exists to catch.' },
    { id: 'five-of-six-writers-are-live-npm-commands', severity: 'critical', note: 'cancel-sd.js (sd:cancel), reactivate-sd.js (sd:reactivate), sd-recover.js (sd:recover -- the disaster-recovery tool), leo-orchestrator-enforced.js (leo:execute), and update-directive-status.js (update-status) are all confirmed LIVE via package.json, not dead code as the SD plan_content originally assumed. A naive trigger implementation would break cancellation, reactivation, and disaster recovery.' },
    { id: 'app-actor-guc-confirmed-dead', severity: 'critical', note: 'current_setting(\'app.actor\') is read by exactly one function with zero set_config(\'app.actor\') call sites anywhere in the codebase -- the originally chairman-approved identity mechanism cannot work as designed.' },
    { id: 'handoff-actor-policy-precedent', severity: 'info', note: 'handoff_actor_policy(created_by) is the strongest existing precedent for a registry-function-based trusted-writer allowlist, already consumed by 2 live triggers and already carrying graded capability flags -- the recommended template for this SD\'s own registry.' },
  ],
  metadata: {
    quarantine_manifest_path: 'tests/quarantine-manifest.json:757-764',
    scanner_path: 'scripts/lib/lead-precheck-helpers.js:300-421',
    live_npm_writers: ['sd:cancel', 'sd:reactivate', 'sd:recover', 'leo:execute', 'update-status'],
    app_actor_guc_set_config_call_sites: 0,
    architecture_eval_doc: '.artifacts/solomon-arch-eval-20260823.md',
  },
  execution_time_ms: 900000,
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  subAgentCode: 'Explore',
  targetApplication: 'EHG_Engineer',
});
applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('Explore', SD_ID, { name: 'Explore Discovery Agent' }, results, { phase: PHASE });
console.log('STORED_VERDICT=' + results.verdict);
console.log('STORED_ROW_ID=' + (stored?.id || stored?.data?.id || JSON.stringify(stored)));
console.log('STORED_PHASE=' + (stored?.phase || 'n/a'));
console.log('STORED_SD_ID=' + (stored?.sd_id || 'n/a'));
console.log('REPO_PATH=' + results.metadata.repo_path);
console.log('EXECUTED_FROM_CWD=' + results.metadata.executed_from_cwd);
