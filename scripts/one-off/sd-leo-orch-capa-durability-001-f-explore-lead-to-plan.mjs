#!/usr/bin/env node
/**
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F — Explore breadth search at LEAD-TO-PLAN.
 *
 * Records the findings from the explore-001f-worktree-residue sub-agent run (Task tool,
 * subagent_type=Explore) into sub_agent_execution_results, satisfying GATE_SUBAGENT_EVIDENCE's
 * "Explore" requirement -- the Explore agent itself does not write this row.
 */
import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { createClient } from '@supabase/supabase-js';

const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: sdRow, error: sdErr } = await supabase
  .from('strategic_directives_v2')
  .select('id')
  .eq('sd_key', SD_KEY)
  .single();
if (sdErr) throw sdErr;

const results = {
  verdict: 'PASS',
  confidence: 90,
  phase: 'LEAD',
  execution_time_ms: 0,
  summary: "Read lib/worktree-quota.js's classifyOrphanDirs (lines 279-411): its predicate is pure set-membership against `registered` paths (line 302) with no gitdir-target data, so a registered-but-broken-gitdir entry is indistinguishable from a healthy one -- detecting it needs richer `registered` entries ({path, gitdirTarget}) plus an existence check, a call-site change (emitOrphanWarningIfAny, line 433) not just a function change. Confirmed scripts/modules/shipping/post-merge-worktree-cleanup.js:393-400 emits worktree.husk_detected via console.warn with ZERO code consumers repo-wide (only hit outside code is a prose citation in a one-off doc). Identified the existing durable sink: lib/worktree-reaper/audit-sink.js's writeAuditSink(supabase, records, {runId, logger}) -> audit_log table, used at scripts/worktree-reaper.mjs:1751 and :1955 -- also flagged lib/worktree-reaper/close-husk.js as an existing husk-removal composition for a DIFFERENT call path (SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001). Queried all SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-* siblings (A-G): none besides F touch cadence-schedule restoration, and confirmed .github/workflows/worktree-reaper-cadence.yml already exists on disk.",
  critical_issues: [],
  warnings: [
    {
      id: 'EXP-1',
      severity: 'MEDIUM',
      issue: "classifyOrphanDirs's registered-set predicate cannot see registered-but-broken entries at all -- fixing it requires widening the shape of `registered` at every call site, not just the function body.",
      evidence: 'lib/worktree-quota.js:295,302 -- registered entries are plain {path} strings/objects today; a gitdir-target existence check needs additional data the current call sites do not gather.',
      location: 'lib/worktree-quota.js:279-411',
    },
    {
      id: 'EXP-2',
      severity: 'LOW',
      issue: 'A pre-existing husk-removal composition (closeHusk) exists for a different call path and could be a reuse candidate if scope ever widens from detection to remediation.',
      evidence: 'lib/worktree-reaper/close-husk.js composes safeRecursiveRmWithRetry + cwdResidencyBlocks for SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001; not wired to post-merge-worktree-cleanup.js.',
      location: 'lib/worktree-reaper/close-husk.js',
    },
  ],
  recommendations: [
    'PLAN: route both the new registered-but-broken-gitdir bucket and the existing worktree.husk_detected event through the confirmed durable sink (writeAuditSink -> audit_log), never a new ad-hoc table.',
    'PLAN: do not fold the new detection bucket into reapableDirs/orphan classification -- keep it distinct so the existing orphan gauge is not distorted.',
  ],
  detailed_analysis: {
    searched_identifiers: ['classifyOrphanDirs', 'worktree.husk_detected', 'writeAuditSink', 'closeHusk', 'parent_sd_id'],
    searched_paths: ['lib/worktree-quota.js', 'scripts/modules/shipping/post-merge-worktree-cleanup.js', 'lib/worktree-reaper/', 'scripts/worktree-reaper.mjs', 'strategic_directives_v2 (sibling query)'],
    sibling_children_found: ['A completed', 'B pending_approval', 'C completed', 'D completed', 'E pending_approval', 'F draft (this SD)', 'G draft'],
  },
  metadata: {
    breadth_search: true,
    exhaustive: false,
  },
};

const resolution = await resolveSubAgentRepo({
  sdId: sdRow.id,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'EXPLORE',
  probeExistsRelative: 'scripts/one-off/sd-leo-orch-capa-durability-001-f-explore-lead-to-plan.mjs',
  supabase,
});
applySubAgentRepoVerdict(results, resolution, { skipVerdictAdjust: false });

const stored = await storeSubAgentResults('EXPLORE', sdRow.id, { code: 'EXPLORE', name: 'Explore' }, results, {
  sdKey: SD_KEY,
  phase: 'LEAD',
});
console.log('STORED:', JSON.stringify({ id: stored?.id, verdict: stored?.verdict, phase: stored?.phase }));
