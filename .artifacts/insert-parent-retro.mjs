import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const PARENT_ID = '49a1659f-33f1-4b7f-912d-076c8f70ea0f';
const PARENT_KEY = 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001';

const what_went_well = [
  {
    achievement: "Child E (this orchestrator's own write-caller census child) produced docs/audits/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E-write-caller-census.md by measuring pg_trigger, pg_class.relacl and information_schema.role_table_grants live against the pooler -- not by grepping possibly-unapplied migration files -- and found the real candidate set of unprotected audit/governance tables is 14, not the parent orchestrator's originally-stated 'four'. The census-before-migrate discipline the child's own title mandated ('prepared with a census of write callers first') is exactly what surfaced that the original scope estimate was off by 3.5x before any trigger code was written.",
    is_boilerplate: false
  },
  {
    achievement: "Child E shipped 2 chairman-gated immutability-trigger migrations (feedback, governance_audit_log) that were confirmed applied to the live database via the LEAD-FINAL-APPROVAL CHAIRMAN_APPLY_VERIFICATION gate (score 95, accepted 2026-09-11) after three separate WAIT cycles spanning 2026-09-07 through 2026-09-11 while the chairman ceremony apply pended -- the gate correctly refused to certify an unapplied migration rather than trusting the merge alone.",
    is_boilerplate: false
  },
  {
    achievement: "Child C replaced per-caller comms-transport patches (which covered only 1-of-8+ email callers and 0-of-2 SMS callers) with one shared guard at the two actual network-call sites, closing the whole coverage class in a single change, and its own retro (scored 100, the highest of the seven) independently re-measured its own cited facts live rather than carrying them forward unverified -- correcting a self-reported '24 new tests / all green' framing to the real 18 tests and an actively-failing control-seed-test-lint check.",
    is_boilerplate: false
  },
  {
    achievement: "Child C caught and signaled two live sub-agent-runner defects mid-build instead of quietly working around them: TESTING's verdict was cwd-dependent for worktree-based SDs (a canonical-root invocation returned a confident BLOCKED/100% off an empty diff; the correct worktree invocation returned PASS/92% off the real diff), and REGRESSION resolves its target repo via applications.local_path regardless of invoking cwd. Both were filed as coordinator signals (session_coordination ids f2ae7f99, cc23e2a1) rather than silently accepted, and the worker re-measured from the correct worktree before recording either verdict as evidence.",
    is_boilerplate: false
  },
  {
    achievement: "Child F's LEAD-phase VALIDATION sub-agent (evidence 69a19709) caught a HIGH-severity terminology collision before any code was written: the sourcing RCA's brief called the target residue class a 'husk', but this repo's own code (close-husk.js, worktree-manager.js) reserves that word for the opposite residue class. Reframed to 'registered entry with missing gitdir target' / 'the prune-set' before PRD authoring, which prevented a test fixture that would have validated against the wrong, already-satisfied definition.",
    is_boilerplate: false
  },
  {
    achievement: "Child F's EXEC-phase TESTING sub-agent (evidence a15d0f5d) found a CRITICAL defect that a fully green 417/417 test suite had hidden: detectPruneCandidates read only stdout via execSync, but 'git worktree prune --dry-run -v' reports on stderr; production (scripts/worktree-reaper.mjs:1275) takes the raw execSync branch with no injected mock, so the shipped feature would have written zero worktree_prune_candidate rows in production forever. Every existing test had injected a gitRunner mock returning text on .stdout, leaving the one branch production actually calls completely uncovered. The fix was re-verified with 5 targeted mutations (5 kills, 0 survivors), not just a re-run of the existing suite.",
    is_boilerplate: false
  },
  {
    achievement: "Child B's LEAD phase corrected its own scope mid-flight before PRD authoring: validation-agent evidence (row b72795eb-c155-4693-b49c-dd3402f444f3, confidence 88) established that a binary 'must resolve on disk' requirement was unsatisfiable for roughly 2,430 of 2,448 currently-unresolvable worktree_path rows, because their worktree directories no longer exist -- the PRD was written against the corrected, satisfiable requirement instead of the original literal one.",
    is_boilerplate: false
  },
  {
    achievement: "Child D closed four independently-measured gaps in the shared session_coordination table (2,108 live rows) -- 663 expired-unread rows with no surfacing mechanism (up from 159 four days earlier), no archive table for retained/evicted rows, no structural counter proving the pre-insert backpressure guard stays at zero regressions, and no marker distinguishing a work-assignment-requiring-receipt from routine traffic -- with the cleanest handoff chain of the seven children (4 handoffs, ~1 hour, one LEAD-TO-PLAN rejection) and accepted LEAD-FINAL-APPROVAL at 94 with no chairman-ceremony wait.",
    is_boilerplate: false
  },
  {
    achievement: "Child G's LEAD phase reversed its own inherited premise under live evidence rather than building a PRD on a false assumption: the design brief's claim that 'recordCompaction() already clears protocolGate.fileReads for every compaction' was confirmed FALSE for automatic compaction (the dominant path) -- recordCompactionEvent() has zero callers, and the actually-wired PreCompact hook deliberately preserves protocolGate (QF-20260524-337) -- and four explicit LEAD decisions (on tracker authority, seat roster, and compaction-path scope) were recorded so PLAN could write a defensible PRD against the corrected premise instead.",
    is_boilerplate: false
  },
  {
    achievement: "All 7 of 7 children (A-G) reached status=completed and an accepted LEAD-FINAL-APPROVAL handoff (scores 94, 94, 96, 94, 95, 96, 94), each above the protocol's 85% target, closing out the chairman-ordered W6 durability workstream (ratification 49656c8c) end to end from 2026-09-06 through 2026-09-11.",
    is_boilerplate: false
  }
];

const what_needs_improvement = [
  {
    gap: "Child E's census identified 14 unprotected audit/governance tables; only 2 (feedback, governance_audit_log) received an immutability-trigger migration in this cycle. The remaining 12 (including audit_log, chairman_decisions, retrospectives_audit, sd_type_change_audit, sd_governance_bypass_audit, eva_audit_log, and others the census names as 'deferred to sibling children') have no migration and, as of this retrospective, no successor SD or QF yet names them. The parent's exit predicate implicitly assumed the census's own output would be closed out by this workstream; it was not, and that gap is currently untracked rather than deliberately scheduled.",
    is_boilerplate: false
  },
  {
    gap: "Three of seven children (A, B, E) sat LEAD-FINAL-APPROVAL BLOCKED on CHAIRMAN_APPLY_VERIFICATION -- a merged-but-not-yet-live migration -- for a combined multi-day delay (child E alone spanned three WAIT cycles from 2026-09-07 to 2026-09-11). The gate's refusal to certify an unapplied migration is correct; the root cause is that ceremony-apply scheduling is only discovered reactively, at the point a handoff blocks on it, rather than being queued the moment a chairman-gated migration merges.",
    is_boilerplate: false
  },
  {
    gap: "5 of 7 children's own SD_COMPLETION retrospectives (A, B, D, E, G) independently generated the identical action item 'lacks unified test evidence in database'. This recurrence across unrelated children in the same workstream is itself evidence of a standing TESTING-sub-agent-to-unified_test_evidence wiring gap, not five separate per-SD oversights, and it was not resolved by any of the five children individually.",
    is_boilerplate: false
  },
  {
    gap: "Child C's PR #8415 left two items open at the time of its retrospective: the new lint control (scripts/lint/transport-test-isolation-guard-lint.mjs) was not registered in scripts/audit/control-seed-specs.json, so control-seed-test-lint was actively failing (not merely a pending coverage job, as the SD's own framing going into the retro claimed); and the now-superseded per-caller guard at lib/comms/adam-outbound/chairman-sms-gate/index.js:243 was left in place alongside the new shared guard rather than removed or explicitly documented as intentionally dual.",
    is_boilerplate: false
  },
  {
    gap: "The two highest-quality child retrospectives (C and F, both scored 100) were both triggered by a mid-build harness-bug catch that forced direct evidence citation; the other five (A, B, D, E, G, each scored 80) used the standard auto-generated template shape (SUCCESS_METRICS_DEFINED / VALIDATION_GAP / FR_PATTERN categories) without an equivalent depth of self-citation, even though their underlying delivery (handoff scores, sub-agent pass rates) was comparably strong. Retrospective depth in this workstream correlated with whether a defect was caught mid-build, not with delivery quality -- a gap in how the standard template surfaces depth when nothing forced it.",
    is_boilerplate: false
  }
];

const key_learnings = [
  {
    category: "CENSUS_FIRST_SCOPE_REVISION",
    evidence: "docs/audits/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E-write-caller-census.md",
    learning: "Mandating a live-measurement census before any migration is authored (child E) caught that the parent orchestrator's exit-predicate estimate of 4 unprotected audit/governance tables undercounted the real candidate set by a factor of 3.5x (14 found). The census discipline worked exactly as designed; what it did not do on its own was guarantee the revised, larger scope would get scheduled -- only 2 of the 14 shipped a migration in this cycle.",
    applicability: "Any future 'protect/harden N records of class X' mandate should treat its own N as a pre-census placeholder, not a target, and should pair a mandated census-first child with an explicit forward-scheduling step for whatever the census returns above the placeholder -- not leave the delta as an implicit assumption that a later, unnamed child will absorb it."
  },
  {
    category: "CHAIRMAN_APPLY_VERIFICATION_BOTTLENECK",
    evidence: "sd_phase_handoffs LEAD-FINAL-APPROVAL rows for A (2x blocked), B (2x blocked), E (3x blocked, 2026-09-07 to 2026-09-11)",
    learning: "A migration-bearing child can be fully implemented, tested, and PLAN-TO-LEAD accepted, and still stall for days at the final gate because the chairman-ceremony apply step is discovered reactively at handoff time rather than queued at merge time. This is a structural property of the chairman-gated migration path, not a defect in any one child's work.",
    applicability: "Any workstream where multiple children are expected to ship chairman-gated migrations should treat ceremony-apply scheduling as a tracked queue triggered by merge, so a child's LEAD-FINAL-APPROVAL wait time is bounded by ceremony cadence rather than by how long it takes for the wait itself to be noticed."
  },
  {
    category: "ROOT_CAUSE_CONSOLIDATION_AT_CALL_SITE",
    evidence: "Child C: lib/comms/adam-outbound shared transport guard replacing per-caller patches at 1-of-8+ email callers / 0-of-2 SMS callers",
    learning: "Moving a guard to the actual network-call sites closed a multi-instance defect class (this was the fourth confirmed instance of fixture-reaches-live-surface) in one change, where three prior instances had each been closed with a narrower per-caller patch that left the next caller uncovered.",
    applicability: "When a defect class has recurred 2+ times via narrow per-site patches, the next fix should default to asking whether a shared choke point exists at the actual resource boundary (the network call, the DB write) before adding a third or fourth per-caller guard."
  },
  {
    category: "TERMINOLOGY_CROSS_CHECK_BEFORE_PRD",
    evidence: "Child F: VALIDATION evidence 69a19709, 'husk' collision between RCA brief and close-husk.js/worktree-manager.js",
    learning: "An RCA-sourced or externally-authored brief's informal terminology can collide with a repo's own reserved meaning for the same word, and a generic 'read the brief' pass does not reliably catch it -- it took a sub-agent step that explicitly cross-referenced the brief's wording against the actual code definitions before PRD authoring began.",
    applicability: "For any SD sourced from an external brief, RCA, or another agent's design notes, cross-reference its domain-specific nouns against the target repo's own code/constants before acceptance criteria are written, not just before implementation."
  },
  {
    category: "PER_BRANCH_COVERAGE_REASONING",
    evidence: "Child F: detectPruneCandidates stdout-only read vs. production's stderr-carrying execSync branch, 417/417 green suite, evidence a15d0f5d",
    learning: "A function with both a real-subprocess branch and a mock-injectable branch can show 100% of its tests passing while the one branch production actually exercises has zero coverage, because every test happened to exercise the mocked branch. Per-function green is not evidence for per-branch correctness.",
    applicability: "For any function branching on real-subprocess vs. mock-injected execution, require at least one test that exercises the un-mocked branch's actual output shape (including which stream -- stdout vs stderr -- carries the result), or document explicitly why that branch cannot be tested."
  },
  {
    category: "MUTATION_TESTING_AS_REVERIFICATION",
    evidence: "Child F: 5 targeted mutations (cwd-guard revert, 2 stderr-fix reverts, husk constant collision, husk write-site swap) -> 5 kills, 0 survivors",
    learning: "Re-verifying a CRITICAL-defect fix by mutating the fix and confirming the test suite kills every mutation is strictly stronger evidence than re-running the existing suite, because it tests whether the suite's own assertions are load-bearing rather than merely passing.",
    applicability: "Any re-verification pass following a CRITICAL or silent-failure-class finding should include a small set of targeted mutations against the fix itself, not just a clean re-run of the pre-existing suite."
  },
  {
    category: "LEAD_PREMISE_CORRECTION_UNDER_EVIDENCE",
    evidence: "Child G: VALIDATION 21ff50fc (confidence 88) + Explore e95179c6 (confidence 90) overturned the inherited brief's premise that recordCompaction() already runs on automatic compaction",
    learning: "An inherited design brief's stated premise (even one explicitly endorsed by its source as 'already working and not being replaced') can be false for the dominant code path, and LEAD-phase evidence gathering caught it before PLAN wrote a PRD against the false premise -- the fix was not to implement the brief as written, but to record four explicit scope decisions correcting it first.",
    applicability: "A design brief inherited from another role or an earlier analysis should be treated as a claim to verify against current code at LEAD, not as settled fact, even when the brief itself frames part of its claim as the 'already working, good half'."
  },
  {
    category: "RETRO_DEPTH_CORRELATES_WITH_MID_BUILD_CATCH_NOT_DELIVERY_QUALITY",
    evidence: "Children C and F (each with a mid-build harness/terminology/test-gap catch) scored 100; children A, B, D, E, G (template-shaped retros, no forcing catch) scored 80, despite comparable handoff-score delivery across all seven",
    learning: "The standard auto-generated retrospective template produces a materially shallower self-review than one authored in direct response to a caught defect, even when the underlying delivery quality (handoff acceptance scores, sub-agent pass rates) is comparable across both groups.",
    applicability: "A retrospective's quality score should not be read as a proxy for a child SD's delivery quality on its own -- cross-check handoff acceptance scores and sub-agent pass rates before concluding a template-scored child under-delivered relative to a deeply-cited one."
  }
];

const action_items = [
  {
    owner: "Coordinator",
    action: "Open a follow-up SD or QF that inherits docs/audits/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E-write-caller-census.md and schedules immutability-trigger migrations for the 12 remaining unprotected audit/governance candidates the census identified beyond feedback and governance_audit_log (including audit_log, chairman_decisions, retrospectives_audit, sd_type_change_audit, sd_governance_bypass_audit, eva_audit_log, handoff_audit_log, tool_usage_ledger, validation_audit_log, and the remaining chairman/security/bypass audit tables named in the census document).",
    source: "child_E_census_coverage_gap",
    deadline: "next CAPA-durability planning cycle",
    priority: "high",
    root_cause: "The parent orchestrator's exit predicate was authored against an estimated 4-table scope; the mandated census-first child revised that to 14, but the workstream's PR-size-per-corrective discipline only carried migrations for 2 in this cycle, leaving the revised scope's remainder unscheduled.",
    smart_format: true,
    success_criteria: "A strategic_directives_v2 or QF row exists that cites docs/audits/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E-write-caller-census.md and names at least the 12 remaining candidate tables.",
    verification_query: "SELECT sd_key, title FROM strategic_directives_v2 WHERE description ILIKE '%write-caller-census%' OR description ILIKE '%governance_audit_log%'"
  },
  {
    owner: "TESTING Sub-Agent / PR author",
    action: "Register scripts/lint/transport-test-isolation-guard-lint.mjs in scripts/audit/control-seed-specs.json with a committed seeded-defect proof so control-seed-test-lint stops failing on PR #8415 or its successor.",
    source: "child_C_open_gap",
    deadline: "before next CAPA-family PR merges",
    priority: "high",
    root_cause: "Child C's new lint control shipped with its own unit-level seeded-defect self-test but was never registered in the separate control-seed-specs.json gate, which is enforced independently of the self-test.",
    smart_format: true,
    success_criteria: "`gh pr checks` for PR #8415 (or its successor) shows control-seed-test-lint passing, and scripts/audit/control-seed-specs.json contains an entry for transport-test-isolation-guard-lint.mjs.",
    verification_query: "SELECT 1 FROM control-seed-specs.json WHERE entry = 'transport-test-isolation-guard-lint.mjs' -- manual file check, no DB table"
  },
  {
    owner: "Implementing Agent",
    action: "Decide and record the disposition of the now-redundant per-caller guard at lib/comms/adam-outbound/chairman-sms-gate/index.js:243 -- remove it in favor of child C's shared transport guard, or add an explicit comment documenting why both are intentionally retained.",
    source: "child_C_open_gap",
    deadline: "2026-09-21",
    priority: "medium",
    root_cause: "Child C's shared guard superseded the per-caller guard's coverage but the PR did not remove or annotate the now-redundant code, leaving two overlapping mechanisms.",
    smart_format: true,
    success_criteria: "lib/comms/adam-outbound/chairman-sms-gate/index.js:243 either no longer exists, or carries a comment explaining the intentional dual-guard retention.",
    verification_query: "git log -p --follow lib/comms/adam-outbound/chairman-sms-gate/index.js | grep -A3 'line 243 context'"
  },
  {
    owner: "Coordinator",
    action: "File the worktree-reaper cadence-schedule restoration as its own ticket distinct from child F, since child F's retro confirmed it is unsourced by any sibling SD/QF and a coordinator signal was sent but not yet converted into a filed ticket.",
    source: "child_F_deferred_item",
    deadline: "2026-09-14",
    priority: "medium",
    root_cause: "Cadence-schedule restoration was identified as needed during child F's implementation but correctly excluded from F's detection-and-visibility scope, and had not yet been independently filed as of F's own retrospective.",
    smart_format: true,
    success_criteria: "A strategic_directives_v2 or QF row exists naming worktree-reaper cadence-schedule restoration, distinct from SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F.",
    verification_query: "SELECT sd_key FROM strategic_directives_v2 WHERE title ILIKE '%cadence%' AND title ILIKE '%worktree-reaper%'"
  },
  {
    owner: "TESTING Sub-Agent",
    action: "Populate unified_test_evidence for the five children that closed without it (A, B, D, E, G), or record an explicit documented exemption per child explaining why the TESTING pipeline does not apply to that change shape.",
    source: "recurring_child_retro_gap",
    deadline: "2026-09-18",
    priority: "medium",
    root_cause: "The TESTING sub-agent runner is not wired to populate unified_test_evidence as a matter of course; this surfaced as the identical action item in 5 of 7 independent child retrospectives rather than being fixed once at the wiring level.",
    smart_format: true,
    success_criteria: "SELECT count(*) FROM unified_test_evidence WHERE sd_id IN ('SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A','SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B','SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D','SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E','SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G') returns 5, or each missing row has a documented exemption in feedback/metadata.",
    verification_query: "SELECT sd_id, count(*) FROM unified_test_evidence WHERE sd_id LIKE 'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-%' GROUP BY sd_id"
  },
  {
    owner: "Coordinator",
    action: "For the next SD or workstream expected to ship chairman-gated migrations, queue the ceremony-apply step at migration-merge time rather than waiting for it to surface as a LEAD-FINAL-APPROVAL CHAIRMAN_APPLY_VERIFICATION WAIT block.",
    source: "recurring_LFA_wait_pattern",
    deadline: "next chairman-gated-migration-bearing SD",
    priority: "medium",
    root_cause: "Three of seven children in this workstream (A, B, E) lost a combined multi-day delay between EXEC completion and LEAD-FINAL acceptance because ceremony-apply scheduling was only discovered reactively at the handoff gate.",
    smart_format: true,
    success_criteria: "The elapsed time between a chairman-gated migration's merge commit and its ceremony-apply confirmation is measured for the next such SD and trends shorter than child E's multi-day wait.",
    verification_query: "SELECT sd_key, created_at, status FROM sd_phase_handoffs WHERE handoff_type = 'LEAD-FINAL-APPROVAL' AND status = 'blocked' AND metadata->>'blocked_reason' ILIKE '%CHAIRMAN_APPLY_VERIFICATION%'"
  }
];

const improvement_areas = [
  {
    area: "Census-to-migration coverage gap (child E)",
    analysis: "The parent orchestrator's exit predicate was authored against an estimated 4-table scope. Child E's mandated census-first approach correctly revised that to 14 real candidates, but the workstream's own 'one corrective per PR-sized child' discipline meant the PR that shipped carried only 2 migrations without growing into a large, multi-migration change. The scope revision and the PR-size discipline pulled in opposite directions, and nothing in the workstream's structure assigned the remaining 12 to a named successor.",
    prevention: "Treat a census-first child's output as a scheduling input, not a closed deliverable: the same PR (or an immediately-linked follow-up ticket, filed in the same session) should name every candidate the census returns above the original estimate, with an explicit owner and cycle, so 'children carry the rest' is a tracked commitment rather than an implicit assumption."
  },
  {
    area: "Chairman-gated migration ceremony as a LEAD-FINAL-APPROVAL bottleneck",
    analysis: "CHAIRMAN_APPLY_VERIFICATION correctly refuses to certify a merged-but-unapplied migration; three of seven children (A, B, E) hit this block, with child E alone spanning three WAIT cycles across four days (2026-09-07 to 2026-09-11). The root cause is that ceremony-apply scheduling is only discovered reactively, at the point a handoff blocks on it, rather than being queued the moment a chairman-gated migration merges to main.",
    prevention: "Add a ceremony-apply queue check triggered at migration-merge time (not handoff time) for any SD carrying a database/chairman-gated/*.sql file, so the apply ceremony and EXEC completion can proceed in parallel instead of serially."
  },
  {
    area: "unified_test_evidence pipeline gap recurring across independent children",
    analysis: "5 of 7 children's own retrospectives (A, B, D, E, G) independently generated the identical action item 'lacks unified test evidence in database'. Because this recurred across children with no shared authorship or review step, it is evidence of a standing gap in how the TESTING sub-agent runner writes to unified_test_evidence, not five unrelated per-SD oversights.",
    prevention: "Fix the TESTING-sub-agent-to-unified_test_evidence wiring once, at the runner level, rather than continuing to let each SD's retrospective re-surface the same gap as an individual action item with no common owner."
  }
];

const success_patterns = [
  "Census-before-build: measuring the live system's real state (pg_trigger, relacl, role_table_grants) before authoring any migration surfaced that the true candidate set (14 tables) was 3.5x the originally-stated scope (4), before any trigger code was written (child E).",
  "Root-cause consolidation at the actual resource boundary: replacing three successive per-caller patches with one shared guard at the real network-call sites closed a recurring defect class in a single change instead of adding a fourth narrow patch (child C).",
  "Domain-terminology cross-check against the repo's own reserved vocabulary before PRD authoring: caught a HIGH-severity collision between an RCA brief's informal term and the codebase's own reserved meaning for the same word before any code was written (child F).",
  "Mutation testing as re-verification after a CRITICAL finding: 5 targeted mutations against the fix itself (not just a clean suite re-run) produced 5 kills / 0 survivors, proving the fix's guarding assertions were load-bearing (child F).",
  "Mid-build harness-bug signaling instead of silent workaround: two live, confidently-wrong sub-agent verdicts (TESTING cwd-dependence, REGRESSION's applications.local_path resolution) were independently re-measured from the correct worktree and filed as coordinator signals the moment they were found (child C).",
  "LEAD-phase premise verification against current code rather than trusting an inherited brief at face value, which corrected a false 'already working' claim before PLAN wrote a PRD against it (child G)."
];

const failure_patterns = [
  "Census-to-migration coverage gap: child E's census found 14 candidate tables; only 2 received a migration in this cycle, and the remaining 12 have no named successor SD/QF as of this retrospective.",
  "CHAIRMAN_APPLY_VERIFICATION WAIT cycles stalled 3 of 7 children (A, B, E) between EXEC completion and LEAD-FINAL acceptance for a combined multi-day delay, because ceremony-apply scheduling is discovered reactively rather than queued at migration-merge time.",
  "unified_test_evidence population gap recurred identically across 5 of 7 children's retrospectives (A, B, D, E, G), indicating a standing pipeline wiring gap rather than five isolated oversights.",
  "Child C closed with two explicitly-acknowledged open items (an unregistered lint control blocking control-seed-test-lint, and a redundant per-caller guard left alongside the new shared guard) that were not resolved before this parent-level retrospective was authored."
];

const retrospective = {
  sd_id: PARENT_ID,
  project_name: 'CAPA W6 DURABILITY AUDIT AND COMMS (orchestrator parent)',
  retro_type: 'SD_COMPLETION',
  title: `${PARENT_KEY} (Parent Orchestrator) Completion Retrospective: W6 CAPA Durability Audit, 7/7 children completed`,
  description: "Parent-level completion retrospective for the chairman-ordered CAPA W6 durability workstream (ratification 49656c8c), synthesized from the 7 child SDs' (A-G) own PRDs, phase handoffs, and SD_COMPLETION retrospectives. All 7 children reached status=completed with an accepted LEAD-FINAL-APPROVAL handoff (scores 94, 94, 96, 94, 95, 96, 94). The workstream delivered real durability correctives -- a role-seat checkpoint mirror, commit-pinned durable-row provenance, a shared comms-transport test-isolation boundary, session_coordination comms hardening, audit-table immutability triggers on 2 of a 14-table census, a worktree-residue detection fix for a production-silent defect, and post-compaction contract re-read enforcement for the three non-handoff role seats -- while leaving an honestly-tracked set of gaps: the census-to-migration coverage gap (12 of 14 candidate tables remain unprotected), a recurring chairman-gated-migration ceremony bottleneck, and a unified_test_evidence wiring gap that surfaced identically across 5 of the 7 children.",
  conducted_date: new Date().toISOString(),
  agents_involved: ['LEAD', 'PLAN', 'EXEC'],
  sub_agents_involved: ['VALIDATION', 'Explore', 'STORIES', 'RISK', 'DATABASE', 'DESIGN', 'TESTING', 'SECURITY', 'REGRESSION'],
  human_participants: ['LEAD'],
  what_went_well,
  what_needs_improvement,
  action_items,
  key_learnings,
  quality_score: 84,
  team_satisfaction: 7,
  business_value_delivered: "Closes out chairman-ordered CAPA plan v1 workstream W6 of 6: durable records (role-seat checkpoints, commit-pinned provenance) now survive a discard, 2 of 14 censused audit/governance tables can no longer be rewritten under the service role, and comms delivery gaps (expired-unread, missing archive, backpressure observability) are now surfaced rather than silent.",
  customer_impact: "Directly reduces operational risk for the fleet's own role seats and governance records (the motivating incidents were real data loss -- Adam's checkpoints 1-27 -- and a real production email reaching the chairman's live surface); residual risk remains on the 12 uncovered audit/governance tables the census identified but this cycle did not migrate.",
  technical_debt_addressed: true,
  technical_debt_created: true,
  bugs_found: 3,
  bugs_resolved: 2,
  tests_added: 1,
  objectives_met: true,
  on_schedule: true,
  within_scope: false,
  success_patterns,
  failure_patterns,
  improvement_areas,
  generated_by: 'MANUAL',
  trigger_event: 'SD_STATUS_COMPLETED',
  status: 'PUBLISHED',
  target_application: 'EHG_Engineer',
  learning_category: 'DATABASE_SCHEMA',
  related_files: [
    'docs/audits/SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E-write-caller-census.md',
    'database/chairman-gated/20260907_feedback_immutability_trigger.sql',
    'database/migrations/20260907_michael_v1_1_tables.sql',
    'lib/comms/adam-outbound/chairman-sms-gate/index.js',
    'scripts/worktree-reaper.mjs',
    'scripts/modules/handoff/gates/core-protocol-gate.js',
    'lib/governance/post-compaction-role-recheck.cjs'
  ],
  related_commits: [],
  related_prs: [],
  affected_components: [
    'Strategic Directives', 'Audit/Governance Tables', 'Chairman-Gated Migrations',
    'Role-Seat Checkpoints', 'Session Coordination (comms)', 'Worktree Reaper', 'Comms Transport Layer'
  ],
  tags: ['capa', 'durability', 'orchestrator', 'w6', 'audit-immutability', 'parent-completion'],
  metadata: {
    written_by: 'retro-agent (manual, DB-sourced synthesis of 7 child SD_COMPLETION retrospectives)',
    child_sd_keys: [
      'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-A',
      'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-B',
      'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-C',
      'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-D',
      'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-E',
      'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-F',
      'SD-LEO-ORCH-CAPA-DURABILITY-AUDIT-001-G'
    ],
    child_lead_final_scores: { A: 94, B: 94, C: 96, D: 94, E: 95, F: 96, G: 94 },
    authored_for: 'run-parent-completion.mjs RETROSPECTIVE_EXISTS gate (orchestrator threshold)'
  }
};

async function main() {
  const { data: existing } = await supabase
    .from('retrospectives')
    .select('id')
    .eq('sd_id', PARENT_ID)
    .eq('retro_type', 'SD_COMPLETION')
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`Existing SD_COMPLETION row found (${existing[0].id}) -- updating in place.`);
    const { data: updated, error: updErr } = await supabase
      .from('retrospectives')
      .update(retrospective)
      .eq('id', existing[0].id)
      .select();
    if (updErr) { console.error('UPDATE FAILED', updErr); process.exit(1); }
    console.log('UPDATED id:', updated[0].id, 'quality_score:', updated[0].quality_score);
    return;
  }

  const { data: inserted, error } = await supabase
    .from('retrospectives')
    .insert(retrospective)
    .select();
  if (error) { console.error('INSERT FAILED', error); process.exit(1); }
  console.log('INSERTED id:', inserted[0].id, 'quality_score:', inserted[0].quality_score);
}

export { retrospective };

if (process.env.RUN_INSERT) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
