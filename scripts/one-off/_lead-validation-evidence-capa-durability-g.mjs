#!/usr/bin/env node
/**
 * LEAD-phase VALIDATION evidence for SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G (LEAD-TO-PLAN gate).
 *
 * Canonical repo-evidence pattern (lib/sub-agents/resolve-repo.js applySubAgentRepoVerdict +
 * lib/sub-agent-executor/results-storage.js storeSubAgentResults) — no hand-rolled INSERT,
 * per CLAUDE.md prologue rule 11.
 */
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../../lib/sub-agent-executor/results-storage.js';
import { getSupabaseClient } from '../../lib/sub-agent-executor/supabase-client.js';
import { isMainModule } from '../../lib/utils/is-main-module.js';

const SD_ID = '8ea5b6ea-55ea-454c-9baa-19e32d1cb9a2';
const SD_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G';

async function writeValidation(supabase) {
  const resolution = await resolveSubAgentRepo({
    sdId: SD_KEY, targetApplication: 'EHG_Engineer', subAgentCode: 'VALIDATION', supabase,
  });

  let results = {
    verdict: 'CONDITIONAL_PASS',
    confidence: 88,
    findings: [
      {
        id: 'F1-defect-premise-CONFIRMED-both-gaps-real',
        severity: 'INFO',
        summary: 'BOTH stated gaps are MEASURED, not speculative. Gap (2) "the gate never reaches role seats": createSdStartGate is imported by exactly five call sites, ALL handoff executors — scripts/modules/handoff/executors/{lead-to-plan,plan-to-exec,exec-to-plan,plan-to-lead}/index.js and lead-final-approval/gates.js. There is no non-handoff consumer, so a seat that never runs a handoff is uncovered by construction, exactly as the SD states. Gap (1) "unguarded window between compaction and next handoff" follows from the same fact. The witnessed precedent is REAL and verbatim-verifiable: feedback row ce3de628-b7d1-4554-8850-77dfc88816db, category solomon_adherence_drift, severity medium, status new, created 2026-09-02T00:24:51Z, titled "Solomon adherence drift - post-compaction contract re-read deferred (chairman-caught 2026-09-02)". It records seat 319e2797 re-reading after compaction record #1 (2026-09-01T22:20Z) but DEFERRING after record #2 (22:50Z) on a hash-unchanged rationale. The problem statement is well-evidenced.',
      },
      {
        id: 'F2-BLOCKING-the-good-half-of-the-premise-is-FALSE-for-auto-compaction',
        severity: 'CRITICAL',
        summary: 'The SD opens with "the good half first because it changes the scope": recordCompaction() "stamps lastCompactionAt AND clears protocolGate.fileReads ... That is correct and it is not being replaced." MEASURED: that is true ONLY on a MANUAL /context-compact, and false on an automatic compaction — which is the dominant case and precisely the case that hits a long-running role seat. Three measurements. (a) recordCompactionEvent() at scripts/modules/handoff/gates/core-protocol-gate.js:392 has ZERO callers: grep across scripts/ lib/ .claude/ returns only its definition (:392) and its default-export entry (:875). It is dead code. (b) The peer implementation scripts/hooks/protocol-compaction-hook.cjs recordCompaction() has exactly ONE caller, .claude/commands/context-compact.md:73 — a MANUAL slash command. It is NOT wired to the PreCompact hook event. (c) The ONLY PreCompact hook wired in .claude/settings.json (lines 19-29) is scripts/hooks/precompact-snapshot.ps1, whose own header comment asserts it is "the ONLY PreCompact hook wired", and which at lines 61-79 + 121-124 explicitly PRESERVES protocolGate (with fileReads inside it) across the compaction and merges it back into the new state — deliberately, under QF-20260524-337, to stop post-compaction /sd-create re-blocking. It never writes protocolGate.lastCompactionAt. NET EFFECT on a real auto-compaction: fileReads are CARRIED FORWARD, not cleared, and lastCompactionAt is never stamped. The SD asserts the opposite. CONSEQUENCE FOR SCOPE: this is not merely a mis-located check, it is a check that does not fire at all on the dominant compaction path, so "relocate an existing working check" understates the work. LEAD should correct the premise before PLAN prices it.',
      },
      {
        id: 'F3-BLOCKING-success-criterion-4-passes-vacuously-as-written',
        severity: 'CRITICAL',
        summary: 'Success criterion #4 reads "recordCompaction() still clears protocolGate.fileReads and core-protocol-gate still blocks at handoffs; a regression test asserts the worker-at-handoff path is unchanged". Given F2, a regression test written to that wording would exercise the MANUAL /context-compact path (the only path where recordCompaction runs) and pass green while the automatic-compaction path — the one every real seat and worker actually takes — remains unenforced. This is the "dead by construction while reading as wired" shape the parent workstream exists to eliminate, reproduced inside this child SD own acceptance criteria. The criterion must be restated to name WHICH compaction path it preserves, and a separate criterion must assert the AUTO path (PreCompact hook) either clears the read state or is deliberately and documentedly exempted.',
      },
      {
        id: 'F4-BLOCKING-direct-conflict-with-QF-20260524-337',
        severity: 'CRITICAL',
        summary: 'ARCHITECTURAL CONFLICT that PLAN cannot resolve unilaterally. QF-20260524-337 deliberately made precompact-snapshot.ps1 preserve protocolGate/protocolFilesRead across compaction, with a recorded rationale (feedback 6bbe551f: post-compaction /sd-create re-blocked with "CLAUDE_CORE.md has not been read", sd-key-generator.js Case 1). Child G wants the opposite behaviour — a compaction must force a re-read. These cannot both hold for the same key. PLAN needs an explicit LEAD decision among: (i) reverse the preservation (re-opens the QF-337 regression), (ii) narrow it — preserve LEO protocol-file reads but NOT role-contract reads, which is likely correct since the two have different consumers, or (iii) leave preservation alone and have the new tick check read an independent signal (the ~/.claude/flags/last-compaction.json marker the PS1 already writes at lines 128-134, which is a genuine no-new-machinery option). Absent this decision the PRD has no defensible FR for the state it reads.',
      },
      {
        id: 'F5-BLOCKING-wrong-state-for-role-seats-the-drift-flag-says-so-itself',
        severity: 'CRITICAL',
        summary: 'The SD scopes the work as relocating the core-protocol-gate check. For role seats that check is over the WRONG STATE. The cited drift flag ce3de628 says so in its own instrument note: "the hook clearedFiles was [] on both records (protocolGate.fileReadsBeforeCompaction held no read for this seat), so its re-read-required message is unconditional while THE GATE TRACKS NOTHING FOR ROLE SEATS - the Solomon register contract_read flag comes from a separate tracker; WIRE ONE OF THE TWO." CONFIRMED independently: role-contract read state is carried by the per-seat registers (scripts/solomon-register.cjs:284-330 exposes contract_read / contract_read_partial / contract_last_read_at / contract_read_basis; scripts/adam-register.cjs is the peer), NOT by protocolGate.fileReads. Relocating the protocolGate check to a tick would therefore fire over state that is empty for exactly the seats the SD is trying to protect. The PRD must name which of the two trackers is authoritative for a role seat, or explicitly wire them together — the drift flag already identified this as the open decision on 2026-09-02 and it is still open.',
      },
      {
        id: 'F6-BLOCKING-seat-roster-is-wrong-Solomon-has-no-tick-Michael-is-omitted',
        severity: 'CRITICAL',
        summary: 'The SD says "the three role seats (Solomon, Adam, coordinator)" and proposes enforcement "at the next tick". MEASURED against the tick inventory: scripts/ contains adam-quiet-tick.mjs, coordinator-quiet-tick.mjs and michael-quiet-tick.mjs. There is NO solomon-quiet-tick.mjs (ls scripts | grep -i solomon returns register/advisory/startup-check/self-adherence scripts only). Corroborating, .claude/compaction-thresholds.cjs detectRoleFromFile() (lines 76-95) resolves exactly coordinator | adam | michael | worker | solo from .claude/active-{coordinator,adam,michael}.json — Solomon has NO role marker and is NOT a detectable role in the role-aware infrastructure. So the roster is wrong in BOTH directions: the one seat with the witnessed precedent (Solomon) is the one seat with no tick host, and a fourth seat that DOES have a tick (Michael, formalized under SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002-A, post-dating this SD authored 2026-09-03) is unaddressed. "Enforce at the next tick" is not implementable for Solomon as written without either inventing a Solomon tick (new machinery, violating ratification 76a3c081) or choosing a different host. PLAN must be given a corrected, enumerated seat roster with a named host per seat.',
      },
      {
        id: 'F7-no-duplicate-implementation-but-one-prompt-level-precursor-that-did-NOT-land',
        severity: 'WARNING',
        summary: 'DUPLICATE CHECK: NEGATIVE — no existing code enforces a post-compaction re-read at tick or tool-call. Verified: scripts/hooks/pre-tool-enforce.cjs contains ZERO references to protocolGate / protocolFilesRead / compaction / lastCompactionAt / contract_last_read. And no seat script reads lastCompactionAt at all: grep for lastCompactionAt across scripts/*.mjs, scripts/*.cjs, scripts/solomon/, scripts/coordinator/ returns NOTHING (the only live consumers are core-protocol-gate.js, protocol-compaction-hook.cjs and archive/one-time/protocol-gate-status.js). IMPORTANT COROLLARY: drift flag ce3de628 corrective (2) claims an hourly-verify cron 4a581da6 was armed with "a MECHANICAL check - .claude/unified-session-state.json protocolGate.lastCompactionAt vs the register readback contract_last_read_at; record newer than read => full re-read, no judgment". That check EXISTS NOWHERE IN CODE. It was a cron PROMPT STRING, not an instrument — which is precisely the failure mode this SD names ("enforcement does not depend on self-authored prompt text surviving a seat rotation"). This strengthens the SD case rather than duplicating it, and it hands PLAN a ready-made, already-reasoned predicate to implement in code. Related-but-NOT-duplicate, checked and cleared: scripts/adam-contract-survival-probe.cjs measures 5-gram survival of contract imperatives across a doc refactor, unrelated to compaction.',
      },
      {
        id: 'F8-a-viable-no-new-machinery-host-EXISTS-feasibility-is-good',
        severity: 'INFO',
        summary: 'The no-new-machinery constraint (ratification 76a3c081) is SATISFIABLE — a wired host already exists and already tracks the right files. scripts/hooks/protocol-file-tracker.cjs is registered as a PostToolUse hook in .claude/settings.json:177, so it fires on EVERY tool call for EVERY session including role seats, and its PROTOCOL_FILES list ALREADY covers every role contract and companion: CLAUDE_ADAM.md, CLAUDE_ADAM_MANUAL.md, CLAUDE_ADAM_PROVENANCE.md, CLAUDE_SOLOMON.md, CLAUDE_SOLOMON_MANUAL.md, CLAUDE_SOLOMON_PROVENANCE.md, CLAUDE_SOLOMON_MODEL_POSTURE.md, CLAUDE_MICHAEL.md, CLAUDE_MICHAEL_MODEL_POSTURE.md plus the coordinator charter/manual/provenance set. All corresponding files exist on disk. This gives PLAN a host that (a) reaches all four seats including Solomon, solving F6 without a Solomon tick, (b) fires at "the next tool call" which is the stronger reading of the SD intent, and (c) adds no new process, scheduler or table. RECOMMENDED SHAPE for the PRD, offered non-bindingly: read the compaction signal, compare against the per-seat contract read timestamp, and refuse/flag once per compaction until a re-read is recorded. NOTE the ordering hazard: protocol-file-tracker.cjs carries an explicit "must stay in sync with core-protocol-gate.js" warning at :29-30, so it is already a second representation of the same rule — PLAN should bind them rather than add a third.',
      },
      {
        id: 'F9-noise-risk-mitigation-is-stated-and-testable',
        severity: 'INFO',
        summary: 'The SD risk register is unusually good and does NOT need strengthening. Risk 1 (a per-tick refusal gets routed around, "which is how the worktree reaper cadence was switched off") carries a concrete, testable mitigation: refusal is once per compaction, not once per tick, clears on the re-read, and the acceptance test asserts a SECOND ordinary action after the re-read is NOT refused. That is a falsifiable predicate and PLAN can write it directly into a test scenario. Risk 2 (relocation silently drops the worker-at-handoff coverage) is correctly mitigated by shipping the regression test in the same PR, though per F3 the wording of what that test asserts must be corrected first.',
      },
      {
        id: 'F10-scope-bounding-assessed-appropriately-bounded-with-one-caveat',
        severity: 'INFO',
        summary: 'SCOPE JUDGEMENT: appropriately bounded, and the no-new-machinery constraint is the right constraint. The SD explicitly declines to build a new subsystem, names its host category (tick/tool-call), preserves the existing handoff path, and cites its prior art honestly (arXiv 2606.22528 flagged as phenomenon-only, PDF returned metadata only, no remedy borrowed — that is exactly the right epistemic labelling and should be preserved into the PRD). CAVEAT: per F2 the work is LARGER than "relocate", because the auto-compaction path does not currently fire at all. That does not make the scope wrong, but PLAN must not price this as a pure move. Recommend LEAD reaffirm scope after correcting the premise; the SD stays a single child, no decomposition indicated.',
      },
      {
        id: 'F11-backlog-zero-is-NOT-a-blocker-for-this-SD-class',
        severity: 'INFO',
        summary: 'GATE 1 backlog check calibrated against actual sibling practice rather than applied blindly. SD-G has 0 sd_backlog_map rows. So do ALL SIX siblings: children A, B, C, D, E and F each have backlog=0, and A, C, D and F reached status=completed that way. For W6 orchestrator children the requirements live in the PRD (every sibling has exactly 1) and in the structured success_criteria, not in sd_backlog_map. Reporting 0-backlog as a GATE 1 block here would be a false positive against an established, repeatedly-completed pattern. Recorded as advisory only. Scope ambiguity is genuinely absent from the backlog dimension — SD-G success_criteria carries four criteria each with a stated baseline measurement, which is materially better than typical.',
      },
      {
        id: 'F12-evidence-coverage-state-at-this-gate',
        severity: 'WARNING',
        summary: 'SD-G currently has ZERO sub_agent_execution_results rows and ZERO PRDs, and one LEAD-TO-PLAN handoff already recorded with status=rejected (2026-09-07T07:32:12Z), consistent with the reported SUBAGENT_EVIDENCE_MISSING block. This row supplies VALIDATION at phase=LEAD. Explore at phase=LEAD is still MISSING and must be invoked separately — every sibling carries both (verified on -B and -E: VALIDATION and Explore rows both present at phase=LEAD). Sibling LEAD-phase evidence sets also include SECURITY, TESTING, DATABASE, DESIGN, RISK and STORIES; those are downstream-phase concerns here but the LEAD-TO-PLAN gate specifically wants VALIDATION + Explore.',
      },
    ],
    detailed_analysis: JSON.stringify({
      gate: 'GATE 1 - LEAD Pre-Approval',
      verdict_rationale: 'CONDITIONAL_PASS, not BLOCKED. The problem is real, measured and worth fixing, and the intended remedy has a viable no-new-machinery host that already exists and already reaches all four seats. But the SD narrative contains one materially false premise (F2) that propagates into a vacuous acceptance criterion (F3), and there are three concrete unresolved decisions (F4, F5, F6) that PLAN cannot settle on its own without guessing. PLAN can write a PRD once those are answered; it cannot write a defensible one before.',
      duplicate_check: 'NEGATIVE - no existing implementation enforces post-compaction re-read at tick or tool call. pre-tool-enforce.cjs has zero protocol-read/compaction references; no seat script reads lastCompactionAt.',
      infrastructure_check: 'POSITIVE - scripts/hooks/protocol-file-tracker.cjs (wired PostToolUse, .claude/settings.json:177) already tracks all four role contracts + companions and fires on every tool call for every session.',
      claims_verified: [
        'recordCompaction clears fileReads at core-protocol-gate.js:405-411 — TRUE as written, but unreachable on auto-compaction (F2)',
        'enforcement fires only at handoff — TRUE, createSdStartGate has exactly 5 importers, all handoff executors',
        'role seats never run handoffs — TRUE, no non-handoff consumer of the gate exists',
        'drift flag ce3de628 — TRUE, feedback row ce3de628-b7d1-4554-8850-77dfc88816db verified verbatim',
        'the three role seats are Solomon/Adam/coordinator — FALSE, Solomon has no tick and no role marker; Michael has both and is omitted (F6)',
      ],
      blocking_questions_for_LEAD: [
        'Q1 (F4): preserve, narrow, or reverse QF-20260524-337 protocolGate preservation across PreCompact? Recommended: narrow — preserve LEO protocol-file reads, do not preserve role-contract reads.',
        'Q2 (F5): which tracker is authoritative for a role seat contract read — protocolGate.fileReads or the per-seat register contract_last_read_at? drift flag ce3de628 asked this on 2026-09-02 and it is still open.',
        'Q3 (F6): confirm the seat roster and name a host per seat. Solomon has no tick; Michael has one and is unlisted. Is Michael in or out of scope?',
        'Q4 (F2/F3): reaffirm scope after correcting the premise — is the auto-compaction path (PreCompact hook) in scope, or explicitly exempted with a recorded reason?',
      ],
      recommended_acceptance_criteria_additions: [
        'Name the compaction path under test (manual /context-compact vs automatic PreCompact) in every criterion — criterion 4 as written passes on the manual path while the auto path stays unenforced.',
        'Assert the check fires for a seat whose tick/cron prompt contains no re-read instruction (already stated in criterion 3 — keep it, it is the strongest one).',
        'Assert a second ordinary action after the re-read is NOT refused (already stated in risk 1 mitigation — promote it to a criterion).',
        'Add a criterion binding protocol-file-tracker.cjs and core-protocol-gate.js to each other, since the former already carries a "must stay in sync" warning and this SD would otherwise add a third representation.',
      ],
      files_reviewed: [
        'scripts/modules/handoff/gates/core-protocol-gate.js',
        'scripts/hooks/protocol-compaction-hook.cjs',
        'scripts/hooks/precompact-snapshot.ps1',
        'scripts/hooks/protocol-file-tracker.cjs',
        'scripts/hooks/pre-tool-enforce.cjs',
        '.claude/settings.json',
        '.claude/compaction-thresholds.cjs',
        '.claude/commands/context-compact.md',
        'scripts/solomon-register.cjs',
        'scripts/adam-quiet-tick.mjs',
        'scripts/coordinator-quiet-tick.mjs',
        'scripts/michael-quiet-tick.mjs',
        'scripts/adam-contract-survival-probe.cjs',
        'scripts/modules/handoff/executors/{lead-to-plan,plan-to-exec,exec-to-plan,plan-to-lead}/index.js',
        'scripts/modules/handoff/executors/lead-final-approval/gates.js',
      ],
    }),
    metadata: {
      sd_key: SD_KEY,
      gate: 'GATE_1_LEAD_PRE_APPROVAL',
      duplicate_found: false,
      backlog_items: 0,
      backlog_zero_is_class_normal: true,
      blocking_questions: 4,
      critical_findings: 5,
      validation_mode: 'strategic_intent_review',
    },
    phase: 'LEAD',
    summary: 'CONDITIONAL_PASS (confidence 88). The problem statement is well-evidenced, not speculative: both stated gaps are measured (createSdStartGate has exactly five importers, all handoff executors, so role seats are uncovered by construction) and the witnessed precedent is verbatim-verifiable (feedback ce3de628, Solomon post-compaction re-read deferred, chairman-caught 2026-09-02). Duplicate check NEGATIVE and a no-new-machinery host already exists — protocol-file-tracker.cjs is a wired PostToolUse hook that already tracks all four role contracts and fires on every tool call for every seat, which satisfies ratification 76a3c081 and reaches Solomon without inventing a Solomon tick. FIVE CRITICAL issues block a concrete PRD. (1) The SD "good half" premise is FALSE for automatic compaction: recordCompactionEvent() has zero callers, protocol-compaction-hook.cjs is reachable only from the manual /context-compact command, and the only wired PreCompact hook (precompact-snapshot.ps1) deliberately PRESERVES protocolGate across compaction under QF-20260524-337 and never stamps lastCompactionAt — so on the dominant path reads are carried forward, not cleared. (2) Consequently success criterion 4 passes vacuously, exercising the manual path while the auto path stays unenforced. (3) Direct architectural conflict with QF-20260524-337, which PLAN cannot resolve unilaterally. (4) For role seats the gate reads the WRONG state — contract reads live in the per-seat registers (contract_last_read_at), and drift flag ce3de628 itself flags this as an open "wire one of the two" decision from 2026-09-02. (5) The seat roster is wrong in both directions: Solomon, the seat with the witnessed precedent, has no tick and no role marker, while Michael has both and is omitted. Scope is otherwise appropriately bounded and the risk register is unusually strong. Backlog=0 recorded as advisory NOT a block — all six W6 siblings carry 0 backlog rows and four completed that way. Recommend LEAD answer the four enumerated questions, correct the premise and the criterion-4 wording, then proceed to PLAN. Explore evidence at phase=LEAD is still missing and must be invoked separately.',
  };

  results = applySubAgentRepoVerdict(results, resolution);
  return storeSubAgentResults('VALIDATION', SD_ID, { name: 'Principal Systems Analyst (validation-agent)' }, results, { sdKey: SD_KEY, phase: 'LEAD' });
}

async function main() {
  const supabase = await getSupabaseClient();
  const row = await writeValidation(supabase);
  console.log('VALIDATION row:', row.id, '| verdict:', row.verdict, '| confidence:', row.confidence, '| phase:', row.phase);
  console.log('repo_path:', row.metadata?.repo_path, '| executed_from_cwd:', row.metadata?.executed_from_cwd);
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e.message); console.error(e.stack); process.exit(1); });
}
