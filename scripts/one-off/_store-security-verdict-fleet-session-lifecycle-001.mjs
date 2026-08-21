#!/usr/bin/env node
/**
 * Persist the EXEC-phase SECURITY review for SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001. The
 * security-agent run (agentId a51da7d2445359fa8) was interrupted mid-task by an account weekly
 * usage limit, then a resume attempt was itself blocked by a temporarily-unavailable safety
 * classifier (transient, not a denial). A second resume succeeded and delivered a full PASS
 * verdict. The orchestrator supplemented with its own quick checks (textContent-only rendering,
 * requireAuth mount, one-off script table scope) for the small slice of the original prompt the
 * resumed agent flagged it may not have covered.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(path.resolve(__dirname, '..', '..'), '.env') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SD_KEY = 'SD-LEO-INFRA-FLEET-SESSION-LIFECYCLE-001';
const { data: sd, error: sdErr } = await supabase
  .from('strategic_directives_v2').select('id, sd_key, target_application').eq('sd_key', SD_KEY).maybeSingle();
if (sdErr || !sd) { console.error('SD lookup failed', sdErr); process.exit(1); }

const results = {
  verdict: 'PASS',
  confidence: 90,
  status: 'completed',
  summary: 'No command-injection, XSS, auth-bypass, or information-disclosure exposure found. scripts/fleet-kill.mjs\'s new isWorktreeDirty runs `git status --porcelain` as a HARDCODED literal command string with zero interpolation -- worktreePath is used solely as the cwd option (an OS-level directory argument to spawn, never shell-parsed), so there is no interpolation point to attack in the first place; worst case is a failed spawn/ENOENT, caught and treated as fail-closed (dirty:true). No HTTP route reaches gracefulKillSession -- it is only reachable via the FLEET_GRACEFUL_KILL_ENABLED-gated operator CLI. server/routes/fleet-actions.js remains mounted behind requireAuth (confirmed at server/index.js:282, unchanged). fleet-panel.js renders server-provided uiLabel via textContent only -- no innerHTML/insertAdjacentHTML anywhere in the app code (one innerHTML hit exists only in a test file\'s jsdom fixture setup, unrelated). decideSingletonSpawn\'s refusal reason (unchanged by this SD) exposes only an 8-character session_id prefix plus a heartbeat age -- the FR-1 resolver swap changes WHICH candidate rows can reach this function (removing a staleness pre-filter), not what gets exposed once reached, so no new information-disclosure surface. All 8 new one-off scripts in this diff touch only product_requirements_v2/strategic_directives_v2 (SD/PRD bookkeeping) -- no auth/credentials/permissions tables. Shared-root .env confirmed gitignored and clean.',
  findings: [
    {
      id: 'SEC-INJECTION-001',
      severity: 'INFO',
      title: 'isWorktreeDirty has no command-injection exposure -- stronger than provenance reasoning alone shows',
      detail: 'scripts/fleet-kill.mjs execSync(\'git status --porcelain\', {cwd: worktreePath, ...}) -- the command argument is a hardcoded literal with zero interpolation; worktreePath never touches the command text, only the cwd option (an OS-level spawn argument, never shell-parsed). Sibling consumer lib/fleet/prepark-wip.cjs\'s git() helper uses the same cwd-only pattern (pre-existing, out of this SD\'s scope, confirmed not re-exposing the value). Attack surface: gracefulKillSession has zero HTTP callers repo-wide -- reachable only via the operator CLI scripts/fleet-kill.mjs, gated on FLEET_GRACEFUL_KILL_ENABLED=on.',
    },
    {
      id: 'SEC-PROVENANCE-002',
      severity: 'INFO',
      title: 'worktree_path is system-generated, never attacker/user-controlled (mechanism corrected mid-review)',
      detail: 'The orchestrator\'s own initial trace named lib/lifecycle/worktree-state-writer.mjs as the exclusive writer -- the security-agent found this module has ZERO production callers (dead relative to its own "single-owner writer" docblock claim). The actual writers are scripts/resolve-sd-workdir.js\'s persistWorktreePath() (fed by createWorktree()/filesystem-scan results, called from sd-start.js\'s resolveWorkdir()) and scripts/hooks/concurrent-session-worktree.cjs (path built from a sanitized session-id). Conclusion unchanged despite the correction: every real write path constructs the value locally from repo-relative components, none derive it from HTTP/user input.',
    },
    {
      id: 'SEC-AUTH-003',
      severity: 'INFO',
      title: 'requireAuth mount confirmed unchanged; XSS surface confirmed clean',
      detail: 'server/index.js:282 mounts /api/fleet-actions behind requireAuth (unchanged by this SD). fleet-panel.js uses textContent exclusively for all server-provided data including the new uiLabel field -- grepped for innerHTML/insertAdjacentHTML across the app code, zero hits (the one hit anywhere in the diff is in a test file\'s jsdom fixture bootstrap, a different context entirely).',
    },
    {
      id: 'SEC-RETIRE-004-CONTEXT',
      severity: 'INFO',
      title: 'Adjacent retirePredecessorProcess path (not part of this SD\'s diff) reviewed as context -- correctly fail-closed',
      detail: 'lib/fleet/spawn-control.js retirePredecessorProcess: pid validated (Number.isInteger && >0) before use, fail-closed identity probe (only a positive MATCH proceeds), SIGTERM->verify->SIGKILL->verify escalation, never throws, order-gated on confirmed succession, reuses the same killProcessOnly/pidIsClaude primitives as graceful-kill. killProcessOnly uses array-form execFile args (not shell). pidIsClaude does build an interpolated shell command but pid is a strictly-validated integer before it can reach the string. Pre-existing code, not modified by this SD -- reviewed only as adjacent context.',
    },
  ],
  critical_issues: [],
  warnings: [
    'Non-blocking, belongs to a different/earlier SD (SD-LEO-INFRA-LEO-INFRA-SESSION-001): worktree-state-writer.mjs\'s "single-owner writer, all writes must route through this module" docblock claim is inaccurate (the module has zero production callers). Its would-be enforcement guard, tests/unit/session-writer/no-bypass.test.js, is currently quarantined (quarantine-manifest.json, 2026-06-11, reason_class:assertion-drift) rather than fixed. Suggested as a follow-up QF, not a gate on this SD.',
  ],
  recommendations: [
    'Proceed to EXEC-TO-PLAN handoff -- no security-blocking findings.',
    'Consider a follow-up QF to un-quarantine or replace tests/unit/session-writer/no-bypass.test.js and correct worktree-state-writer.mjs\'s stale docblock claim (separate SD\'s technical debt, surfaced incidentally during this review).',
  ],
  detailed_analysis: 'Two-part EXEC-phase SECURITY review, interrupted once by an account weekly usage limit (agentId a51da7d2445359fa8, resumed after a transient safety-classifier-unavailable error also cleared). Ran 211/211 relevant tests across 10 files during the resumed pass (graceful-kill, predecessor-retirement, fleet-kill-cli, worktree-state-writer, spawn-control, resume-context, release-work-item, spawn-control-stop-workitem, process-utils kill-only, console-reaper). Orchestrator supplemented with direct verification of the fleet-panel/requireAuth/one-off-script slice the resumed agent flagged as possibly outside its reconstructed scope.',
  metadata: {
    phase: 'EXEC',
    sd_key: SD_KEY,
    gate: 'EXEC-TO-PLAN pre-handoff validation',
    pr_number: 7339,
    interruptions: ['account_weekly_usage_limit', 'safety_classifier_temporarily_unavailable'],
    metrics: {
      tests_verified: 211,
      test_files_verified: 10,
      critical_findings: 0,
      info_findings: 4,
      warnings: 1,
    },
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sd.id,
  targetApplication: sd.target_application || 'EHG_Engineer',
  subAgentCode: 'SECURITY',
  fallback: 'EHG_Engineer',
  probeExistsRelative: 'package.json',
  supabase,
});
console.log('Repo resolution:', JSON.stringify(resolution, null, 2));

applySubAgentRepoVerdict(results, resolution);

const stored = await storeSubAgentResults('SECURITY', sd.id, { name: 'SECURITY' }, results, {
  phase: 'EXEC',
  source: 'manual',
  sdKey: SD_KEY,
});

console.log('\n=== STORED ===');
console.log(JSON.stringify(stored, null, 2));
