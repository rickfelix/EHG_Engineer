import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
const SD_ID='23c2a2d4-89af-4885-b87b-7a5b3c4ded1d', HEAD='0daea612633';
const NL=String.fromCharCode(10);
const results={
  verdict:'PASS', confidence:95, score:95,
  status:'PASS — all findings closed; STARVE-1 landed and verified at the committed HEAD',
  summary:
    'PASS at committed HEAD '+HEAD+', which supersedes row 3d7f0aec (PASS at 5a7082f7e7e, where STARVE-1 was '
    +'still open and the rebuild was uncommitted). EVERY finding raised across rounds 5-8 is now closed and '
    +'measured at the shipped commit: CI-1, CI-2, FORGE-4, SCRUB-1, SCRUB-2, STARVE-1, IDLE-2-R, IDLE-3-CODE, '
    +'IDLE-3-ORDER, OVERRIDE-1, FS-R1-AVAIL, NI-R2, and the fetch-breaking hardening (reverted, verified by '
    +'effect against the real credential helper). '
    +'THE SECURITY PROPERTY SURVIVED THE REFUSE->REBUILD CHANGE, which was the thing to check: rebuilding is '
    +'strictly stronger than refusing, because refusing left the plant on disk for the next tick while '
    +'rebuilding destroys it. Measured at '+HEAD+': a planted CI-1 payload is GONE after the rebuild (file back '
    +'to its committed content); a gitignored CI-2 node_modules plant is GONE; a stray debug.log now rebuilds '
    +'instead of starving, so the reaper proceeds. '
    +'THE DELETE I RECOMMENDED IS SAFE, and I measured the hazard rather than trusting the comment. '
    +'rebuildSourceTree is reachable only after the identity guard has proven the directory IS our linked '
    +'worktree at a basename-constrained path, so it cannot become a general delete primitive; and '
    +'removeWorktreeViaGit genuinely calls preUnlinkWorktreeNodeModules before `git worktree remove --force`. '
    +'NON-VACUOUS JUNCTION TEST: created a real junction .reaper-source/node_modules -> CANARY (verified '
    +'reachable through it first, so the setup could not silently no-op), confirmed the tree read '
    +'content-unverified with `!! node_modules/`, triggered the rebuild — the canary file and directory SURVIVE '
    +'intact and the junction is detached. The [git worktree remove follows a junction] data-loss mode is '
    +'genuinely handled. '
    +'THE CWD ESCAPE IS CLEAN AT GROUND TRUTH, verified independently rather than accepted: the live repo shows '
    +'33 worktrees, 0 prunable entries and no contentwt/ignoredwt branches. I then measured the suite itself — '
    +'branch-set hash and worktree count identical before and after a full run, so it no longer mutates the live '
    +'repository. Suite 17/17 green. '
    +'ONE ADVISORY REMAINS: the realgit fixture s realGit runner (line 37) is still UNBOUND (no cwd), and '
    +'buildSourceTreeWorktreeArgs and `worktree prune` carry no -C of their own. The symptom is fixed and '
    +'measured absent, but the SHAPE that produced the escape is still present, so a future test that reaches '
    +'the create or rebuild path through that runner can escape again. Binding realGit to the temp root would '
    +'close the class rather than the instance. Also carried: TOCTOU-2 (measured 247.6 ms, network-bound — the '
    +'ledger should not keep my retracted "milliseconds" wording) and the allowlist advisory (keep it at one '
    +'entry). Neither is a security finding.',
  conditions:[
    'ADVISORY: bind the realgit fixture runner to the temp root — the cwd-escape symptom is fixed and measured '
    +'absent, but the unbound-runner shape that caused it remains.',
    'ADVISORY: correct the TOCTOU-2 ledger entry to the measured 247.6 ms (local; network-bound in production) '
    +'rather than my retracted "bounded ms window".',
    'ADVISORY: keep the content-check allowlist at exactly one entry (.reap-protected.json).',
  ],
  metadata:{
    review_round:9, reviewed_head:HEAD, supersedes:'3d7f0aec (PASS at 5a7082f7e7e)',
    prior_rows:['199b97cf FAIL/62','8de81e2b FAIL/84','7149a67e FAIL/88','3d7f0aec PASS/92'],
    open_blocking:[], closed:['CI-1','CI-2','FORGE-4','SCRUB-1','SCRUB-2','STARVE-1','IDLE-2-R','IDLE-3-CODE','IDLE-3-ORDER','OVERRIDE-1','FS-R1-AVAIL','NI-R2'],
    measurements:{
      ci1_payload_after_rebuild:'DESTROYED — file restored to committed content',
      ci2_gitignored_plant_after_rebuild:'DESTROYED',
      starve1:'stray debug.log -> rebuilt (created:true), no longer starves',
      junction_canary:'junction verified reachable BEFORE the test; canary file+dir SURVIVE the rebuild; junction detached',
      junction_setup_control:'a first attempt failed to create the junction and was discarded as a vacuous pass rather than reported',
      live_repo_ground_truth:'33 worktrees, 0 prunable, no contentwt/ignoredwt branches',
      suite_mutation_probe:'branch-set hash + worktree count identical before/after a full suite run — no live mutation',
      suite:'17/17 green',
    },
    safety:'TR-1/TR-4 honoured. Shared-root contact read-only (config --get, ls-remote, status, for-each-ref). No reaping against the live pool. Scratch repos and the junction canary under the session temp dir only.',
  },
};
results.detailed_analysis=['VERDICT: '+results.verdict+' | SCORE: '+results.score+'/100 | HEAD: '+HEAD,'',results.summary,'',
  'CONDITIONS (all advisory)','='.repeat(60),results.conditions.map((c,i)=>(i+1)+'. '+c).join(NL+NL)].join(NL);
const res=await resolveSubAgentRepo({sdId:SD_ID,subAgentCode:'SECURITY',targetApplication:'EHG_Engineer',fallback:'EHG_Engineer'});
applySubAgentRepoVerdict(results,res);
const s=await storeSubAgentResults('SECURITY',SD_ID,{name:'Chief Security Architect'},results,{sdKey:'SD-LEO-INFRA-SCHEDULED-WORKTREE-REAPER-001',phase:'EXEC'});
console.log('STORED_ROW_ID='+(s?.id||s?.data?.id));
console.log('VERDICT='+results.verdict+' SCORE='+results.score);
