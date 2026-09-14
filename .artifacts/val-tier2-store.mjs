import 'dotenv/config';
import { resolveSubAgentRepo, applySubAgentRepoVerdict } from '../lib/sub-agents/resolve-repo.js';
import { storeSubAgentResults } from '../lib/sub-agent-executor/results-storage.js';

const SD_KEY = 'SD-LEO-INFRA-MICHAEL-TIER2-CHECKPOINT-SEND-001';
const SD_ID = '1cc34ee9-0eaf-4edb-817d-f6062173c5d2';

const findings = [
  {
    id: 'V-1', severity: 'CRITICAL', gate: 'GATE 1 / scope-boundary',
    title: 'The authorizing ratification 561878ae is UNENCODED; the live Michael contract still says this build is not authorized',
    evidence: 'chairman_ratifications row 561878ae-9c24-48d8-944f-8af1ba0c37b4 (ratified 2026-09-13T23:10:12Z, target_contracts ["adam","michael"], scribe_seat adam-49eabb23) has encoded_at=NULL and encoded_ref=NULL. Its predecessor b9d3607e IS encoded (encoded_ref section_id=601) and its encoded text at CLAUDE_MICHAEL.md:127 ends: "Neither tier is built or scheduled and this clause authorises no build." grep for 561878ae in CLAUDE_MICHAEL.md returns 0 hits; b9d3607e returns 1.',
    impact: 'CLAUDE_MICHAEL.md is read IN FULL at every /michael startup and BINDS. A seat or gate reading the contract today finds the opposite of the SD scope. The SD authority is real (ledger row verified) but the binding contract text has not caught up.',
    action: 'Single-scribe encode of 561878ae into michael_role_contract (and adam_role_contract) before or alongside EXEC. The scribe is the Adam seat (scribe_seat=adam-49eabb23), not the building worker. Track as an explicit cross-seat dependency in the LEAD-TO-PLAN handoff.'
  },
  {
    id: 'V-2', severity: 'HIGH', gate: 'GATE 1 / scope-boundary',
    title: 'The section-4 carve-out is under-scoped: three other contract sites assert the flat no-send rule and the ratification amends only section 4',
    evidence: 'CLAUDE_MICHAEL.md:61 (S4) "Michael NEVER sends SMS or email" is the site the carve-out names. But also: CLAUDE_MICHAEL.md:36 (S1 duty index) "never claim, never dispatch, never send ... (S4)"; CLAUDE_MICHAEL.md:56 (S3 DISTRACTION MANAGEMENT DUTY) "Michael has no heartbeat, no SMS cadence and no proactive pings. Success: the chairman morning has one conversation, one brief, and no second channel."; and CLAUDE_MICHAEL.md:62 (S4) "every mutation goes through the verb scripts (gmail-act, todoist-act, rule-encode, closure-add, capture, feedback-append)" - a CLOSED enumeration the new send verb is not in. The b9d3607e clause at :127 says "nothing else in section 4 changes" and never mentions section 3 or the duty index.',
    impact: 'A four-times-daily checkpoint IS an SMS cadence, IS a proactive ping, and IS a second channel - the exact three things S3 names as the success criterion of the distraction duty. Shipping without an encode leaves the contract self-contradictory at three sites, and S3 is worded as a SUCCESS CRITERION rather than a boundary, so no gate will catch it.',
    action: 'PLAN must enumerate all four encode sites (CLAUDE_MICHAEL.md :36, :56, :61, :62) in the PRD, not just section 4. The verb-script enumeration at :62 is mandatory - omitting it makes the new verb a contract violation by construction.'
  },
  {
    id: 'V-3', severity: 'HIGH', gate: 'GATE 2 / infrastructure',
    title: 'The shared Michael read seam is permissive by design in exactly the direction FR-1 and FR-5 require fail-closed',
    evidence: 'lib/michael/db.mjs:43-58 readRows() returns { rows: [], tables_absent: true } on a missing relation (:50) and { rows: [], tables_absent: false, error } on ANY other error (:51, :56). It never throws and always returns an empty array. Its own header at :6-8 states the design intent: "a missing relation is no source, never a failure". scripts/michael/autonomy-read.mjs:98 acts on that intent - tables_absent returns { ok: true }.',
    impact: 'FR-1 reads a same-day ledger to count sends. A failed read yields rows:[] which reads as "0 sends today", the cap is satisfied, and the verb SENDS. That is fail-OPEN on the single most important control. FR-5 (enable row) happens to fail closed by luck (empty means no enabled row, which is falsy), but only if the predicate is written positively.',
    action: 'The compensation already exists and must be mandated in the PRD: scripts/michael/todoist-act.mjs:76-77 checks BOTH preflight.tables_absent -> refusal(TABLES_ABSENT) AND preflight.error -> refusal(READ_FAILED) before the external call. No lint enforces this. Make "both branches checked before the provider call, for BOTH the cap read and the enable read" an explicit, test-asserted acceptance criterion.'
  },
  {
    id: 'V-4', severity: 'HIGH', gate: 'GATE 2 / infrastructure',
    title: 'leo_feature_flags is the WRONG mechanism for FR-5 - its reader caches for 30s and fails OPEN on a read error',
    evidence: 'lib/feature-flags/evaluator.js:22 CACHE_TTL_MS = 30*1000; :65-69 refreshCacheIfNeeded early-returns inside the TTL; :80-89 the flags read is wrapped in catch { flags = null } with the comment "fail-open: keep the existing cache on read failure"; :102 stamps lastCacheRefresh EVEN WHEN THE READ FAILED, so a degraded DB serves a stale is_enabled=true for another 30s. The kill-switch read has the same shape at :92-100.',
    impact: 'Directly contradicts FR-5 ("read FRESH at every send, failing closed on a read error"). Separately, CLAUDE.md rule 12 binds three flags in that table to chairman ratification b75ddfff, making it governance-heavy for what FR-5 wants to be a lightweight operator row flip.',
    action: 'Do NOT use leo_feature_flags for FR-5. Reuse the shape at lib/chairman/sms-decision-whitelist.js:32-54 instead: no cache, fresh select per call, fail-closed on both branches (:47 "if (error || !data || data.length === 0) return false", :50 "catch { return false }"). Note that chairman_switchon_policy (database/migrations/20260718_chairman_switchon_policy_STAGED.sql:11) was written as the GENERALIZATION of exactly that shape and is staged-unapplied - PLAN should decide reuse-vs-Michael-local explicitly rather than by default.'
  },
  {
    id: 'V-5', severity: 'MEDIUM', gate: 'GATE 2 / infrastructure',
    title: 'michael_rules.auto_apply is the closest existing per-verb toggle but is NOT a valid FR-5 mechanism - revocation requires an Opus-verifier artifact',
    evidence: 'database/migrations/20260906_michael_tables.sql:58-65 gives michael_rules auto_apply + auto_apply_verb with DB CHECK constraints, read fresh and fail-closed at scripts/michael/gmail-triage.mjs:214-215. BUT scripts/michael/rule-encode.mjs:61-66 needsVerifier() returns true when "prior && prior.status === active" - turning an ACTIVE rule OFF also demands a runner-produced Opus verdict file (hash-bound, max 24h old; verifyVerdict at :72-84).',
    impact: 'FR-5 requires that revocation be a row flip. Routing the send toggle through michael_rules would make revocation require an Opus verdict artifact - slower and more failure-prone than the capability it revokes.',
    action: 'Use a dedicated lightweight Michael enable row (fresh + fail-closed per V-4), not michael_rules.auto_apply. State the rejection and its reason in the PRD so a later reader does not helpfully consolidate them.'
  },
  {
    id: 'V-6', severity: 'HIGH', gate: 'GATE 2 / FR-3 feasibility',
    title: 'FR-3: extend the shared provider with an additive optional identity parameter; do NOT write a parallel Michael transport module',
    evidence: 'Real importers of lib/messaging/providers/twilio-provider.js are exactly THREE: api/webhooks/twilio-sms.js:18, lib/chairman/sms-bridge.js:26, lib/chairman/sms-outbound-worker.js:81 - all default-imports. An OPTIONAL added parameter changes zero call sites, and there is direct in-file precedent: twilio-provider.js:65-67 added mediaUrl additively for SD-LEO-INFRA-CHAIRMAN-DAILY-REVIEW-DOC-001-D. A parallel module lands OUTSIDE two live guards: scripts/lint/transport-test-isolation-guard-lint.mjs:47-50 GUARDED_FILES is a frozen two-entry list and :52 TRANSPORT_IMPORT_RE only matches resend-adapter|twilio-provider, so a new module would not be required to call shouldRefuseRealSend() and its tests would be exempt from the fetch-mock isolation requirement; tests/unit/outbound-sink-conformance.test.js:70-74 TRANSPORT_TARGETS lists only three emitters, so a fourth would be invisible to the chairman-reaching-sink census. scripts/one-off/prd-content-sms-delivery-truth-001-a.json:70 already states the standing rule: "Avoid a second, divergent Twilio integration surface".',
    impact: 'The parallel-module option optimizes for zero call-site churn - a non-problem, since the churn is zero either way with an optional parameter - and pays for it by exiting every guard that watches chairman-reaching sends.',
    action: 'RECOMMEND: send({ to, body, mediaUrl, identity }). When identity is supplied, read sid/token/messagingService ONLY from it and NEVER fall back to process.env - the exact discipline lib/marketing/channel-secrets.js:53-58 already implements ("fall back to dry-run/block, never to a shared default"). Michael passes MICHAEL_TWILIO_* values, matching the existing MICHAEL_ENCRYPTION_KEY namespace; Adam passes nothing and keeps reading TWILIO_* at twilio-provider.js:18-20 unchanged. Revoking Michael then means rotating MICHAEL_TWILIO_AUTH_TOKEN or flipping the enable row, with zero effect on Adam. OPEN QUESTION for PLAN: checkMessageStatus() at :94-99 also reads the process-global credentials - decide whether Michael needs delivery reconciliation at all (recommend no; it is outside the authorized scope).'
  },
  {
    id: 'V-7', severity: 'HIGH', gate: 'GATE 2 / infrastructure',
    title: 'The new sink will be born INVISIBLE to the only census that watches chairman-reaching sinks',
    evidence: 'tests/unit/outbound-sink-conformance.test.js:52-58 DISCOVERY_ROOTS = lib/comms, lib/chairman, lib/notifications, lib/adam, lib/messaging, lib/coordinator/adam-outbound-gate.js. :60-67 ADDITIONAL_SCOPE names six explicit out-of-root paths, three of them scripts/adam-*.mjs. NEITHER list contains scripts/michael or lib/michael.',
    impact: 'A verb at scripts/michael/*.mjs is structurally outside the census regardless of which FR-3 option is chosen. That census is the control built specifically so that "a protective check wired at the leaf-caller layer is absent-by-default on every chairman-reaching sink added afterward" becomes visible (test header :4-6). Shipping outside it recreates the exact defect class the control exists to catch.',
    action: 'Add the new verb path to ADDITIONAL_SCOPE in the SAME PR, with a reason string, exactly as scripts/adam-decision-email.mjs and siblings were added. Do NOT add it to NOT_A_SINK - it is a genuine sink. If it cannot inherit lib/adam/should-consult-solomon.js (CONSULT_GATE, :76), it must be seeded into KNOWN_DEBT with a linked_ref and KNOWN_DEBT_CEILING at :118 raised - and the file says "Never raise this", so raising it is a deliberate reviewable decision PLAN must make explicitly rather than discover at merge time.'
  },
  {
    id: 'V-8', severity: 'MEDIUM', gate: 'GATE 2 / FR-2 feasibility',
    title: 'FR-2 "recipient never from an environment override" has no precedent and collides with keeping the chairman number out of git',
    evidence: 'Every production recipient resolution in the repo reads process.env.CHAIRMAN_PHONE - eight production sites, including lib/comms/adam-outbound/chairman-sms-gate/index.js:144 "message.recipientPhone || process.env.CHAIRMAN_PHONE || null", the exact caller-first/env-fallback shape FR-2 names as the anti-pattern (repeated at :423, :566, :640). git grep for a literal E.164 across lib, scripts and api returns ONLY 555-placeholder test fixtures under lib/chairman/__tests__/. The real number is nowhere in the repo.',
    impact: 'Taken literally, FR-2 forces a first-of-kind decision: hardcode chairman PII in git, or accept an env read and lose the immutability property.',
    action: 'Recommend a hash-pin rather than a literal: hardcode sha256(expected E.164) as a module constant and refuse the send when sha256(resolved recipient) does not match. That satisfies FR-2 in substance - no parameter, row or env value can redirect WHO receives it, because a mismatch refuses - without putting PII in git, and it reuses the existing sha256Hex primitive at lib/michael/db.mjs:89. Flag as a PLAN decision, not an EXEC judgment call.'
  },
  {
    id: 'V-9', severity: 'MEDIUM', gate: 'GATE 2 / requirements hygiene',
    title: 'metadata.functional_requirements is a lossy mechanical split of the scope prose - FR-8 has swallowed the entire out-of-scope and exit-predicate text',
    evidence: 'Every FR title is truncated at roughly 118 characters with the remainder in description (FR-1 title ends "...if that read" and its description begins "fails; a schedule that fires..."). FR-7 has no description at all. FR-8 description contains the FULL remaining scope text: the SHOULD, the chairman-gated dependency, OUT OF SCOPE, PRIORITY, EXIT PREDICATE, PROPOSE-ONLY ORIGIN, plus a verbatim duplicate of the entire scope preamble.',
    impact: 'A PRD generator or gate reading metadata.functional_requirements verbatim will encode "OUT OF SCOPE: ..." and "EXIT PREDICATE: ..." as an FR-8 requirement, and will read every FR title as a truncated sentence fragment.',
    action: 'PLAN must derive the PRD from strategic_directives_v2.scope, which is the authoritative prose, re-authoring FR-1 through FR-8 as clean discrete requirements, and should rewrite metadata.functional_requirements to match rather than leaving the lossy split in place.'
  }
];

const results = {
  verdict: 'CONDITIONAL_PASS',
  confidence: 88,
  summary: 'No duplicate: the capability is a genuine absence and no SD or QF delivers it or should absorb it. Authorization is real (ratification 561878ae verified in chairman_ratifications) but UNENCODED - the live binding Michael contract still reads that this build is unauthorized, and the flat no-send rule lives at four contract sites while the carve-out names only one. Two MUST controls (FR-1 cap, FR-5 enable row) sit directly on top of a shared read seam that is permissive by documented design; the compensating pattern exists at todoist-act.mjs:76-77 but nothing enforces it. leo_feature_flags is disqualified for FR-5 (30s cache, fail-open on read error). For FR-3 the additive identity parameter on the shared provider is strictly safer than a parallel module, which would exit both the transport-isolation lint and the chairman-sink census. Separately, the verb is born outside that census regardless of the FR-3 choice, and FR-2 as written has no precedent in this repo.',
  findings,
  recommendations: [
    'GATE 1 verdict: PASS on duplicate/overlap - proceed to PLAN. No blocking duplicate exists.',
    'Carry V-1 (unencoded ratification) into the LEAD-TO-PLAN handoff as a named cross-seat dependency on the Adam scribe seat, alongside the already-named chairman keystroke for credential provisioning.',
    'PRD must name all four contract encode sites (CLAUDE_MICHAEL.md :36, :56, :61, :62), not just section 4.',
    'PRD must make the two-branch fail-closed read (tables_absent AND error) a test-asserted acceptance criterion for both the cap read and the enable read.',
    'PRD must decide, not defer: the recipient pin mechanism (V-8, hash-pin recommended), the FR-5 toggle home (Michael-local row vs chairman_switchon_policy), and outbound-sink census registration (V-7, including whether KNOWN_DEBT_CEILING moves).',
    'Re-author metadata.functional_requirements from the scope prose before PRD generation (V-9).'
  ],
  metadata: {
    phase: 'LEAD',
    gate: 'LEAD-TO-PLAN',
    checks_performed: [
      'strategic_directives_v2 scan: 39 SDs matching MICHAEL, 25 with send+sms in description, 24 with twilio - none deliver a Michael-seat sender',
      'quick_fixes scan: 13 michael/checkpoint rows, 3 open - none overlap; the open Tier-1 writer QF (2026-09-13T23:20Z) is the complement this SD explicitly puts out of scope',
      'dedup_match_sd_key SD-LEO-INFRA-HANDOFF-DRY-RUN-001 independently re-checked: unrelated, completed, embedding false positive',
      'chairman_ratifications 561878ae and b9d3607e verified by id-prefix scan over 119 rows',
      'twilio-provider.js importer census via git grep: three production importers',
      'transport-test-isolation-guard-lint GUARDED_FILES and outbound-sink-conformance DISCOVERY_ROOTS / TRANSPORT_TARGETS / KNOWN_DEBT read directly',
      'fleet-wide enable/disable toggle survey: leo_feature_flags, leo_kill_switches, app_config, sms_decision_class_whitelist, chairman_switchon_policy, michael_rules.auto_apply, factory_guardrail_state, venture_channel_autonomy'
    ],
    duplicate_check: 'PASS - no duplicate and no absorbable in-flight work item',
    backlog_note: 'SD carries 8 functional requirements in metadata; see V-9 for their quality'
  }
};

const resolution = await resolveSubAgentRepo({
  sdId: SD_ID,
  targetApplication: 'EHG_Engineer',
  subAgentCode: 'VALIDATION',
  probeExistsRelative: 'lib/michael/db.mjs'
});
applySubAgentRepoVerdict(results, resolution);
const stored = await storeSubAgentResults('VALIDATION', SD_ID, { id: null, name: 'Principal Systems Analyst' }, results, { sdKey: SD_KEY });
console.log('RESOLUTION:', JSON.stringify(resolution));
console.log('STORED:', JSON.stringify(stored).slice(0, 500));
