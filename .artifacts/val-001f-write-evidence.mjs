#!/usr/bin/env node
/**
 * VALIDATION (Principal Systems Analyst) LEAD-phase verdict for
 * SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F.
 * Canonical repo-evidence + storage pattern per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../lib/sub-agent-executor/supabase-client.js';

const SD_ID = 'e59034d1-0e8c-4bb8-8846-5de21c47abbf';
const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F';

const findings = [
  {
    id: 'V1-no-duplicate-no-inflight',
    severity: 'INFO',
    summary: 'NO DUPLICATE / NO IN-FLIGHT WORK for either surviving fix shape. (a) classifyOrphanDirs: 7 call/reference sites (lib/worktree-quota.js:279 definition, :433 emitOrphanWarningIfAny, lib/worktree-reaper/orphan-sweep.js:107, plus 3 test files). Last commits touching lib/worktree-quota.js: 4c09665a13a + 6bf6c940514 (SD-LEO-INFRA-ORPHAN-SWEEP-HARD-001, content-probe hardening) and 109734815d3 (SD-LEO-INFRA-ORPHAN-WORKTREE-SWEEP-001) -- none added a registered-entry predicate. (b) husk_detected: emitted at exactly ONE site, scripts/modules/shipping/post-merge-worktree-cleanup.js:394, via console.warn(JSON.stringify(...)); repo-wide git grep for the literal event name returns that emitter and nothing else -- zero consumers confirmed, the RCA premise holds. (c) 40 open PRs scanned via gh pr list: none touch lib/worktree-quota.js or post-merge-worktree-cleanup.js. (d) SD search on husk/classifyOrphanDirs/worktree residue: 15 husk-matching SDs are all .husky pre-commit hook noise except SD-LEO-INFRA-WORKTREE-LIFECYCLE-FAILS-001 (completed -- it ADDED this console.warn) and SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001 (completed -- see V4). Zero SDs match classifyOrphanDirs. QF search: QF-20260801-565 (cancelled) and QF-20260801-998 (completed) touch isReapable, not the registered-entry predicate. GO on both fix shapes.',
  },
  {
    id: 'V2-durable-surface-identified',
    severity: 'INFO',
    summary: 'DURABLE SURFACE ANSWER (fix shape 3 target, cite this rather than guessing): lib/worktree-reaper/audit-sink.js -> writeAuditSink(supabase, records, { runId, logger }) inserting into the generic audit_log table. Exports: buildAuditRows, writeAuditSink, severityForVerdict, EVENT_TYPE = "worktree_reaper_classification". Existing callers: scripts/worktree-reaper.mjs:1751 and :1955. It is LIVE, not aspirational -- queried audit_log directly and found rows landing at 2026-09-07T05:11:04Z (5 most recent, entity_id = worktree paths, severities info/warning). Distinct worktree-related event_types present in audit_log today: exactly two -- worktree_reaper_classification (via the sink module) and worktree_orphan_sweep (written INLINE at scripts/worktree-reaper.mjs:1318, not via the sink). Two schema hazards the PRD must carry: (1) audit_log_severity_check allows ONLY {info, warning, error, critical} -- this module previously wrote low/medium and EVERY non-keep row was silently rejected (writeAuditSink never throws by design, so the rejection was invisible; a live measurement found ZERO rows had landed since the sink shipped, fixed under SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-3); (2) buildAuditRows maps the reaper buildRecord() shape (verdict/reason/dirty_file_count/unpushed_commit_count/age_days/ship_status/claim_status), so a husk event either conforms to that shape, gets a new verdict key in SEVERITY_BY_VERDICT, or needs its own row builder.',
  },
  {
    id: 'V3-terminology-collision-scope-precision-required',
    severity: 'HIGH',
    summary: 'SCOPE-PRECISION DEFECT IN THE BRIEF AS WRITTEN -- the word "husk" names TWO DIFFERENT residue classes in this repo, and fix shape 1 as briefed conflates them. REPO DEFINITION (lib/worktree-reaper/close-husk.js:4, lib/worktree-manager.js:1867-1870, post-merge-worktree-cleanup.js:381-386, all three agreeing): a husk is "a worktree that was DEREGISTERED from git while its DIRECTORY survived". That class is UNREGISTERED-on-disk, so classifyOrphanDirs ALREADY sees and classifies it (it is not in registeredSet, so it flows past lib/worktree-quota.js:295 into the orphan path; lines 386-396 even document the sub-case of a surviving .git file pointing at a nonexistent gitdir). BRIEFED DEFINITION (fix shape 1): "REGISTERED entries whose .git link file / gitdir target is missing" -- i.e. the set `git worktree prune` reports. That is the OPPOSITE direction (git admin entry survives, target does not) and classifyOrphanDirs genuinely CANNOT see it, for two independent reasons: it enumerates the FILESYSTEM (fs.readdirSync of .worktrees), so a registered entry whose directory is gone is never visited at all; and lib/worktree-quota.js:295 `if (registeredSet.has(cmpKey(full))) continue;` skips registered paths BEFORE total++ and before every predicate. CONSEQUENCE FOR THE ACCEPTANCE CRITERION: the briefed AC ("a pure-function test against a husk-shaped fixture returns husk-among-them=true") is ZERO-YIELD BY CONSTRUCTION if PLAN builds the fixture to the REPO definition -- a deregistered-dir-remains fixture passes against todays unmodified classifyOrphanDirs. The PRD must name the class as "registered-entry-with-missing-gitdir (the git worktree prune set)" and must NOT reuse the word husk for it.',
  },
  {
    id: 'V4-premise-measured-live-against-current-tree',
    severity: 'INFO',
    summary: 'PREMISE MEASURED, not assumed. Ran `git worktree prune --dry-run -v` read-only in the main repo (C:/Users/rickf/Projects/_EHG/EHG_Engineer): it reports exactly ONE prunable entry right now -- "Removing worktrees/SD-LEO-DOC-FOUNDATION-AUDIT-LENS-001: gitdir file points to non-existent location". So the defect class is non-empty on the live tree, and the brief is correct that prune computes the set for free. Also measured: 29 git-registered worktrees vs 36 directories under .worktrees/ (a 7-dir spread, the population the orphan gauge already watches). Supporting detail the PRD should cite: lib/worktree-reaper/orphan-sweep.js:225-228 ALREADY EXECUTES `git worktree prune` best-effort after archiving, discarding its findings entirely -- the information fix shape 1 wants is already being computed and thrown away in the reaper path today.',
  },
  {
    id: 'V5-ship-path-husk-gets-neither-record-nor-reap',
    severity: 'HIGH',
    summary: 'FIX SHAPE 3 IS STRONGER THAN BRIEFED, and the reason sharpens the PRD. There are TWO husk-producing code paths and they are NOT the same module. PATH A (LEAD-FINAL-APPROVAL): scripts/modules/handoff/executors/lead-final-approval/index.js:1134 calls cleanupWorktree(sdKey) from lib/worktree-manager.js, which returns reason=husk_directory_remains (worktree-manager.js:1870); index.js:1148 consumes that and index.js:1168 calls closeHusk() from lib/worktree-reaper/close-husk.js (shipped by SD-LEO-INFRA-REAP-COMPLETED-WORKTREE-001). So path A gets a REMEDIATION -- though still no durable record. PATH B (THE SHIP PATH): cleanupWorktreeByPath() in post-merge-worktree-cleanup.js:315, whose husk branch at :394 console.warns worktree.husk_detected and returns reason=husk_directory_remains to callers cleanupBySDKey / cleanupCurrentWorktree / cleanupOrphanFromMergeOutput and the CLI documented at .claude/commands/ship.md:711. closeHusk is imported ONLY by lead-final-approval/index.js:211 -- git grep confirms no other production importer. NET: the ship path husk gets NEITHER a durable record NOR a reap, and its only trace is a console.warn from a script that /ship invokes non-interactively. IMPLEMENTATION IS CHEAP: post-merge-worktree-cleanup.js ALREADY imports createClient from @supabase/supabase-js at line 4 and carries 14 supabase references, so wiring writeAuditSink needs no new client plumbing.',
  },
  {
    id: 'V6-no-sibling-scope-collision',
    severity: 'INFO',
    summary: 'NO SIBLING SCOPE COLLISION. Parent SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001 (uuid 49a1659f-33f1-4b7f-912d-076c8f70ea0f -- note parent_sd_id stores the UUID, not the sd_key; a sd_key-keyed sibling query returns empty with NO error) has 7 children: A (completed, role seat DB checkpoints), B (pending_approval, commit-pinned paths / content hashes), C (completed, transport-layer test isolation), D (completed, comms hardening), E (pending_approval, audit table immutability triggers), F (this SD), G (draft, post-compaction contract re-read). None of A/B/C/D/E/G touches worktree reaping, reaper cadence, or scheduling. Fix shape 2 (reaper cadence restoration + spurious-issue-on-zero-scanned) is therefore correctly OUT of F scope AND is currently assigned to NO sibling and to no other SD I could find (SD search for "reaper cadence" returns only the completed SD-FDBK-FIX-WORKTREE-REAPER-DESTROYED-001; QF search returns zero). Flagging for the coordinator: fix shape 2 is unsourced work, not merely deferred work -- there is a live .github/workflows/worktree-reaper-cadence.yml and a lib/coordinator/reaper-cadence-gauge.cjs, so the surface exists but no open item owns the deferred fix.',
  },
];

const warnings = [
  'V3 (HIGH): the PRD must NOT adopt the brief\'s "husk-shaped fixture" wording for fix shape 1. Under this repo\'s own three-file-consistent definition of husk (deregistered, directory survives), classifyOrphanDirs already returns that class, so the stated acceptance criterion would pass against unmodified code -- a dead-by-construction test. Name the target class "registered entry whose gitdir target is missing (the `git worktree prune` set)" and write the fixture to that.',
  'V2: audit_log_severity_check accepts only {info, warning, error, critical}. Any new husk verdict key added to SEVERITY_BY_VERDICT must map into that set, and writeAuditSink swallows insert errors by design -- so the PRD acceptance criterion for fix shape 3 must be "a row is READ BACK from audit_log", never "writeAuditSink returned ok". The identical trap already cost this module every non-keep row once (SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-3).',
  'V5: fix shape 3 as briefed ("give husk_detected a durable consumer") should be scoped explicitly to PATH B (post-merge-worktree-cleanup.js). Path A already has a remediation via closeHusk but also lacks a durable record; if the PRD intends both paths, say so, because they are different modules with different return-value producers.',
];

const recommendations = [
  'GO for LEAD approval on both surviving fix shapes -- no duplicate implementation, no in-flight PR, no overlapping SD/QF, no sibling collision.',
  'PRD fix shape 1: extend classifyOrphanDirs (lib/worktree-quota.js:279) to additionally report the `git worktree prune --dry-run -v` set as a distinct bucket (do NOT fold it into reapableDirs -- the function already keeps refused/excluded as separate buckets precisely so the orphan gauge is not distorted). Keep it OPT-IN behind an injected runner, matching the existing `probe`/`gitRunner` opt-in convention documented at lines 314-322: emitOrphanWarningIfAny reaches this function on EVERY `git worktree add`, and that hot path must stay zero-extra-I/O.',
  'PRD fix shape 3: import writeAuditSink from lib/worktree-reaper/audit-sink.js into scripts/modules/shipping/post-merge-worktree-cleanup.js (which already has a supabase client) and emit a row alongside the existing console.warn at line 394. Acceptance = a SELECT against audit_log returns the row, not a truthy return value.',
  'Route V6 (fix shape 2 is unsourced, not just deferred) back to the coordinator as an information item -- it needs its own SD/QF or it will be lost between this SD and the parent.',
];

async function main() {
  const supabase = await getSupabaseClient();
  const resolution = await resolveSubAgentRepo({
    sdId: SD_ID,
    targetApplication: 'EHG_Engineer',
    subAgentCode: 'VALIDATION',
    fallback: 'EHG_Engineer',
    supabase,
  });

  let results = {
    verdict: 'PASS',
    confidence: 92,
    findings,
    warnings,
    recommendations,
    summary: 'GO. Neither surviving fix shape is already implemented, in flight, or covered by another SD/QF/sibling. Durable surface for fix shape 3 identified concretely as lib/worktree-reaper/audit-sink.js writeAuditSink() -> audit_log (event_type worktree_reaper_classification), verified live with rows landing 2026-09-07T05:11Z. One HIGH scope-precision defect in the brief: "husk" names the opposite residue class in this repo\'s own code, which would make fix shape 1\'s stated acceptance criterion zero-yield.',
    metadata: {
      gate: 'GATE 1 — LEAD Pre-Approval',
      duplicate_check: 'PASS — zero duplicate implementations, zero in-flight PRs (40 open scanned), zero overlapping SDs/QFs',
      infrastructure_check: 'PASS — reuses existing writeAuditSink/audit_log; no new table or migration required',
      sibling_collision_check: 'PASS — 7 children under parent 49a1659f; none covers worktree reaping or reaper cadence',
      premise_measured: 'git worktree prune --dry-run -v on live main tree reports 1 prunable entry (SD-LEO-DOC-FOUNDATION-AUDIT-LENS-001); 29 registered vs 36 on-disk dirs',
      files_examined: [
        'lib/worktree-quota.js',
        'lib/worktree-reaper/audit-sink.js',
        'lib/worktree-reaper/close-husk.js',
        'lib/worktree-reaper/orphan-sweep.js',
        'lib/worktree-manager.js',
        'scripts/modules/shipping/post-merge-worktree-cleanup.js',
        'scripts/modules/handoff/executors/lead-final-approval/index.js',
        'scripts/worktree-reaper.mjs',
      ],
      model: 'Opus 5',
      model_id: 'claude-opus-5[1m]',
      invoked_at: new Date().toISOString(),
    },
    detailed_analysis: {
      sd_key: SD_KEY,
      source_feedback: '7714dcc8-036a-4ce4-b0a1-4f5ce50e3c19',
      worktree: 'C:/Users/rickf/Projects/_EHG/EHG_Engineer/.worktrees/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F',
    },
    phase: 'LEAD',
  };

  results = applySubAgentRepoVerdict(results, resolution);

  const stored = await storeSubAgentResults(
    'VALIDATION',
    SD_ID,
    { name: 'Principal Systems Analyst (validation-agent)' },
    results,
    { sdKey: SD_KEY, phase: 'LEAD' }
  );

  console.log('VERDICT WRITTEN:');
  console.log('  ID:', stored.id);
  console.log('  verdict:', stored.verdict, '@ confidence', stored.confidence);
  console.log('  phase:', stored.phase);
  console.log('  repo_path:', stored.metadata?.repo_path);
  console.log('  repo_resolved:', stored.metadata?.repo_resolved);
  console.log('  executed_from_cwd:', stored.metadata?.executed_from_cwd);
  process.exit(0);
}

main().catch(e => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
