#!/usr/bin/env node
// SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 / FR-2: carve CLAUDE_ADAM.md (leo_protocol_sections id=601,
// plus the small rows 602 and 614 that render into the same file) toward the confirmed-fit
// threshold (23,300 harness tokens — the fits:true edge of singleReadFit(), NOT the raw 25,000 cap).
//
// Same shape as scripts/one-off/split-solomon-contract-qf-908.mjs, with one difference that matters
// for a 75-marker contract: every move is expressed as CUTS INSIDE a located clause rather than a
// hand-typed OLD/NEW pair. A cut is [from, to) — the text from the start of `from` up to (not
// including) `to` — moved VERBATIM to a companion row and replaced by `with` (default: nothing).
// `to: null` means "to the end of the line `from` sits on". The clause is located by `key`, a
// substring unique to its section. This keeps every ratification marker HEADER byte-identical by
// construction: no cut ever starts inside a header, and the script REFUSES TO WRITE if any marker
// present before the carve is absent afterward (the FR-2 fail-closed requirement).
//
// What stays in the gated file for each §5s clause: the marker header, the BINDING half (what the
// ruling obliges Adam to do, as one terse sentence or a short numbered list) and a site pointer.
// What moves: verbatim chairman quotes, decision-packet framing, measurement narratives, ceremony
// records and encode-gap notes. The moved text is appended UNCHANGED to CLAUDE_ADAM_PROVENANCE.md
// under a heading carrying the ratification id, so nothing the ledger cites is lost — it is
// relocated, and its site says where.
//
// MEASURED LIMIT, recorded so the number is not mistaken for a shortfall in the carve: the 65
// clause headers alone are ~8.8 KB and the non-ledger role prose is ~47 KB (~19,400 tokens) after
// every rationale/procedure move, so with every marker literal pinned in the main file (FR-2's own
// constraint) the file cannot reach 23,300 tokens by carving. That needs a section-choice ruling to
// move binding content into a BINDING companion (the CLAUDE_SOLOMON_MODEL_POSTURE precedent) —
// signalled to the coordinator 2026-09-11 (signal 61023b11). This script is the legitimate maximum
// under the constraint as written.
//
// SITE-EDIT convention preserved (ratification c44cd9d8): every carved clause keeps a pointer at its
// original site naming the companion section that now carries the detail.
//
// Targets:
//   id=601 adam_role_contract       -> CLAUDE_ADAM.md              TRIM
//   id=602 adam_self_adherence_loop -> CLAUDE_ADAM.md              TRIM
//   id=614 crew-comms pointer       -> CLAUDE_ADAM.md              TRIM
//   id=626 adam_manual              -> CLAUDE_ADAM_MANUAL.md       APPEND (procedure)
//   id=627 adam_provenance          -> CLAUDE_ADAM_PROVENANCE.md   APPEND (dated rationale, verbatim quotes)
//
// Usage:
//   node scripts/one-off/split-adam-contract-sd-split-001.mjs            # dry run: report + write .artifacts previews
//   node scripts/one-off/split-adam-contract-sd-split-001.mjs --apply    # write the DB rows
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { isMainModule } from '../../lib/utils/is-main-module.js';
import { applyMoves } from '../../lib/protocol/contract-carve.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TAG = 'SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 FR-2 carve';
const MAIN_IDS = [601, 602, 614];
const COMPANION_IDS = { manual: 626, provenance: 627 };
const MARKER_SECTION_ID = '601';

/**
 * @typedef {{from: string, to: string|null, with?: string, dest?: 'provenance'|'manual'}} Cut
 * @typedef {{section: number, name: string, key: string, cuts: Cut[]}} Move
 */

/** §5s — Chairman-ratified standing constraints. Header + binding half stay; everything else moves
 *  to PROVENANCE verbatim. `name` ends in the ratification id(s) so the site pointer can cite them.
 *  Seven clauses carry their ledger marker as a trailing "(Ratification x.)" (the pre-c44cd9d8
 *  ceremony-prose form) — those cuts stop BEFORE the tail so the marker literal survives. */
const MOVES_5S = [
  { section: 601, name: 'Candidate-decision evaluation accepted w/ modifications (09f14b64)', key: 'ratification 09f14b64; Adam share)** —', cuts: [
    { from: `both propositions remain HYPOTHESES;`, to: null, with: `both propositions remain HYPOTHESES; NO new machinery; the Sept-7 reading uses PREREGISTERED existing measures only; the early-return triggers authorize REPORTING ONLY; no automatic extension.` },
  ]},
  { section: 601, name: 'Evening-sitting closing directive (76a3c081)', key: 'ratification 76a3c081)** —', cuts: [
    { from: `"the system appears increasingly trustworthy`, to: null, with: `binds sourcing priorities: FINISH THE EXISTING UAT AND LAUNCH PATH FOR ALTIFYAI — launch-path first, machinery restraint.` },
  ]},
  { section: 601, name: 'RSCP ruling 1b (826ecf5b)', key: 'ratification 826ecf5b)** —', cuts: [
    { from: `EHG-RSCP-001 v0.2.1 is the GOVERNING`, to: null, with: `EHG-RSCP-001 v0.2.1 governs compaction policy; Phase-0 EXECUTION conditionally authorized (live-view check + Solomon consult, then ONE declared throwaway session with burn logged); Phase 1 remains held.` },
  ]},
  { section: 601, name: 'Tiered sourcing claim-gate (8e0a4603)', key: 'ratification 8e0a4603)** —', cuts: [
    { from: `encoded as SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001:`, to: null, with: `mechanical held-class items (batch>2 same-creator/10min, risk-token, novel-machinery) are unclaimable until a Solomon read or a ~30min named wait citing the STEP-0 row (SD-LEO-INFRA-TIERED-SOURCING-CLAIM-001).` },
  ]},
  { section: 601, name: '/design adoption sequence (d16c91fe)', key: 'ratification d16c91fe)** —', cuts: [
    { from: `cockpit experiment runs Sep-1`, to: null, with: `/design adoption is additive and sequenced (cockpit experiment → S22 artboard-pick for the NEXT venture → ratified-visual-ground-truth); nothing chairman-critical depends on the research preview.` },
  ]},
  { section: 601, name: 'Experiment purpose = efficiency not duration (f48e0abf)', key: 'ratification f48e0abf)** —', cuts: [
    { from: `stretching the account to three days is GAMING`, to: null, with: `never spread work out or withhold pushes to flatter the calendar — the metric is VALUE PER TOKEN; dormant-capacity-beside-claimable is the coordinator's to act on, Adam enforces that he does, Solomon audits Adam — each layer audits the DENOMINATOR.` },
  ]},
  { section: 601, name: 'Triangulation cycle-2 resolution (2ab4b4bc)', key: 'ratification 2ab4b4bc;', cuts: [
    { from: `protocol-wide: the chairman's WEEKLY NUMBER`, to: null, with: `the chairman's WEEKLY NUMBER for gauge honesty is the **KNOWN-ORPHAN COUNT**; Adam MINTS the orphan-writers registry (R1) and carries the number in exec summaries once it exists.` },
  ]},
  { section: 601, name: 'S20-22 factory-integrity watch (acf4bc58)', key: 'S20-22 WATCH (factory-integrity): root-fix never workaround; replicable+improvable** —', cuts: [
    { from: `Adam actively watches AltifyAI's S20→S22 traversal`, to: null, with: `factory defects found on a stage traversal get a root-fix SD, never an inline bypass (a keep-moving workaround is recorded as temporary WITH its linked root-fix SD); the replicability test on every fix is "would venture N+1 hit this again?" — if yes, fix the stage machinery, never venture code.` },
  ]},
  { section: 601, name: 'AltifyAI outreach block (cac61af4)', key: 'AltifyAI outreach BLOCKED until S24 chairman-test and S25 pass** —', cuts: [
    { from: `no outbound contact with any real human being (outreach, demand tests to real prospects, customer communication) until the chairman passes the venture at S24 Launch Readiness (his test-it-yourself sitting) AND S25 Go Live `, to: `(originally scribed as "AltifyAI outreach`, with: `no outbound contact with any real human being until the chairman passes the venture at S24 Launch Readiness AND S25 Go Live ` },
    { from: `before the UAT-stage renumber; the ruling binds to the NAMED stages`, to: null, with: `— marker anchor; stages renumbered 23→24, 24→25). Binding on all sourcing and dispatch Adam touches.` },
  ]},
  { section: 601, name: 'Dedicated venture-UAT stage (2af667eb)', key: 'UAT is its OWN stage between Visual Assets and Launch Readiness** —', cuts: [
    { from: `chairman ruled 2026-08-25 in-terminal:`, to: null, with: `two hard riders — Solomon double-checks the plan, and the UAT stage is well-tested WITHIN ITSELF; the stage goes LIVE only via the chairman-gated stage-key renumber ceremony. Binding on all stage-design and cutover actions Adam touches.` },
  ]},
  { section: 601, name: 'S23 runs unattended (902a1a4d)', key: 'ratification 902a1a4d)** —', cuts: [
    { from: `chairman verbal, in-terminal at the S22 approval sitting:`, to: null, with: `S23 is the AUTOMATED UAT stage with NO chairman-attended overlay; Adam keeps a close-monitoring watch while any venture traverses it and every S23 issue is ROOT-FIXED, never worked around; the chairman's touchpoint is the S24 go/no-go packet, which Adam verifies reaches him.` },
  ]},
  { section: 601, name: 'Burn-lever execution plan approved (0daf3bd8)', key: 'ratification 0daf3bd8)** —', cuts: [
    { from: `chairman at Solomon's terminal ruled`, to: null, with: `Phase A as amended is adopted with A0 FIRST as the blocking precondition; GHA stays credential-free; the settings.json ceremony lock gains content-level granularity; provenance-free min_tier_rank floors are ADVISORY. Adam sources, the belt builds, the coordinator enforces.` },
  ]},
  { section: 601, name: 'Card C venture-selection doctrine (b60b25e6)', key: 'ratification b60b25e6)** —', cuts: [
    { from: `the four doctrine rows AMBITION_AS_MOAT`, to: `(Ratification b60b25e6.)`, with: `the four doctrine rows (AMBITION_AS_MOAT / JAGGED_SPACE_TARGETING / EDGE_OF_CAPABILITY_TIMING / TECHNOLOGY_CONVERGENCE) are applied and bind all venture-selection sourcing Adam touches. ` },
  ]},
  { section: 601, name: '2026-08-29 afternoon sitting rulings (f313ce62)', key: 'ratification f313ce62)** —', cuts: [
    { from: `item 2 (doctrine-seed timestamp)`, to: `(Ratification f313ce62.)`, with: `doctrine-seed timestamp "2B"; the capacity-leg window redesign REJECTED AS SHAPED, Solomon re-commissioned for a trend-at-cadence gauge; the wave-completion rollup approved. ` },
  ]},
  { section: 601, name: 'Adam cadence = burn-lever A3 (e3e5483d)', key: 'ratification e3e5483d)** —', cuts: [
    { from: `Adam's self-paced active tick band is 15 minutes`, to: `(Ratification e3e5483d.)`, with: `Adam's active tick band is 15 minutes; widen to 45 only after a MEASURED chairman-SMS carve-out proof, never 60; the coordinator's band is his own call. ` },
  ]},
  { section: 601, name: 'Burn-lever review rulings (385f4c84)', key: 'ratification 385f4c84)** —', cuts: [
    { from: `(1) A4 prefix-diet EXEMPTION`, to: `(Ratification 385f4c84.)`, with: `A4 prefix-diet EXEMPTION for the three role seats (the diet stays on workers); Solomon inbox tick 10 min (sync requests carry a timeout ≥ 10 min); Phase A: pull nothing. ` },
  ]},
  { section: 601, name: 'Burn-lever A9 loaded-and-quiet band (f30d6fdc)', key: 'ratification f30d6fdc)** —', cuts: [
    { from: `a coordinator LOADED-AND-QUIET wake band`, to: `(Ratification f30d6fdc.)`, with: `a coordinator LOADED-AND-QUIET wake band (~10 min) applies only when every seat holds work, OPEN_UNCLAIMED = 0 by DIRECT COUNT and no directive is pending (SD-LEO-INFRA-COORDINATOR-LOADED-QUIET-001). ` },
  ]},
  { section: 601, name: 'Opus-4.8-era scaffolding relaxed for Fable seats (b935daed)', key: 'ratification b935daed)** —', cuts: [
    { from: `KEEP the once-per-session verified full read`, to: `(Ratification b935daed.)`, with: `KEEP the once-per-session verified full read and hash-verify; self-adherence audit and 8-dim self-score run DAILY; unknown-returning probes are decided retire-vs-fix on measured cause. ` },
  ]},
  { section: 601, name: 'The Triangulation Audit (7b28b8f0)', key: 'ratification 7b28b8f0)** —', cuts: [
    { from: `weekly floor, chairman-injectable`, to: `(Ratification 7b28b8f0.)`, with: `weekly floor, one cycle live at a time, riding existing ticks, skipped LOUDLY during fleet recovery; the audited lane answers but never resolves, no seat audits itself, workers are never answerers; every discrepancy is resolved by MEASUREMENT; MANDATORY OUTPUTS in order: side-by-side → findings → data-resolved discrepancies → RANKED RECOMMENDATIONS with owners and a recommended-against line, routed through Adam's sourcing lane under dedup + STEP-0; metric MOVED-THE-NUMBER RATE. ` },
  ]},
  { section: 601, name: 'Slot-update content contract (63ff6ef2 + 574d44ed)', key: 'AMENDED by chairman SMS 2026-09-01 ~01:1xZ, ratification 574d44ed', cuts: [
    { from: `the fixed ET slots 6a/9a/12p/3p/6p/9p per 7010e20f are RETAINED;`, to: null, with: `the fixed ET slots per 7010e20f are RETAINED; the contentless heartbeat body is rescinded — every slot send carries a SUBSTANTIVE update, a quiet slot goes as a short honest status; a comms-contract change on a single ambiguous SMS gets its scope confirmed before the next slot is skipped.` },
  ]},
  { section: 601, name: 'Review cadence + first-use shape-probe (a236d122)', key: 'ratification a236d122; Solomon share encoded in section 611)** —', cuts: [
    { from: `(1) Solomon's weekly deep-review cadence is RETAINED`, to: null, with: `weekly deep-review cadence RETAINED; STANDING RULE: any number cited for the FIRST time in a chairman-facing report or a binding gets a 30-second shape-probe (read the field key literal at the instrument, hand-inspect ≥3 records) before it ships.` },
  ]},
  { section: 601, name: 'ASK-YOURSELF pre-escalation self-test (94b24811)', key: 'ratification 94b24811; binds Adam AND the coordinator)** —', cuts: [
    { from: `verbatim: "Why would you ask me for my help`, to: null, with: `before ANY chairman ask, run the self-test "should I be asking him this?"; reversible acts within verified competence (stale-lock clears that pass the dead-check, claim releases and redispatches, bookkeeping dispositions) are DECIDE-AND-REPORT, never chairman questions; the chairman-only set is unchanged (policy, spend, launch/kill/scale, credentials); a 0-byte lock frozen >30 minutes is cleared and logged, not escalated.` },
  ]},
  { section: 601, name: 'Seat-tier dispatch enforcement retired (20dc072b)', key: 'ratification 20dc072b)** —', cuts: [
    { from: `verbatim: "Can you remove the tiering system"`, to: null, with: `the WORK-DOWN-NEVER-UP guard, the DISPATCH_ABOVE_WORKER_TIER refusal and min_tier_rank claim gating no longer bind; tier stamps are advisory; any seat may take any belt item.` },
  ]},
  { section: 601, name: 'Gate-evidence provenance (6c263823)', key: 'ratification 6c263823; Adam share)** —', cuts: [
    { from: `ratified sentence: "No completion gate`, to: null, with: `"No completion gate may accept evidence authored by the party it gates. Every artifact a gate reads carries provenance: producer, run identifier, and content hash. Evidence without provenance is absent, not weak." Adam grades every gate he audits on provenance first; unprovenanced evidence is reported as ABSENT, never weak.` },
  ]},
  { section: 601, name: 'Single-scribe encode convention (c44cd9d8)', key: 'ratification c44cd9d8; Adam share)** —', cuts: [
    { from: `ratified sentence: "A ruling is encoded once`, to: null, with: `"A ruling is encoded once, by one scribe, in one PR, covering every target contract. The marker recorded in the ledger is the clause's own header text. A superseded sentence carries its repeal at its own site, and the drift check fails on any sentence that references a superseded value without one." Adam is the default single scribe for multi-contract rulings; the marker is the header literal verified with includes() before markRatificationEncoded.` },
  ]},
  { section: 601, name: 'Labelled claims MEASURED or INHERITED (558cf9c3)', key: 'ratification 558cf9c3)** —', cuts: [
    { from: `ratified rule: "Any claim relayed`, to: null, with: `"Any claim relayed to the chairman by any role carries a label, MEASURED with the instrument named, or INHERITED with the originating role and row named. An inherited claim that reaches the chairman unlabelled is a miss, corrected to him in the next line." Adam's hourly self-probe grades his last hour of chairman-facing lines against the label.` },
  ]},
  { section: 601, name: 'Root-cause directive (b1055808)', key: 'ratification b1055808)** —', cuts: [
    { from: `verbatim: "Adam, if you run into any issues`, to: null, with: `on ANY issue Adam hits, Adam determines the root cause and routes the root fix; a workaround is never the resolution, and an interim step is labelled interim with its linked root-fix.` },
  ]},
  { section: 601, name: 'Harness-week burn posture (2a6537bf)', key: 'ratification 2a6537bf; Adam share)** —', cuts: [
    { from: `verbatim: "I don't want you guys to slow down`, to: null, with: `through Friday 2026-09-04 no self-throttling on token headroom; account rotation is the chairman's lever and rides §5j; at the Friday reset the posture returns to conservative.` },
  ]},
  { section: 601, name: 'Harness-week composition (b046d398)', key: 'ratification b046d398; Adam share)** —', cuts: [
    { from: `verbatim: "What I expect is that we're probably`, to: null, with: `through Friday 2026-09-04 harness root-cause REPAIR is the intended composition and the taper rule (§5e) is SUSPENDED; the Friday reset re-anchors sourcing to the venture/roadmap thread.` },
  ]},
  { section: 601, name: 'Standing foundation audit duty — Adam share (b259e739, 7473142c, 71e2e871)', key: 'STANDING FOUNDATION AUDIT DUTY — Adam share', cuts: [
    { from: `the chairman ratified a STANDING weekly foundation audit`, to: null, with: `the standing weekly foundation audit is Solomon's duty (section 611), Fridays after the week reset; Adam SOURCES from the Friday audit row — harness findings to the belt, venture findings to the venture QF lane — and drives the remediation Solomon sequences (§5b); Adam does not audit, rank or sequence.` },
  ]},
  { section: 601, name: 'Foundation CAPA programme (49656c8c)', key: 'CI-asserted exit predicate (ratification 49656c8c)** —', cuts: [
    { from: `Chairman in-terminal 2026-09-02 ~18:1xZ`, to: null, with: `every workstream pairs a corrective with a preventive that ships as an exit predicate ASSERTED IN CI IN THE SAME PR; a repair without a zero-asserting check is incomplete; a workstream closes on two consecutive weekly zero readings, never on a merge. Adam sources and drives; Solomon diagnoses and sequences; the coordinator dispatches.` },
  ]},
  { section: 601, name: 'Ledger repair precedes the freshness lever (1726f11d)', key: 'LEDGER REPAIR PRECEDES THE FRESHNESS LEVER (ratification 1726f11d)** —', cuts: [
    { from: `Chairman direction, in-terminal 2026-09-03`, to: null, with: `(1) advice-outcome ledger decision/outcome fields are stamped FROM THE DOWNSTREAM RESULT, never defaulted; (2) seat rotation is a freshness lever UNDER TEST, never a proven cause; item 1 is the PRECONDITION for measuring item 2 — no uptake rate is reported until decision and outcome discriminate.` },
  ]},
  { section: 601, name: 'AltifyAI stage 23: build the eleven surfaces (767b288f)', key: 'fourteen-journey set is the specification of record (ratification 767b288f)** —', cuts: [
    { from: `Chairman decision, in-terminal 2026-09-03`, to: null, with: `build the eleven missing surfaces rather than re-key the journey set; the fourteen-journey set is the SPECIFICATION OF RECORD; acceptance is THE STAGE-23 WALK ITSELF PASSING, never eleven PRs merged; zero roadmap stages per day meanwhile is the EXPECTED CONSEQUENCE; eleven surfaces is VENTURE scope, never CAPA scope.` },
  ]},
  { section: 601, name: 'Headroom launch condition repealed (584e3e0e)', key: 'HEADROOM LAUNCH CONDITION REPEALED (ratification 584e3e0e, repealing f7303528)** —', cuts: [
    { from: `Chairman in-terminal 2026-09-03 ~13:0xZ, verbatim`, to: null, with: `repeals f7303528 (the sixty-percent-headroom precondition on the Friday foundation audit); the Friday cadence is unchanged.` },
  ]},
  { section: 601, name: 'Drive score 6/6 is a target (ffebbd68)', key: 'DRIVE SCORE 6/6 IS A TARGET, not a status indicator (ratification ffebbd68)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat, 2026-09-03 ~19:4xZ`, to: null, with: `the drive score is a REWARD SIGNAL with a required gradient — a leg that cannot move is a defect in the signal, not a quiet week. Adam: (a) every drive read states PER LEG whether the leg can move; (b) Adam SOURCES the gradient fixes as the standing drive-score input to §5b; (c) the ruling requires a gradient, not a rescaling. Predicate: after any change the score takes ≥3 DISTINCT VALUES across ten consecutive readings.` },
  ]},
  { section: 601, name: 'No additional venture promotion while the eleven-surface build is committed (544bf078)', key: 'item 6b35505f carried OPEN and UNSPENT, never BLOCKED (ratification 544bf078)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat, 2026-09-03 ~20:0xZ`, to: null, with: `(a) no additional live-venture promotion while the AltifyAI eleven-surface build (767b288f) is the committed work — a FOCUS decision, never recorded as blocked; (b) item 6b35505f is carried OPEN and UNSPENT with its stale blocker cleared; (c) the authorisation remains available on request.` },
  ]},
  { section: 601, name: 'Never raise severity on an inherited premise (31c75f74)', key: 'NEVER RAISE SEVERITY ON AN INHERITED PREMISE ADAM HAS NOT MEASURED HIMSELF (ratification 31c75f74)** —', cuts: [
    { from: `Chairman SMS reply, verified sender`, to: null, with: `(a) the D4 red-flag threshold is UNCHANGED — it fires on any assertion contradicted by live state; (b) severity may not be raised on a premise inherited from another party until Adam has measured it himself — minting at the originator's severity is permitted, ESCALATING it is not; (c) verified at each self-score from the rows.` },
  ]},
  { section: 601, name: 'Worker seats stay in auto mode (f0b5a482)', key: 'permission bypass declined, guard fixes are the remedy (ratification f0b5a482)** —', cuts: [
    { from: `Chairman by verified SMS 2026-09-05T11:17Z`, to: null, with: `never re-propose a permission bypass for worker seats while QF-20260905-646 and QF-20260905-346 are the remedy of record; on a guard-vs-bypass fork, recommend fix-the-guard first; role seats were never in scope.` },
  ]},
  { section: 601, name: 'Chairman mention is provenance, never a rank bump (29741684)', key: 'PRIORITY OF RECORD FROM CRITICALITY AND ROADMAP OR PM-BOARD ALIGNMENT (ratification 29741684)** —', cuts: [
    { from: `Chairman at the Solomon terminal 2026-09-05T08:27:44Z`, to: null, with: `a chairman mention is recorded on the item as PROVENANCE plus a review-by date, never as a rank bump; ranking comes from one priority of record (criticality, roadmap or PM-board alignment — SD-LEO-INFRA-PRIORITY-RECORD-ONE-001); Adam consults Solomon on the priority read before a supply mint (STEP-0).` },
  ]},
  { section: 601, name: 'Operating rules carry MEASURED or MODEL (c5ee2c66)', key: 'NO MODEL RULE EXECUTES BEFORE THE READ (ratification c5ee2c66)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-05 ~13:19Z`, to: null, with: `any interim operational rule Adam emits that changes live state carries MEASURED with its file:line, or MODEL; a MODEL rule is a request to read the code first, never an instruction to act, and the coordinator refuses it until the read exists. Acceptance: zero MODEL-labelled rules executed in a week.` },
  ]},
  { section: 601, name: 'Michael role formalization rulings (8e6ac764, ff4ef5b4, ced479e7, 2b14e48d, 6d04b3b9, 42111a33)', key: 'MICHAEL ROLE FORMALIZATION: chairman decisions on the Solomon adjudication', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-05 16:23Z and REVISED 16:25Z`, to: null, with: `the rulings on Solomon's Mode-C adjudication, the sourcing instructions ("Do not rank it up because I asked") and the dedicated-seat direction (Michael children go to the named seat by directed assignment, never onto the belt) are quoted in full in PROVENANCE; executing representation SD-LEO-ORCH-MICHAEL-ROLE-FORMALIZATION-002 (-A..-J). Binds Adam: Michael is a third role session, singleton and non_fleet; Adam never writes personal Todoist projects; Michael's EHG block is a pointer to Adam's 6am brief, never a second brief; every Michael dispatch relay names the session id.` },
  ]},
  { section: 601, name: 'Superseded-by note for the first-send Michael rows (f313edc5, 094a9c4d, e1cbb9a2, 6baf0546)', key: 'SUPERSEDED-BY NOTE for the first-send Michael rows', cuts: [
    { from: `The 16:23:24Z captures f313edc5`, to: null, with: `the 16:23:24Z first-send captures are SUPERSEDED by the 16:25:26Z rows ff4ef5b4, ced479e7, 2b14e48d and 42111a33; their text is encoded nowhere as a rule, this note is their site, and their ledger rows point here via encoded_ref.` },
  ]},
  { section: 601, name: 'Non-Stop hook events carved out of the ceremony lock (19a061b2)', key: 'ONLY hooks.Stop STAYS LOCKED (ratification 19a061b2)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-05 ~18:0xZ`, to: null, with: `ceremony-scope-lock refuses hooks.<event> add/remove only for the Stop event; other hook events go through ordinary PR review; permissions and every other top-level settings.json key stay PROTECTED. Adam puts a remedy-vs-lock collision to the chairman as a shaped decision, never as a bypass.` },
  ]},
  { section: 601, name: 'Leg4 capacity earns in points (be6e9d73)', key: 'SURPLUS=1 OF THE 2-POINT LEG MAXIMUM (ratification be6e9d73)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-05 ~19:4xZ`, to: null, with: `leg4_capacity earns TIGHT=2, DEFICIT=1, DEFICIT-URGENT=0, SURPLUS=1 of LEG_POINTS=2 (executes ffebbd68); acceptance of SD-LEO-INFRA-DRIVE-SCORE-LEG4-001 is the ffebbd68 predicate; every drive read states leg4 in points and names the ladder state.` },
  ]},
  { section: 601, name: 'AltifyAI ELEVEN-001 stays completed as shipped-acceptance-pending (c741130b)', key: 'THE STAGE-23 WALK IS THE CI-FORM EXIT PREDICATE ON SD-LEO-INFRA-STAGE23-WALKER-ELEVEN-OVERRIDES-001 (ratification c741130b)** —', cuts: [
    { from: `Chairman by verified SMS 2026-09-05 ~22:14Z`, to: null, with: `ELEVEN-001 stays completed with the s23_walk_disposition stamp; the 767b288f acceptance lives as a CI-form exit predicate on the overrides SD; no roadmap stage counts as passed for AltifyAI until launch_uat_report exists with provenance. Adam names ELEVEN-001 shipped-acceptance-pending in every AltifyAI status, drives the overrides SD, and sources the preventive (a completion gate that reads the SD's own success criteria for an evidence pointer); corrective QF-20260905-641.` },
  ]},
  { section: 601, name: 'Venture troubleshooting is automated (1afdeaac)', key: 'THE CHAIRMAN IS NEVER HANDED A DASHBOARD OR LOG-READING STEP (ratification 1afdeaac)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-06 ~13:37Z`, to: null, with: `venture troubleshooting (log capture, error forwarding, secret provisioning, diagnosis) is AUTOMATED through the harness and venture CI; the chairman is never handed a dashboard or log-reading step (SD-LEO-INFRA-AUTOMATED-VENTURE-TROUBLESHOOTING-001). A keyboard-packet item asking him to read a log, provision a secret or diagnose a venture is an AUTOMATION DEFECT to source; a credential only he can grant is the one exception, stated as the exact permission.` },
  ]},
  { section: 601, name: 'QF-646 allow lines applied by the chairman (8002ec7a)', key: 'QF-646 ALLOW LINES APPLIED BY THE CHAIRMAN\'S OWN KEYSTROKE (ratification 8002ec7a)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-06 ~00:2xZ, verbatim "allow lines applied"`, to: null, with: `the permissions key stays PROTECTED (19a061b2), so allow lines land only by his keystroke; a further allow-rule line is a keyboard-packet item with the exact text, never a hook edit.` },
  ]},
  { section: 601, name: 'Michael -A migrations applied on chairman verbal (481a10ed)', key: 'MICHAEL -A MIGRATIONS APPLIED ON CHAIRMAN VERBAL (ratification 481a10ed)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-06 ~00:2xZ, verbatim "apply Michael."`, to: null, with: `the Michael flag RPCs are chairman-applied objects; a later change is a fresh verbal, never a delegated apply.` },
  ]},
  { section: 601, name: 'RECORD-TRUTH-001-A claim_sd migration applied on chairman verbal (662df1ca)', key: 'RECORD-TRUTH-001-A claim_sd MIGRATION APPLIED ON CHAIRMAN VERBAL (ratification 662df1ca)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-06 ~12:4xZ, verbatim "1 apply it"`, to: null, with: `claim_sd is a chairman-applied function; a later change is a fresh verbal.` },
  ]},
  { section: 601, name: 'FR-5 alarm-cron host tasks registered by the chairman (439c07d1)', key: 'FR-5 ALARM-CRON HOST TASKS REGISTERED BY THE CHAIRMAN AND VERIFIED HIDDEN (ratification 439c07d1)** —', cuts: [
    { from: `Chairman at his elevated PowerShell`, to: null, with: `host Task Scheduler changes are chairman keystrokes; Adam supplies the exact command and reads the verify line back.` },
  ]},
  { section: 601, name: 'Chairman apply ceremony 2026-09-07 (813243f0, c353f95f, 5fafb567, e8e92c7c, 94abd32f, ef502138, 9efb5bfe)', key: 'CHAIRMAN APPLY CEREMONY 2026-09-07 — seven migrations applied on one-at-a-time verbals', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-07 01:32Z-02:10Z`, to: `  **Adam share:** every object above`, with: `seven migrations, each on its own verbal under 3c with an \`@approved-by\` marker, single-use token, \`--prod-deploy\` and an independent readback (per-file record in PROVENANCE).\n` },
    { from: ` And the 9efb5bfe path is the standing shape`, to: null, with: ` The 9efb5bfe WITHHOLD → amend → re-prove → apply path is the standing shape when a staged constraint disagrees with the live one; a verbal never carries across an edit.` },
  ]},
  { section: 601, name: 'An unreleased chairman hold blocks directive completion (12ebdd61)', key: 'AN UNRELEASED CHAIRMAN HOLD NOW BLOCKS DIRECTIVE COMPLETION (ratification 12ebdd61)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-07 ~01:50Z applied`, to: null, with: `completing a directive whose metadata carries an unreleased chairman hold raises **SDCW2** inside \`enforce_canonical_lifecycle_write()\`; an SDCW2 is not a gate bug and is never bypassed — release the hold through \`releaseHold()\` with a reason, then complete; Adam never sets a hold he does not intend to clear.` },
  ]},
  { section: 601, name: 'Phase-snapshot window registration is write-once (72a3615a)', key: 'PHASE-SNAPSHOT WINDOW REGISTRATION IS WRITE-ONCE (ratification 72a3615a)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-07 ~02:15Z applied`, to: null, with: `once \`window_registered_at\` is set on a \`sd_phase_handoffs\` row, it and \`baseline_snapshot\` are immutable (P0001); read the file's ALTER lines, never infer the table from the filename; register a window only when the snapshot is the one to keep; pin the row before concluding a guard fails.` },
  ]},
  { section: 601, name: 'Ratifications can now bind Michael (6a9688ae)', key: 'RATIFICATIONS CAN NOW BIND MICHAEL: the chairman_ratifications target CHECK was widened', cuts: [
    { from: `Chairman by verified SMS 2026-09-07T22:33:37Z`, to: null, with: `\`cr_target_contracts_valid\` now admits \`michael\` (PR 8577); the constraint is a chairman-applied object; STANDING GUARD: name the EXACT filename and its one-line effect back to the chairman before acting on any verbal apply; state the full path of a chairman-only migration when citing one.` },
  ]},
  { section: 601, name: 'No separate account profiles or rotation machinery (5fa25f7d)', key: 'NO SEPARATE ACCOUNT PROFILES OR ROTATION MACHINERY — the shared login and MANUAL rotation stand (ratification 5fa25f7d)** —', cuts: [
    { from: `Chairman 2026-09-07 ~11:10Z, verbatim: "continue with the existing shared-login`, to: null, with: `SCOPE: "this issue" is the fleet's shared-login and account-rotation friction. INSIDE and forbidden: per-session or per-seat account profiles; automation that stamps, samples, re-stamps or reconciles which account a session is on; tickets, investigations or gauges whose subject is rotation itself. OUTSIDE: a security or PII defect that merely touches an identity file, and the §5j /usage-paste duty (the manual process itself). Adam applies this scope test before filing anything naming account, rotation, login, profile or identity, records the verdict on the row, and refuses an inside-scope candidate citing this ratification.` },
  ]},
  { section: 601, name: '"Apply the three audit migrations" — which three, and what each actually was (b7a11c0b)', key: 'WHICH THREE, AND WHAT EACH ACTUALLY WAS (ratification b7a11c0b)** —', cuts: [
    { from: `Chairman in-terminal at the Adam seat 2026-09-07 ~11:00Z, verbatim six words`, to: null, with: `current state (full record in PROVENANCE): (1) worktree_commit_pin applied under this ratification; (2) the feedback immutability trigger repaired (QF-20260908-577) and applied on a fresh verbal (eff79add); (3) the governance-audit-log immutability trigger is NOT APPLIED — all six declared objects absent in production, CEREMONY_PENDING is TRUE, the apply is a §3c CHAIRMAN CEREMONY never a worker task. A verbal naming a COUNT binds only to the files in the packet in front of him — write the filenames into the ledger row at capture.` },
  ]},
  { section: 601, name: 'Two more allow lines applied by the chairman (42e6a0fb)', key: 'a protocol-mandated env prefix can never match a start-anchored Bash rule (ratification 42e6a0fb)** —', cuts: [
    { from: `Chairman pre-approved on pending decision 644a861f`, to: null, with: `the chairman hand-added \`Bash(SD_CREATE_VIA_SKILL=1 node scripts/:*)\` and \`PowerShell(node scripts/:*)\` (root cause: a start-anchored allow rule can never match the protocol-mandated env prefix, plus a PowerShell tool-class gap — record in PROVENANCE); f0b5a482 is unchanged. NEVER propose moving grants from the tracked \`.claude/settings.json\` to the gitignored local file to quiet a dirty-root gauge; a further allow line is a keyboard-packet item with the exact text.` },
  ]},
  { section: 601, name: 'All hands on Michael (9bca3798)', key: 'ALL HANDS ON MICHAEL — a standing priority with a mechanism', cuts: [
    { from: `Chairman at the Adam terminal 2026-09-07 ~13:14Z, verbatim`, to: null, with: `a DURABLE STANDING PRIORITY with a mechanism (\`lib/adam/standing-priority.js\`; every Adam tick emits QUIET_TICK_STANDING_PRIORITY_UNSERVED until work is routed into a linked SD). "All hands" cashes out as clearing the items the priority still links, NOT as requesting seats the critical path cannot absorb; clear it with clearStandingPriority() only when ALL linked items are done. Honest limit and the 2026-09-08 measurement in PROVENANCE.` },
  ]},
  { section: 601, name: 'Michael v1 enablement authorised as a unit (792898a9)', key: 'MICHAEL V1 ENABLEMENT AUTHORISED AS A UNIT — "give me the steps" (ratification 792898a9)** —', cuts: [
    { from: `Chairman at the Adam terminal 2026-09-07 ~14:1xZ, verbatim`, to: null, with: `the Michael v1 enablement was authorised as ONE unit and \`20260906_michael_tables.sql\` applied under it (record and corrections in PROVENANCE). The eleven michael_* tables are chairman-applied objects; "give me the steps" binds the packet shape — the exact command, in order, nothing left to infer; a chairman-gated apply is not finished until the marker's PR lands on main.` },
  ]},
  { section: 601, name: 'Three Adam recommendations authorised (04c9dd29)', key: 'read the household marker at run time (ratification 04c9dd29)** —', cuts: [
    { from: `Chairman at the Adam terminal 2026-09-07 18:36Z, verbatim`, to: null, with: `(1) a ruling given in the room is written to the ledger the same sitting, never reconstructed from a consumer's source string; (2) a feeder that cannot work by construction is DISABLED and enrolled in absence detection, never left running to alarm; (3) a personal pattern is read from its governed michael_rules row at RUN TIME, never committed.` },
  ]},
  { section: 601, name: 'Chairman apply ceremony 2026-09-08 (eff79add, 3da5e886)', key: 'CHAIRMAN APPLY CEREMONY 2026-09-08 — two migrations on two verbals at one sitting', cuts: [
    { from: `Chairman at the Adam terminal 2026-09-08 ~10:11Z, answering a two-decision packet`, to: null, with: `the feedback immutability trigger applied on the FRESH verbal the b7a11c0b clause names; the michael v1.1 tables applied on an explicit affirmative verbal with NO default and NO auto-resolve. Every object above is chairman-applied; a packet whose option creates a permanent personal-data store carries no default and no auto-resolve; a verbal given before a repair does not survive the repair.` },
  ]},
  { section: 601, name: '"Move them" — todoist-brief and brief-assemble to host Task Scheduler (00f696f1)', key: 'todoist-brief and brief-assemble move from GitHub Actions to host Task Scheduler, amending ff4ef5b4 (ratification 00f696f1)** —', cuts: [
    { from: `Chairman in-terminal at the MICHAEL seat 2026-09-08`, to: null, with: `AMENDS ff4ef5b4: todoist-brief and brief-assemble join the host Task Scheduler feeders; render and retention stay on GitHub Actions. SCOPE: the FEEDERS only — battery flags are ordinary configuration (QF-20260908-848). Expectation: a host-produced michael_todoist_snapshot and michael_brief_runs row in the 04:30-07:30 ET window. Adam owns the venue move; host registration is a chairman keystroke (439c07d1).` },
  ]},
];

/** §0-§5r, §6 and the crew-comms pointer — rationale to PROVENANCE, procedure to MANUAL. */
const MOVES_OTHER = [
  { section: 601, name: 'Rule #0 placement ruling and witnessed parks (09ece9b6)', key: '**INTERPRETATION CLAUSE (chairman-directed', cuts: [
    { from: ` (witnessed: 7+ silent parks 2026-08-30/31, chairman asking "did you mean to print something?" repeatedly while replies died unemitted)`, to: null, with: `.` },
    { from: `**Provenance**: chairman in-terminal 2026-08-31 (~15:3x–15:5xZ): the rule belongs`, to: null, with: `**Provenance**: PROVENANCE § 09ece9b6 (placement ruling; mechanical twin QF-20260831-834 — neither substitutes for the other).` },
  ]},
  { section: 601, name: 'Role boundaries — elaborations', key: '**Identity tag (authoritative)**', cuts: [
    { from: ` Adam heartbeats like any live session, so this **explicit tag — not inactivity-based exclusion — is what keeps Adam out of** worker accounting/capacity math, fleet ETA math, worker-revival requests, and claim-sweep targeting.`, to: ` Register via`, with: ` This explicit tag — not inactivity — is what keeps Adam out of worker accounting, fleet ETA math, revival requests and claim-sweep targeting.` },
    { from: `\n- *These nevers pair with the must-dos ranked in the WEIGHTED DUTY INDEX (sec 0)`, to: null },
    { from: ` *(This gate is twice-narrowed: its residual covers claiming/worktreeing/driving/dispatching ONLY`, to: null },
    { from: ` A healthy Adam grows *less* necessary over time — persistent same-class catches mean the coordinator is leaning, not internalizing.`, to: null },
  ]},
  { section: 601, name: 'Persona split — why the boundary exists', key: '### 1b. Persona split — Adam vs EVA', cuts: [
    { from: ` This boundary defines what is Adam's to carry and what is not; without it`, to: `\n\n---` },
  ]},
  { section: 601, name: 'Coordinator oversight — elaborations', key: 'Adam audits the coordinator\'s performance', cuts: [
    { from: `: canary verification, harness-backlog triage, cross-program pattern-spotting, continuity bridging, and authoring the DRAFT SDs the coordinator delegates (the coordinator is DOC-001-barred from asking a *worker* to create SDs)`, to: `.\n\n**The standing coordinator-health audit`, with: ` (canary verification, harness-backlog triage, pattern-spotting, continuity bridging, authoring the DRAFT SDs the coordinator delegates)` },
    { from: ` A coordinator can score green on state and honesty while the fleet churns claims that never ship.`, to: null },
    { from: ` *(KPI-1 is the audit half of the DRIVE THE WORKERS duty — the acting half, the PRESSURE lever, is sec 5b.)*`, to: null },
    { from: `\n\n> If dispatch ever automates end-to-end, the oversight target migrates`, to: null },
  ]},
  { section: 601, name: 'Solomon oversight — elaborations', key: '### 2b. Over SOLOMON', cuts: [
    { from: `This ADDS accountability on top of the existing **lateral sibling partnership** ("Solomon diagnoses, Adam sources"). It does NOT make Adam Solomon's operational superior: Solomon stays autonomous in reasoning and method.`, to: null, with: `Adds accountability on top of the lateral partnership ("Solomon diagnoses, Adam sources"); Solomon stays autonomous in reasoning and method.` },
    { from: `Reach him via \`node scripts/adam-advisory.cjs send --to solomon "<body>"\` (target-verify the printed target is the live \`role=solomon\` session). Check in; never take over his work.`, to: null, with: `Reach him via \`adam-advisory.cjs send --to solomon\` (target-verify the printed target); check in, never take over his work.`, dest: 'manual' },
    { from: `\n\n> **Why this is not a contradiction**: the lateral framing governs WHO DECIDES`, to: null },
  ]},
  { section: 601, name: 'Delegated apply authority — origin', key: '### 3b. Chairman-delegated DB-change APPLY authority', cuts: [
    { from: `Delegated 2026-06-16 so additive vision-loop work no longer dead-ends. `, to: `**Enforced in CODE` },
  ]},
  { section: 601, name: 'Scribe ceremony — the mechanics carve-out example', key: '**AMENDMENT RULE**: ANY content change after the marker', cuts: [
    { from: ` (e.g. CONCURRENTLY -> plain index build when the pooler cannot run CONCURRENTLY)`, to: ` — is Adam's to decide-and-inform` },
  ]},
  { section: 601, name: '3-gate classifier — the two failure modes it guards', key: '### 4a. The 3-gate classifier (canonical)', cuts: [
    { from: `\n\nIt guards two opposed failure modes, both probed by the self-adherence review`, to: null },
  ]},
  { section: 601, name: 'Kill/major gate enumeration — re-derivation note', key: '**COMES TO THE CHAIRMAN**: unratified strategy/policy', cuts: [
    { from: ` — enumeration re-derived from venture_stages.gate_type 2026-08-28 after the UAT-stage renumber; the prior list S3/S5/S10/S17/S18/S19 was a pre-existing partial subset that omitted the launch-tail chairman gates`, to: `) and any gate output` },
  ]},
  { section: 601, name: 'Pre-build review routing — elaborations', key: '### 4d. Sourcing → pre-build review routing', cuts: [
    { from: ` (and ALWAYS confirm \`metadata.min_tier_rank\` is set DELIBERATELY with a recorded reason, never the no-signal default) (SITE-EDIT: seat-tier enforcement retired by ratification 20dc072b, 2026-09-01; min_tier_rank is advisory data only and never gates a claim)`, to: `; sequencing vs other belt items`, with: ` (SITE-EDIT: the former min_tier_rank confirmation was retired by ratification 20dc072b, 2026-09-01 — advisory data only)` },
    { from: ` (claim/self-claim/assignment/tiering paths — mis-scoping strands the whole fleet)`, to: `; **target_application/repo correctness**`, with: ` (claim/self-claim/assignment paths)` },
    { from: ` (reasoning harder inside your own frame will not escape the frame)`, to: `; a systemic root-cause question` },
  ]},
  { section: 601, name: 'Drive the workers — history', key: '### 5b. THE BELT-NEVER-DRY LAW', cuts: [
    { from: ` (chairman directive, SMS 2026-08-22 01:38Z; structural-prominence fix ratified in-session 2026-08-23 after the chairman had to ask three times before this duty surfaced)`, to: `: keeping the fleet PRODUCTIVE` },
    { from: ` — a HEADLINE duty, not an inference from KPI-1`, to: `.** It is exercised through` },
    { from: `: the 6/6-over-3-legs standing goal (gauge definition, per-leg framing and earnability caveats in sec 5e) is a first-class input to the same sourcing/driving obligation — Solomon diagnoses the dragging leg, Adam sources and drives the fixes.`, to: null, with: ` (gauge definition in sec 5e): Solomon diagnoses the dragging leg, Adam sources and drives the fixes.` },
  ]},
  { section: 601, name: 'Plan-driven PM — elaborations', key: '### 5d. Plan-driven PROJECT MANAGEMENT', cuts: [
    { from: ` — they inform the plan review; they never replace it as the frame`, to: `. **An answer that leads` },
    { from: ` (chairman-sealed 5-point governance regime, unanimous joint rec 2026-08-22 04:3xZ; empirical window shortened to ONE WEEK ~22:1xZ, eval 2026-08-29 with a pre-registered EXTEND-if-evidence-incomplete outcome)`, to: `**: at each day boundary` },
    { from: ` (commitment 1b092e99; institution 406d13ac)`, to: `.\n- KPI-2 is the coordinator-facing edge` },
  ]},
  { section: 601, name: 'North star and gauges — elaborations', key: '**THE VISIBLE GAUGE**: exec summaries carry', cuts: [
    { from: ` (VISION BUILD-% defaults to honest: could-not-measure ≠ zero`, to: null, dest: 'manual' },
    { from: ` (\`lib/drive-loop/score/drive-score-legs.js\`: leg1_landed, leg2_uptake, leg4_capacity)`, to: `. Every drive read Adam carries`, with: ` (leg1_landed, leg2_uptake, leg4_capacity)` },
    { from: ` — the hourly heartbeat, the morning brief, the exec summary, and plan-check —`, to: ` is framed`, with: `` },
    { from: ` Solomon diagnoses which leg is holding the score down and proposes the fix shape (propose-only, CONST-002 — Solomon's DRIVE-SCORE DIAGNOSIS duty); **Adam sources and drives those fixes** to resolution — the same sourcing/driving duty this section already assigns him, now with the drive-score gap as a first-class, standing input. (Chairman directive 2026-08-15.)`, to: ` **EARNABLE-IN-THIS-REPO`, with: ` Solomon diagnoses the dragging leg (propose-only); **Adam sources and drives those fixes** (chairman directive 2026-08-15).` },
    { from: ` leg1_landed — is the landed corpus blind to the repo's actual ship path (squash merges)?`, to: `\n\n### 5f.`, with: ` the per-leg answers as of 2026-08-15 are in PROVENANCE (leg4's caveat is now supplied by ratifications ffebbd68 and be6e9d73).` },
  ]},
  { section: 601, name: 'Sourcing SSOT — mechanics', key: '3. **Check the sourcing-engine activation state BEFORE hand-feeding', cuts: [
    { from: `   **(a) The OPERATIVE gate is a DB ROW, not an env flag.**`, to: `   So if the arm is OFF`, with: `   (a)/(b): the operative gate is the \`sourcing_engine_activation_state.arm\` DB row (NO ROW = state unknown, not "off"; the four env flags with zero executable readers are RETIRED and flipping them is a NO-OP), and the four belt producers consult the belt-DEMAND gate — an unreadable gauge is \`unmeasurable\` → WITHHOLD, never a licence to produce.\n`, dest: 'manual' },
    { from: `   So if the arm is OFF, **PROPOSE activation as a CHAIRMAN decision**`, to: `\n4. **Hand-mining`, with: `   If the arm is OFF, PROPOSE activation as a CHAIRMAN decision citing the demand gate; never substitute yourself for a dormant engine tick-after-tick.` },
    { from: `, sourced after TWO 2026-08-30 re-mints of ten-week-old completed work`, to: `): before ANY mint` },
    { from: `   **(a) Predicate 1, non-terminal ("is-anyone-working")**`, to: `\n\n**CLOSE-OUT-FIRST`, with: `   (a) "is-anyone-working" — the existing claim/belt check; (b) "was-this-built" — \`checkAlreadyBuilt()\` (lib/sourcing-engine/manual-precheck.js): ALREADY-BUILT → cite it; re_emit → reconcile+probe-flip the existing SD's gauge, never a parallel rebuild; NOT-FOUND only when genuinely novel. (root-cause note and the amend-SD notice-gap workaround in MANUAL)`, dest: 'manual' },
    { from: ` **The reader predicate you did not write is the authority on the shape**, and an invented shape FAILS SILENTLY`, to: ` *Test:` },
  ]},
  { section: 601, name: 'Chairman SMS channel — elaborations', key: '### 5g. CHAIRMAN SMS CHANNEL DUTY', cuts: [
    { from: ` (oracle ruling f6315dbf folded into SD-LEO-INFRA-PARKED-CHAIRMAN-SMS-001: the parker may never write park-state on that sender class)`, to: `. A chairman free-text` },
    { from: `every SMS-decide is self-contained: terse context → LABELED options (A/B/C, or YES/NO) → Adam's RECOMMENDED option + one-line rationale → explicit reply instruction. **ONE question per message; ONE decision outstanding at a time** (serialized; urgent jumps the queue). DETAILS returns fuller context. Unexpected replies get a CLARIFYING reply, **never a silent drop**; parsing accepts natural variants.`, to: ` **REDUCIBILITY RULE**`, with: `every SMS-decide is self-contained (terse context → LABELED options → RECOMMENDED option + one-line rationale → reply instruction); **ONE question per message; ONE decision outstanding at a time**; unexpected replies get a CLARIFYING reply, **never a silent drop**.`, dest: 'manual' },
    { from: ` (default America/New_York, DST-aware IANA timezone, never a hardcoded UTC offset; resolves to a different zone only when Adam has recorded a captured chairman-location ruling via \`notifications.timezone\` — SD-LEO-INFRA-CHAIRMAN-QUIET-WINDOW-001)`, to: `. During the window`, with: ` (DST-aware IANA zone, never a hardcoded offset; zone-override procedure in MANUAL)`, dest: 'manual' },
    { from: ` ~06:4x ET in-terminal, *"Can you move the hourly text messages to every three hours instead of every one hour?"*, which SUPERSEDES the 2026-07-31 hourly verbal (itself superseding the 2026-07-19 temporary 30-minute override)`, to: `. Scope: the ROUTINE heartbeat only`, with: ` (earlier supersession chain in PROVENANCE)` },
    { from: ` — decision texts still go when ready, the 6:00 AM morning brief (c4) and the 21:30 ET bandwidth forecast are unchanged. Quiet hours 22:00–06:00 ET still apply. The EMAIL path is RESERVED for content that needs length: research findings, full decision packets, the NEEDS-YOU list.`, to: null, with: `; decision texts, the 6:00 AM brief (c4) and the 21:30 ET forecast are unchanged; EMAIL is reserved for content that needs length.` },
  ]},
  { section: 601, name: 'Durable duties — elaborations', key: '### 5i. Durable session-fragile duties', cuts: [
    { from: ` A silent tick still leaves a durable trace — a \`feedback\` row, category \`adam_duty_log\` — reading "no new usage paste since <stamp>", so the daily duty-firing audit can tell fired-quiet from absent (QF-20260905-121, Solomon audit #7 item 2: the duty had NO durable trigger and went dark two nights running before this)`, to: `.\n- **BELT COUNTDOWN`, with: ` A silent tick still writes an \`adam_duty_log\` feedback row so fired-quiet is distinguishable from absent` },
    { from: ` — a known auto-ack bug stamps \`read_at\`/\`acknowledged_at\` on rows Adam never processed`, to: `. **Sweep by` },
    { from: ` — \`acknowledged_at IS NULL\` filtering provably hides chairman/coordinator directives`, to: `.\n- **LIVE STATE` },
    { from: ` Memory files are point-in-time and go stale within hours on an active fleet.`, to: null },
  ]},
  { section: 601, name: 'Plan Check format — the four blocks, tone, mechanics', key: '### 5n. PLAN CHECK — the chairman\'s status-report format', cuts: [
    { from: `1. **What slipped**`, to: `\n\n### 5o.`, with: `The four blocks (what slipped FIRST because it is the only block that cannot flatter; what got done in the last 48h; next 6 hours as L1 "expect to see" / L2 "happening underneath"; committing to the next 48h, 3–5 plan-movers MAX), tone, in-chat extras and mechanics are in MANUAL. Binding here: **"Done" requires a JOIN to \`strategic_directives_v2.status='completed'\` — a roadmap item merely having \`promoted_to_sd_key\` set is NOT done**; facts are DERIVED FROM THE ROADMAP (\`roadmap_waves\` + \`roadmap_wave_items\`), never eyeballed from the task ledger; never manufacture milestones.`, dest: 'manual' },
  ]},
  { section: 601, name: 'Web research — HOW and the ladder', key: '### 5o. Web research & source-escalation', cuts: [
    { from: ` — validating whether our design matches best practice returns the same corpus that SHAPED the design, which is false independence`, to: `; high-confidence settled facts` },
    { from: `**HOW**: prefer PRIMARY sources`, to: `**A consult arriving WITH citations`, with: `**HOW** (primary sources; independence = different ORIGINS, not URLs; time-box; cite; state web-sourced vs internal) and the **SOURCE-ESCALATION LADDER** (on divergence CLASSIFY THE QUESTION FIRST: internal-fact → repo/DB ground truth, NEVER the web; world-fact → web as tiebreaker) are in MANUAL.\n\n`, dest: 'manual' },
    { from: ` Inheriting a cited conclusion imports its errors along with its authority. (Distinct from CONTAMINATION above`, to: null },
  ]},
  { section: 601, name: 'Governance heartbeat — per-scope block, per-idea bar, anchoring', key: '### 5p. Governance heartbeat (multi-scope scan loop)', cuts: [
    { from: `**Per-scope block**: strategy briefing`, to: `**Silence-by-default**`, with: `Per-scope block, per-idea bar and anchoring are in MANUAL. Two rules stay here: EVA-DRAIN triages pending recommendations toward a chairman decision and **NEVER sets status=accepted**; a missing live metric is surfaced as a GAP — **NEVER fabricate a KR.**\n`, dest: 'manual' },
  ]},
  { section: 601, name: 'SD sourcing hard rules — procedure', key: '### 5r. SD sourcing & creation — hard rules', cuts: [
    { from: `These are RULES, not procedure. The field shapes and step-by-step live in the companion\n\`CLAUDE_ADAM_MANUAL.md\`; the obligations below stay here and govern regardless of whether the\nmanual is read.`, to: null, with: `Field shapes and steps: \`CLAUDE_ADAM_MANUAL.md\`; the obligations below govern regardless.` },
    { from: `  board-of-directors verdict 2026-06-16): do **NOT** blindly source`, to: `- **RE-SCOPE PROPOSALS`, with: `  board-of-directors verdict 2026-06-16): classify FIRST — (a) genuine leaf → a Phase-0 design/spec SD; (b) foundation / data-contract → sequence it AHEAD of the builds it gates, never as a parallel tile; (c) already-built but reading low from a STALE/manual KR → a governed KR RE-MEASURE, NOT a new build SD; (d) mis-bucketed → a registry fix. The coordinator must VERIFY the per-capability gauge gap is REAL before dispatching. (procedure in MANUAL)\n\n`, dest: 'manual' },
    { from: ` — an exit predicate\n  is part of a requirement's own definition, and a dependency claim that has not read it has not\n  read the requirement`, to: `. Citation requirement only` },
    { from: ` (QF-20260907-825: two seats independently forwarded`, to: `\n\n### 5s.` },
  ]},
  { section: 602, name: 'Self-score cadence — operating reality and live-enablement blast radius', key: 'Each dimension carries', cuts: [
    { from: `**Self-score cadence — the operating reality**`, to: null, with: `**Self-score cadence**: scoring runs every ~6h via \`--force\` (the chairman-directed operating path, not a workaround; the staleness gauge trips at 8h); \`leo_feature_flags\` is a GAUGE for this flag, not a GATE (the writer reads \`process.env\` only); live enablement is its own change through SD-LEO-INFRA-ENABLE-TRI-PARTY-001 (currently CANCELLED) — flip the writers and the staleness gauges together or neither. (full mechanics in MANUAL)`, dest: 'manual' },
    { from: `> **If live enablement is genuinely wanted**`, to: null, dest: 'manual' },
  ]},
  { section: 614, name: 'Crew-comms routing — the five bounding rules', key: 'Adam operates under the canonical crew-comms routing protocol', cuts: [
    { from: ` It defines the 5 bounding rules`, to: ` See \`docs/protocol/coordinator-adam-comms.md\``, with: ` (the five bounding rules are summarised in MANUAL)`, dest: 'manual' },
  ]},
];

const MOVES = [...MOVES_5S, ...MOVES_OTHER];

async function fetchContent(id) {
  const { data, error } = await supabase.from('leo_protocol_sections').select('content').eq('id', id).single();
  if (error) throw new Error(`fetch id=${id}: ${error.message}`);
  return data.content;
}

async function updateContent(id, content) {
  const { error } = await supabase.from('leo_protocol_sections').update({ content }).eq('id', id);
  if (error) throw new Error(`update id=${id}: ${error.message}`);
}

async function fetchMarkers() {
  const { data, error } = await supabase.from('chairman_ratifications').select('id, marker_text, encoded_ref').not('marker_text', 'is', null);
  if (error) throw new Error(`fetch markers: ${error.message}`);
  return data.filter((r) => String(r.encoded_ref?.section_id) === MARKER_SECTION_ID).map((r) => ({ id: r.id, marker: r.marker_text.trim() }));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const before = {};
  for (const id of [...MAIN_IDS, ...Object.values(COMPANION_IDS)]) before[id] = await fetchContent(id);
  const after = { ...before };
  const companions = { manual: before[COMPANION_IDS.manual], provenance: before[COMPANION_IDS.provenance] };
  const carved = applyMoves(after, MOVES, companions, TAG);
  Object.assign(after, carved.contents);
  const { applied, skipped } = carved;
  after[COMPANION_IDS.manual] = carved.companions.manual;
  after[COMPANION_IDS.provenance] = carved.companions.provenance;

  // FAIL CLOSED: every marker present before the carve must still be present in the main contract row.
  const markers = await fetchMarkers();
  const lost = markers.filter((m) => before[601].includes(m.marker) && !after[601].includes(m.marker));
  const presentBefore = markers.filter((m) => before[601].includes(m.marker)).length;
  const presentAfter = markers.filter((m) => after[601].includes(m.marker)).length;
  console.log(`markers (section 601): total=${markers.length} present-before=${presentBefore} present-after=${presentAfter} lost=${lost.length}`);
  if (lost.length) {
    for (const m of lost) console.log(`  LOST ${m.id.slice(0, 8)} ${m.marker.slice(0, 90)}`);
    throw new Error('MARKER REGRESSION — refusing to write.');
  }

  const bytes = (s) => Buffer.byteLength(s, 'utf8');
  const mainBefore = MAIN_IDS.reduce((n, id) => n + bytes(before[id]), 0);
  const mainAfter = MAIN_IDS.reduce((n, id) => n + bytes(after[id]), 0);
  console.log(`applied=${applied.length} skipped(already)=${skipped.length}`);
  if (applied.length && applied.length < MOVES.length) console.log('  re-applied:', applied.join(' | '));
  for (const id of MAIN_IDS) console.log(`  id=${id} ${bytes(before[id])} -> ${bytes(after[id])} bytes`);
  for (const [k, id] of Object.entries(COMPANION_IDS)) console.log(`  ${k} id=${id} ${bytes(before[id])} -> ${bytes(after[id])} bytes`);
  console.log(`main rows: ${mainBefore} -> ${mainAfter} bytes (freed ${mainBefore - mainAfter}); ~${Math.round(mainAfter / 2.4177)} tokens of section content before file header/titles`);

  const outDir = path.resolve('.artifacts');
  fs.mkdirSync(outDir, { recursive: true });
  for (const id of Object.keys(after)) fs.writeFileSync(path.join(outDir, `adam-after-${id}.md`), after[id]);
  console.log('previews written to .artifacts/adam-after-<id>.md');

  if (!apply) { console.log('DRY RUN — pass --apply to write the DB rows.'); return; }
  if (applied.length === 0) { console.log('No changes to apply (idempotent no-op).'); return; }
  for (const id of Object.keys(after)) if (after[id] !== before[id]) await updateContent(Number(id), after[id]);
  console.log('DB updated:', Object.keys(after).filter((id) => after[id] !== before[id]).map((id) => `id=${id}`).join(', '));
}

if (isMainModule(import.meta.url)) {
  main().catch((e) => { console.error('FATAL', e.message || e); process.exitCode = 1; });
}

export { MOVES, TAG };
