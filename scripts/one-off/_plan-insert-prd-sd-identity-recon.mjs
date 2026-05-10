// PLAN-PHASE-INLINE-MODE PRD insert for SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const sdId = '5f2e9df3-02f4-449f-baa9-91b8f19b6f71';
const sdKey = 'SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001';
const prdId = `PRD-${sdKey}`;
const sessionShort = '4582eae5';

const functional_requirements = [
  {
    id: 'FR-1',
    title: 'Wire reconcileAtBoot into SessionStart hook',
    priority: 'high',
    description: 'In scripts/hooks/session-start.cjs, after upsertSessionRow() resolves, invoke `import("../../lib/session-identity-sot.js").reconcileAtBoot(sessionId)`. The dynamic-import is required because session-start.cjs is CJS and session-identity-sot.js is ESM. Gate the call behind `process.env.SESSION_IDENTITY_SOT_ENABLED === "true"`. When the flag is off, log a single line `[session-start] reconcile.skipped reason=flag_off` and return. When on and reconcile succeeds, log `[session-start] reconcile.applied env=<id> current=<id> session_id=<id>`. When on and reconcile throws, catch the error, log `[session-start] reconcile.failed reason=<msg>`, and DO NOT abort the hook (SessionStart must always exit 0 to avoid bricking new sessions).',
    acceptance_criteria: [
      'AC-1.1: With SESSION_IDENTITY_SOT_ENABLED unset or "false", running scripts/hooks/session-start.cjs against a fresh worktree produces stderr line `reconcile.skipped reason=flag_off` exactly once and exits 0.',
      'AC-1.2: With SESSION_IDENTITY_SOT_ENABLED="true" against a worktree where env CLAUDE_SESSION_ID, .claude/session-identity/current, and the most-recent claude_sessions row all agree, the hook produces stderr line `reconcile.applied` and exits 0.',
      'AC-1.3: With SESSION_IDENTITY_SOT_ENABLED="true" against a worktree with 3-marker drift (env != current != session-id.txt), the hook calls reconcileAtBoot which writes the canonical (most-recent identity-marker mtime) back to env + current + claude_sessions. stderr shows `reconcile.applied env=<canonical> current=<canonical>` and post-state inspection confirms all 3 markers now agree.',
      'AC-1.4: When reconcileAtBoot is mocked to throw, the hook still exits 0 with stderr line `reconcile.failed reason=<thrown-message>`.',
    ],
  },
  {
    id: 'FR-2',
    title: 'IDENTITY_DRIFT_OVERRIDE escape hatch in lib/claim-validity-gate.js',
    priority: 'high',
    description: 'Add an escape hatch to lib/claim-validity-gate.js::assertValidClaim. When `process.env.IDENTITY_DRIFT_OVERRIDE` is a non-empty string (the reason text), AND the only failure surfaced by the gate is a session-identity drift (`reason === "session_identity_drift"` from session-identity-sot.js::validateSourcesAgree), THEN: (a) write a row to audit_log with action="identity_drift_override", actor=<session_id>, reason=<env value>, severity="warning"; (b) check audit_log for prior identity_drift_override rows in last 24h — if count >= 3, throw RateLimitError with message "IDENTITY_DRIFT_OVERRIDE rate-limited: 3 uses per 24h"; (c) emit telemetry event identity.override.applied; (d) return PASS verdict instead of throwing ClaimIdentityError. The override MUST NOT bypass other claim failures (foreign_claim, missing claim, etc.) — it is identity-drift-specific.',
    acceptance_criteria: [
      'AC-2.1: Without IDENTITY_DRIFT_OVERRIDE set, an identity-drift case throws ClaimIdentityError (existing behavior unchanged).',
      'AC-2.2: With IDENTITY_DRIFT_OVERRIDE="testing-mid-session-recovery", an identity-drift case returns PASS, an audit_log row is inserted with action=identity_drift_override and reason=testing-mid-session-recovery, and the gate emits telemetry identity.override.applied.',
      'AC-2.3: 4 invocations within 24h all with IDENTITY_DRIFT_OVERRIDE set — first 3 succeed, 4th throws RateLimitError. Verified via mocked Date.now and audit_log count query.',
      'AC-2.4: With IDENTITY_DRIFT_OVERRIDE set BUT the gate failure reason is foreign_claim (not identity drift), the override does NOT apply: gate still throws the original error and no audit_log row is written.',
    ],
  },
  {
    id: 'FR-3',
    title: 'stale-session-sweep terminal_id parser handles 3 formats',
    priority: 'medium',
    description: 'In scripts/stale-session-sweep.cjs, replace the existing terminal_id parser at lines 438-445 (which currently does last-segment-of-hyphen-split) with an explicit dispatch on terminal_id format: (1) `^win-cc-\\d+-\\d+$` (win-cc-PORT-PID) → take last `-`-delimited segment as PID; (2) `^win-\\d+$` (win-PID) → take last segment as PID; (3) any other shape (UUID etc.) → resolve PID via reading .claude/session-identity/pid-*.json files, parsing the `cc_pid` field, and matching by session_id. Returns null if no match found (sweep treats null as "cannot determine PID, skip").',
    acceptance_criteria: [
      'AC-3.1: Vitest fixture `terminal_id="win-cc-13596-22408"` returns PID=22408.',
      'AC-3.2: Vitest fixture `terminal_id="win-13596"` returns PID=13596.',
      'AC-3.3: Vitest fixture `terminal_id="<uuid>"` with corresponding .claude/session-identity/pid-12345.json containing `{cc_pid: 12345, session_id: "<uuid>"}` returns PID=12345.',
      'AC-3.4: Vitest fixture `terminal_id="<unknown>"` with no matching pid-*.json returns null and the sweep skips that row instead of throwing.',
    ],
  },
  {
    id: 'FR-4',
    title: 'capture-session-id deletes all dead pid markers immediately',
    priority: 'medium',
    description: 'In scripts/hooks/capture-session-id.cjs at lines 479-495, change the cleanup line `dead.slice(3)` (which retained the 3 most recent dead markers as a debug aid) to `dead.slice(0)` (delete all dead markers immediately). The retained markers were the artifact that defeated identity-reconciliation in the 824a4401 phantom-active-session incident.',
    acceptance_criteria: [
      'AC-4.1: Vitest: simulate 5 dead pid-*.json markers (mtime > 1h ago, no matching live session_id), invoke the cleanup pass, verify 0 markers remain.',
      'AC-4.2: Vitest: simulate 3 live markers (matching active claude_sessions rows) + 5 dead markers, invoke cleanup, verify only the 3 live markers remain.',
      'AC-4.3: Static guard test: grep capture-session-id.cjs for `dead.slice(3)` — must return 0 matches.',
    ],
  },
  {
    id: 'FR-5',
    title: 'Vitest regression coverage for FR-1 through FR-4',
    priority: 'high',
    description: 'Add vitest test files: tests/unit/session-start-hook-reconcile.test.js (FR-1, 4 cases), tests/unit/claim-validity-gate-identity-override.test.js (FR-2, 4 cases), tests/unit/stale-session-sweep-terminal-parser.test.js (FR-3, 4 cases), tests/unit/capture-session-id-cleanup.test.js (FR-4, 3 cases). Total ~15 new tests targeting the 4 functional requirements. Mocks: Supabase audit_log insert/select, fs.readdir/stat for pid-*.json fixtures, dynamic-import of lib/session-identity-sot.js. Pre-existing lib/eva + claim-validity-gate test suites must pass unchanged after the PR.',
    acceptance_criteria: [
      'AC-5.1: All 15 new tests pass on `npx vitest run tests/unit/session-start-hook-reconcile.test.js tests/unit/claim-validity-gate-identity-override.test.js tests/unit/stale-session-sweep-terminal-parser.test.js tests/unit/capture-session-id-cleanup.test.js`.',
      'AC-5.2: `npx vitest run lib/eva` shows 0 regressions vs. pre-PR baseline (capture pre-PR pass count and assert post-PR equals it).',
      'AC-5.3: `npx vitest run tests/unit/claim-validity-gate*` shows 0 regressions in pre-existing claim-validity-gate test files.',
    ],
  },
];

const technical_requirements = [
  {
    id: 'TR-1',
    title: 'Reuse lib/session-identity-sot.js (no duplicate module)',
    rationale: 'Validation-agent (db7da07f) found this 522-LOC module already implements readAllSources, validateSourcesAgree, reconcileAtBoot, atomicWrite, acquireLock — all primitives the original SD proposed building. Building a duplicate violates Q5 (existing tools) and explodes the PR by ~390 LOC for zero added value. The only consumer-side gap is that scripts/hooks/session-start.cjs never calls reconcileAtBoot.',
    description: 'No new file lib/session-identity-reconcile.mjs. All FR-1 wiring uses dynamic-import of the existing lib/session-identity-sot.js. The dynamic-import shape is `await import("../../lib/session-identity-sot.js").then(m => m.reconcileAtBoot(sessionId))`. The CJS→ESM bridge is required because session-start.cjs is CommonJS.',
  },
  {
    id: 'TR-2',
    title: 'Flag-OFF default — staged 2-PR rollout',
    rationale: 'Risk-agent (5a499f93) identified that flipping SESSION_IDENTITY_SOT_ENABLED=true mid-flight throws ClaimIdentityError for any of the 3 currently-active CC sessions whose markers do not agree. Forcing reconciliation default-on without an active-session precheck would brick those sessions.',
    description: 'PR-A (this SD) ships all FR-1 through FR-5 plumbing with SESSION_IDENTITY_SOT_ENABLED unchanged (still default-OFF in .env). PR-B (a follow-up SD, to be filed at retrospective) flips the default after a 24-48h burn-in and a precheck script that runs validateSourcesAgree() against every status=active claude_sessions row and aborts the flip if any session has unreconciled markers.',
  },
  {
    id: 'TR-3',
    title: 'Zero-impact when flag OFF',
    rationale: 'Default-OFF means this PR must not change observable behavior of any LEO process script or hook. Any side-effect (telemetry, log line, DB write) that fires regardless of flag is a regression risk.',
    description: 'FR-1 short-circuits when flag is OFF — the only stderr line is `reconcile.skipped reason=flag_off`. FR-2 short-circuits when IDENTITY_DRIFT_OVERRIDE env-var is unset. FR-3 and FR-4 always run (they are independent RCA fixes, not gated). The audit_log table must already exist (verified via SELECT 1 FROM audit_log LIMIT 1 in EXEC pre-flight).',
  },
  {
    id: 'TR-4',
    title: 'Audit-log + rate-limit primitives',
    rationale: 'IDENTITY_DRIFT_OVERRIDE must be auditable and rate-limited so an operator cannot silently keep a broken session running past the point of safe recovery.',
    description: 'Use existing audit_log table (action, actor, reason, severity, created_at). Rate-limit query: `SELECT count(*) FROM audit_log WHERE action="identity_drift_override" AND actor=<session_id> AND created_at > now() - interval "24 hours"`. If count >= 3, throw RateLimitError. The rate-limit is per-session, not global — different sessions in genuine recovery do not block each other.',
  },
];

const test_scenarios = [
  { id: 'TS-1', test_type: 'unit', given: 'SESSION_IDENTITY_SOT_ENABLED unset; CC session starts; SessionStart hook runs', when: 'capture-session-id.cjs and session-start.cjs both execute', then: 'stderr contains exactly one line `reconcile.skipped reason=flag_off`; reconcileAtBoot is never called; hook exits 0', scenario: 'FR-1 happy path: flag-off is no-op' },
  { id: 'TS-2', test_type: 'unit', given: 'SESSION_IDENTITY_SOT_ENABLED=true; env CLAUDE_SESSION_ID=a, .claude/session-identity/current=b, claude_sessions row session_id=c (3-marker drift)', when: 'session-start.cjs runs', then: 'reconcileAtBoot is called once; stderr shows `reconcile.applied`; post-state: env, current, and claude_sessions row all agree on the most-recent-identity-marker UUID', scenario: 'FR-1 3-marker drift: reconcile resolves' },
  { id: 'TS-3', test_type: 'unit', given: 'IDENTITY_DRIFT_OVERRIDE set to "test-recovery"; gate failure reason=session_identity_drift', when: 'assertValidClaim is called', then: 'gate returns PASS (no throw); audit_log gets new row {action:"identity_drift_override", actor:<sessionId>, reason:"test-recovery"}; telemetry event identity.override.applied is emitted', scenario: 'FR-2 happy path: override applies on identity drift' },
  { id: 'TS-4', test_type: 'unit', given: 'IDENTITY_DRIFT_OVERRIDE set; 3 prior audit_log rows exist for current session within 24h', when: 'assertValidClaim is called', then: 'RateLimitError is thrown with message containing "rate-limited"; no audit_log row is written for this attempt', scenario: 'FR-2 rate-limit: 4th use within 24h blocked' },
  { id: 'TS-5', test_type: 'unit', given: 'IDENTITY_DRIFT_OVERRIDE set; gate failure reason=foreign_claim (not identity drift)', when: 'assertValidClaim is called', then: 'original ClaimIdentityError is thrown unchanged; audit_log unchanged; override does not apply', scenario: 'FR-2 narrow scope: override is identity-drift-only' },
  { id: 'TS-6', test_type: 'unit', given: 'pid-13596.json exists with cc_pid=22408 and session_id=<uuid>', when: 'sweep terminal_id parser is called with `terminal_id=<uuid>`', then: 'parser returns 22408', scenario: 'FR-3 UUID-format: pid-marker fallback' },
  { id: 'TS-7', test_type: 'unit', given: '5 dead pid-*.json markers + 3 live markers in .claude/session-identity/', when: 'capture-session-id.cjs cleanup pass runs', then: '5 dead markers deleted; 3 live markers retained', scenario: 'FR-4 cleanup: dead.slice(0) behavior' },
  { id: 'TS-8', test_type: 'integration', given: 'flag OFF; full LEO handoff workflow LEAD-TO-PLAN against a mock SD', when: 'handoff.js execute is invoked', then: 'no telemetry/log noise from FR-1; handoff passes at unchanged score; existing path unchanged', scenario: 'Zero-impact when flag OFF' },
];

const acceptance_criteria = [
  ...functional_requirements.flatMap(fr => (fr.acceptance_criteria || []).map(criterion => ({ requirement_id: fr.id, criterion }))),
  { requirement_id: 'NFR-1', criterion: 'PR LOC ≤120 in source files (lib/claim-validity-gate.js + scripts/hooks/session-start.cjs + scripts/stale-session-sweep.cjs + scripts/hooks/capture-session-id.cjs combined). PR LOC ≤200 in test files.' },
  { requirement_id: 'NFR-2', criterion: 'Zero regressions: pre-existing lib/eva + claim-validity-gate test pass-counts unchanged after the PR (captured at EXEC pre-flight, asserted at PLAN-VERIFY).' },
  { requirement_id: 'NFR-3', criterion: 'Smoke test (smoke_test_steps in SD) runs green at EXEC-COMPLETE.' },
];

const risks = [
  { id: 'R-1', risk: 'Flag flip in follow-up SD bricks one of the 3 currently-active CC sessions whose markers disagree', impact: 'HIGH', probability: 'MEDIUM', mitigation: 'PR-B (deferred follow-up SD) MUST run a precheck script that calls validateSourcesAgree() against every status=active claude_sessions row and aborts the flip if any session is unreconciled. The precheck is documented in metadata.lead_decision.deferred_followup_sd_premise.', rollback_plan: 'Single-line revert: set SESSION_IDENTITY_SOT_ENABLED=false in .env. No DB to unwind.' },
  { id: 'R-2', risk: 'IDENTITY_DRIFT_OVERRIDE used as a permanent workaround instead of fixing the underlying drift', impact: 'MEDIUM', probability: 'MEDIUM', mitigation: 'Per-session 3-uses/24h rate limit forces operator to either fix the drift or escalate within 1 day. audit_log rows are queryable to detect repeat use across sessions.', rollback_plan: 'Revert lib/claim-validity-gate.js change; the audit_log entries remain as a permanent record of past use.' },
  { id: 'R-3', risk: 'capture-session-id dead.slice(0) deletes a marker that some other concurrent process is mid-read', impact: 'LOW', probability: 'LOW', mitigation: 'The cleanup pass already runs under a startup-time lock (session-start.cjs exclusivity). No other process reads pid-*.json on a hot path; sweep reads happen at sweep cadence (5 min) and tolerate missing files (FR-3 returns null).', rollback_plan: 'Revert dead.slice(0) → dead.slice(3); the only loss is forensic data on a recently-dead session.' },
  { id: 'R-4', risk: 'reconcileAtBoot in SessionStart hook delays new-session startup', impact: 'LOW', probability: 'LOW', mitigation: 'reconcileAtBoot is bounded by acquireLock + atomicWrite (single-digit ms). Even with disk contention, expected p99 < 200ms. Hook startup budget is several seconds; this is well within budget.', rollback_plan: 'Revert FR-1 wiring; lib/session-identity-sot.js remains intact for sd-start.js callers.' },
];

const system_architecture = {
  overview: 'Four small, surgical edits to existing files. No new modules. The existing flag-gated lib/session-identity-sot.js (522 LOC) becomes the single source of session-identity reconciliation logic; this PR wires its existing reconcileAtBoot into the only consumer-side path that does not yet call it (SessionStart hook), adds a narrow operator-recoverable escape hatch (IDENTITY_DRIFT_OVERRIDE) on top of the existing claim-validity gate, and closes two pid-marker drift bugs surfaced in the 824a4401 RCA.',
  components: [
    { name: 'scripts/hooks/session-start.cjs', role: 'Calls reconcileAtBoot via dynamic-import after upsertSessionRow when SESSION_IDENTITY_SOT_ENABLED=true' },
    { name: 'lib/claim-validity-gate.js', role: 'New IDENTITY_DRIFT_OVERRIDE branch in assertValidClaim with audit_log + rate-limit' },
    { name: 'scripts/stale-session-sweep.cjs', role: '3-format terminal_id parser dispatch (win-cc-PORT-PID, win-PID, UUID)' },
    { name: 'scripts/hooks/capture-session-id.cjs', role: 'dead.slice(3)→slice(0) cleanup change' },
    { name: 'lib/session-identity-sot.js', role: 'Unchanged; consumed via dynamic import. Source of truth for reconcile primitives.' },
    { name: 'audit_log table', role: 'Stores identity_drift_override events for FR-2 audit + rate-limit query' },
  ],
  data_flow: 'SessionStart hook → upsertSessionRow → (flag-on) reconcileAtBoot → readAllSources → validateSourcesAgree → atomicWrite back to env+current+claude_sessions row → exit. handoff.js → assertValidClaim → (drift detected) → check IDENTITY_DRIFT_OVERRIDE → audit_log INSERT → rate-limit SELECT count → PASS or RateLimitError.',
};

const integration_operationalization = {
  consumers: [
    { consumer: 'Claude Code session lifecycle (SessionStart → handoff.js)', journey: 'A new CC session starts; SessionStart hook now reconciles 3 markers (when flag on); handoff.js sees a single agreed identity at claim-validity-gate. Operator-visible only on drift.' },
    { consumer: 'Operator under genuine identity-drift incident', journey: 'Operator sets IDENTITY_DRIFT_OVERRIDE="<reason>" once-per-session; handoff proceeds with audited paper trail; if drift recurs >3x in 24h, rate limit forces escalation.' },
    { consumer: 'Stale-session sweep (5-min cron)', journey: 'Sweep parses terminal_id via 3-format dispatch; UUID-format sessions resolve PID via pid-*.json instead of being skipped or mis-classified.' },
  ],
  dependencies: [
    { name: 'lib/session-identity-sot.js', direction: 'upstream', failure_mode: 'If the SOT module throws unexpectedly during reconcileAtBoot, FR-1 swallows the error and logs reconcile.failed (hook still exits 0). New sessions never bricked.' },
    { name: 'audit_log table', direction: 'downstream', failure_mode: 'If audit_log INSERT fails for any reason, FR-2 propagates the error (override is denied — fail-closed). The override is auditable-or-nothing by design.' },
    { name: 'claude_sessions table', direction: 'upstream/downstream', failure_mode: 'reconcileAtBoot needs claude_sessions row from upsertSessionRow; if absent, reconcileAtBoot throws and FR-1 catches.' },
    { name: '.claude/session-identity/pid-*.json', direction: 'upstream', failure_mode: 'FR-3 returns null when no marker matches; sweep skips that row safely.' },
  ],
  data_contracts: [
    { entity: 'audit_log', shape: '{action: "identity_drift_override", actor: <session_id::uuid>, reason: <env value::text>, severity: "warning", created_at: <now>}' },
    { entity: '.claude/session-identity/pid-*.json', shape: '{cc_pid: <number>, session_id: <uuid>, ...}' },
    { entity: 'claude_sessions', shape: 'unchanged; reconcileAtBoot writes to existing session_id column' },
    { entity: '.claude/session-identity/current', shape: 'unchanged; plain-text UUID file; reconcileAtBoot atomic-rewrites' },
  ],
  runtime_config: [
    { env_var: 'SESSION_IDENTITY_SOT_ENABLED', default: 'false', purpose: 'Master gate for reconcileAtBoot wiring (FR-1). This SD does NOT flip the default; follow-up SD will.' },
    { env_var: 'IDENTITY_DRIFT_OVERRIDE', default: 'unset', purpose: 'Per-session escape hatch for identity drift; expected to be set as a one-off env-var when an operator hits BLOCKING_IDENTITY_DRIFT' },
    { config: 'audit_log retention', value: 'inherits existing project policy; rate-limit query window is 24h' },
  ],
  observability_rollout: {
    metrics: [
      'stderr line count for `reconcile.applied` (success), `reconcile.failed` (error), `reconcile.skipped` (flag off)',
      'audit_log rows where action=identity_drift_override (count over time, group by actor)',
      'RateLimitError throw rate (4th use within 24h)',
    ],
    rollout_plan: 'PR-A (this SD) ships flag-OFF; observed for 24-48h. Follow-up SD ships PR-B that runs validateSourcesAgree() precheck against active sessions then flips the default. PR-B is documented in metadata.lead_decision.deferred_followup_sd_premise on the SD.',
    rollback_procedure: 'Single-step: set SESSION_IDENTITY_SOT_ENABLED=false (or unset). All FR-1 wiring becomes no-op. FR-3 and FR-4 are independent RCA fixes; revert their commits to roll back. FR-2 escape hatch is unused unless IDENTITY_DRIFT_OVERRIDE is set; revert lib/claim-validity-gate.js to roll back.',
  },
};

const exploration_summary = {
  files_read: [
    'lib/session-identity-sot.js (522 LOC, full read)',
    'lib/claim-validity-gate.js (lines 150-230 + IDENTITY_* branches)',
    'scripts/sd-start.js (lines 770-810 — existing reconcileAtBoot caller)',
    'scripts/hooks/session-start.cjs (full read — only consumer-side gap)',
    'scripts/hooks/capture-session-id.cjs (lines 80-200, 460-580)',
    'scripts/stale-session-sweep.cjs (lines 425-485 — terminal_id parser)',
    'tests/unit/session-identity-sot.test.js (existing coverage)',
  ],
  baseline_observation: 'Live in this PLAN-phase worktree (validation-agent verified): env CLAUDE_SESSION_ID=4582eae5, .claude/session-identity/current=2f6fc904, .claude/session-identity/session-id.txt=7781f4dd. Three different UUIDs in the same directory. handoff.js LEAD-TO-PLAN was rejected with foreign_claim earlier this session and required a manual claiming_session_id restore (cascade-trigger over-reach observed). This is the 4th-witness reproduction.',
  existing_infrastructure: 'lib/session-identity-sot.js shipped 2026-04-22 (PR #3256, SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B). It already implements readAllSources, validateSourcesAgree, reconcileAtBoot, atomicWrite, acquireLock, formatDisagreementRemediation. Wired into lib/claim-validity-gate.js:179-193 (gate-side check) and scripts/sd-start.js:30,788-792 (sd-start time reconcile). NOT wired into scripts/hooks/session-start.cjs — the missing consumer-side hook.',
  validation_agent_evidence: { row_id: 'db7da07f-615b-4fba-a7b2-36644cfb1737', verdict: 'PASS', confidence: 90, finding: 'lib/session-identity-sot.js is 95% duplicate of SD as-written. Rescope to wire-not-rebuild reduces ~390→~60-110 src LOC.' },
  risk_agent_evidence: { row_id: '5a499f93-6a6f-4cd8-be17-5cd61411fe25', verdict: 'MEDIUM', finding: 'Flag flip mid-flight bricks 3 active CC sessions with unreconciled markers. Staged 2-PR rollout required (PR-A flag-off plumbing, PR-B precheck+flip).' },
};

const prdRow = {
  id: prdId,
  directive_id: sdKey,
  sd_id: sdId,
  title: 'Session Identity Reconciliation PR-A: wire reconcileAtBoot, escape hatch, RCA fixes',
  version: '1.0.0',
  status: 'in_progress',
  category: 'infrastructure',
  priority: 'medium',
  document_type: 'prd',
  phase: 'planning',
  progress: 0,
  executive_summary: 'PR-A of a 2-PR rollout that closes the 4th-witness reproduction of the SessionStart upsertSessionRow race + handoff.js claim-validity-gate 3-marker drift. After validation-agent + risk-agent review, the originally proposed 390-LOC new module was rescoped to 4 surgical edits totalling ~60-110 src LOC — the existing flag-gated lib/session-identity-sot.js (PR #3256, 522 LOC) already implements every reconciliation primitive needed. This PR (a) wires reconcileAtBoot from session-identity-sot into the only consumer-side path that does not yet call it (scripts/hooks/session-start.cjs), (b) adds a narrow audited IDENTITY_DRIFT_OVERRIDE escape hatch in lib/claim-validity-gate.js to close the BLOCKING_IDENTITY_DRIFT permanent-stuck-state class, (c) fixes the stale-session-sweep terminal_id parser to handle 3 formats including UUID-format via pid-*.json fallback, (d) deletes all dead pid markers immediately (closes 824a4401 phantom-active-session). The default flag stays OFF; a follow-up SD will flip it after 24-48h burn-in with an active-session precheck. Closes 2 high-priority feedback rows (3ac695bf + 8e851497) in the SESSION-IDENTITY harness backlog cluster.',
  business_context: 'Three session-identity markers (env CLAUDE_SESSION_ID, .claude/session-identity/current, AUTO-PROCEED resolution at SessionStart) can disagree, causing CLAIM_VALIDITY_GATE to reject handoffs with foreign_claim. The advertised remediation "restart Claude Code" is not valid mid-session; restart-only mitigation has now been exhausted across 4 reproductions. The SOT module shipped 3 weeks ago to fix this — but it was never wired into SessionStart, leaving the witnessed bug uncovered. This SD closes that gap with the smallest possible footprint and adds an operator-recoverable escape hatch so the next session that hits drift is not bricked.',
  technical_context: 'Backend infrastructure SD (EHG_Engineer only — no frontend/UI). All edits are in lib/ and scripts/hooks/ — no DB schema changes, no new tables, no migrations. The only DB write path added is audit_log INSERT for FR-2 (table already exists).',
  functional_requirements,
  technical_requirements,
  test_scenarios,
  acceptance_criteria,
  risks,
  system_architecture,
  integration_operationalization,
  exploration_summary,
  technology_stack: ['Node.js (CommonJS for hooks, ESM for lib)', 'Supabase JS client', 'vitest', 'audit_log table (existing)', 'lib/session-identity-sot.js (existing)'],
  dependencies: [
    'lib/session-identity-sot.js (PR #3256, exports reconcileAtBoot/readAllSources/validateSourcesAgree)',
    'audit_log table (must exist; pre-flight verifies via SELECT 1)',
    'claude_sessions table (unchanged contract)',
    '.claude/session-identity/ directory convention (current file + pid-*.json markers)',
  ],
  performance_requirements: { p99_reconcile_at_boot_ms: 200, audit_log_insert_p99_ms: 150 },
  metadata: {
    sd_key: sdKey,
    sd_type: 'infrastructure',
    plan_phase_session: '4582eae5-0f07-4eea-a305-5e45cc09958e',
    rescope_source: 'validation-agent + risk-agent (LEAD-phase)',
    loc_estimate: { source: { min: 60, max: 110 }, tests: 150, ceiling: 260 },
    out_of_scope: [
      'Flipping SESSION_IDENTITY_SOT_ENABLED=true (deferred to follow-up SD)',
      'Building a new lib/session-identity-reconcile.mjs (95% duplicate)',
      'Mid-session reconcileMidSession() helper (folded into FR-1)',
      '4c2b2e1a sub-process node identity overwrite (separate investigation)',
    ],
    sub_agent_evidence: {
      validation: 'db7da07f-615b-4fba-a7b2-36644cfb1737',
      risk: '5a499f93-6a6f-4cd8-be17-5cd61411fe25',
    },
  },
  created_by: `PLAN-PHASE-INLINE-MODE-CC-${sessionShort}`,
  goal_summary: 'Close 4th-witness reproduction of SessionStart-race / 3-marker-drift class with the smallest possible footprint by wiring an existing SOT module into the missing consumer-side path + adding an audited escape hatch + fixing 2 RCA-driven pid-marker bugs.',
  smoke_test_cmd: 'npx vitest run tests/unit/session-start-hook-reconcile.test.js tests/unit/claim-validity-gate-identity-override.test.js tests/unit/stale-session-sweep-terminal-parser.test.js tests/unit/capture-session-id-cleanup.test.js',
};

const { data, error } = await supabase
  .from('product_requirements_v2')
  .insert(prdRow)
  .select('id, directive_id, sd_id, status, phase, category, priority, created_by');

if (error) {
  console.error('INSERT_ERR:', error);
  process.exit(1);
}

console.log('PRD_INSERTED:', JSON.stringify(data, null, 2));
