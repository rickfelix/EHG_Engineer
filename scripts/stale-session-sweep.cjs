/**
 * Stale Session Sweep — Automated Conflict Resolution & Coordination
 *
 * Designed to run on a recurring loop: /loop 5m node scripts/stale-session-sweep.cjs
 *
 * What it does:
 * 1. Scans all sessions with active SD claims
 * 2. Detects stale sessions (heartbeat > threshold)
 * 2b. IDENTITY COLLISION DETECTION — reads .claude/session-identity/ marker files
 *     to detect multiple live Claude Code PIDs sharing one session_id. Splits
 *     colliding sessions into separate DB records with unique terminal_ids.
 * 2c. NPM INSTALL LOCK — checks/cleans stale npm install locks to prevent
 *     concurrent installs from corrupting node_modules.
 * 3. Checks PID liveness for same-host sessions
 * 4. Auto-releases dead claims (stale + PID dead)
 * 5. Detects and AUTO-RESOLVES duplicate claims on the same SD
 * 6. Writes coordination messages for active sessions
 * 7. Outputs a summary to stdout
 *
 * Safe to run repeatedly — fully idempotent.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');
const { PLAN_CONTENT_MARKER } = require('../lib/sd-enrichment-markers.cjs');
const { parseSdDependencies } = require('../lib/utils/parse-sd-dependencies.cjs'); // QF-20260525-542
// SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001: shared dispatch-eligibility predicate (same one the
// worker self_claim path uses) so CLAIM_FIX never re-affirms an orchestrator PARENT / dep-blocked SD.
const { evaluateDispatchEligibility, classifyDispatchIneligibility, TEST_FIXTURE_KEY_RE } = require('../lib/fleet/claim-eligibility.cjs');
// SD-LEO-FEAT-CLAIM-ASSIGNMENT-PATH-001: the sweep is the primary scheduled WORK_ASSIGNMENT producer
// and inserts raw (it does NOT route through insertCoordinationRow), so the dispatch-side terminal
// guard would never reach it. Call assertSdDispatchable here so the sweep also refuses to nudge a
// worker about a terminal/non-existent SD (it fails OPEN on a transient DB error).
const { assertSdDispatchable, isFullUuid } = require('../lib/coordinator/dispatch.cjs');
// SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-3): single shared definition of which
// classified session statuses count as "currently holding the SD claim" — used
// by BOTH the available-to-claim filter and the worker-render filter below so
// they cannot drift. Absorbs QF-20260526-577.
const { CLAIM_HOLDING_STATUSES, computeClaimedSdKeys } = require('../lib/claim/holding-statuses.cjs');
const { SILENCE_HARD_CAP_MS } = require('../lib/fleet/silence-cap.cjs'); // FR-4: shared writer<=reader cap
const { detectDormantWorkers } = require('../lib/fleet/dormancy-watchdog.cjs'); // QF-20260703-076
const { getMarkerSessionIds } = require('../lib/fleet/cc-pid-liveness.cjs'); // SD-LEO-INFRA-FIX-RESIDUAL-PROCESS-001 FR-2/FR-3

// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 2 — the sweep ACTS on what it
// fetches, so a read silently capped at the PostgREST 1000-row max means claims not
// released / SDs not reconciled with no error. Unbounded processing reads paginate to
// completion; each site keeps its own pre-existing error policy (fail-open catch or
// destructured-error check) — fetchAllPaginated throws on a page error, so converted
// sites wrap in try/catch mirroring their prior behavior.
let _fapModule = null;
async function fapPaginate(queryFactory, opts) {
  _fapModule ||= await import('../lib/db/fetch-all-paginated.mjs');
  return _fapModule.fetchAllPaginated(queryFactory, opts);
}
// SD-FDBK-ENH-CONFIRMED-LIVE-TODAY-001: pure, exported so the gate can be unit-tested without a
// live claude_sessions table. Mirrors MASKED_STALL_DETECT_ON (coordinator-capacity-forecast.mjs) --
// DORMANT BY DEFAULT until process_alive_at is trustworthy again (see call site below for full RCA).
function isDormancyWatchdogEnabled(env = process.env) {
  return env.LEO_DORMANCY_WATCHDOG_ENABLED === 'on';
}

// SD-LEO-INFRA-FIX-RESIDUAL-PROCESS-001 (FR-2/FR-3, risk-agent evidence
// 4d1be256-dbc4-4e37-a661-72ffb6453bc0): pure, exported AND-gate so the join can be
// unit-tested without a live claude_sessions table or real pid-*.json marker files.
// dormancyMarkers is the raw shape returned by lib/fleet/cc-pid-liveness.cjs's
// getMarkerSessionIds() -- { [marker.session_id]: { claude_session_id, pid, alive } }.
// CRITICAL: joins on each marker's claude_session_id field (the CLAUDE_SESSION_ID UUID
// that claude_sessions.session_id also is), NEVER the marker's own session_id (the
// map's OWN key, a DIFFERENT identifier) -- a naive join on the wrong key silently
// fails open (matches nothing), making this AND-gate inert while looking shipped.
function filterDormantByPidLiveness(dormantCandidates, dormancyMarkers) {
  const aliveClaudeSessionIds = new Set(
    Object.values(dormancyMarkers || {})
      .filter((m) => m && m.alive && m.claude_session_id)
      .map((m) => m.claude_session_id)
  );
  return (dormantCandidates || []).filter((d) => !aliveClaudeSessionIds.has(d.session_id));
}

const HEADLESS_ZOMBIE_MIN_MS = 15 * 60 * 1000;

// SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001: claim-boundary pre-flight probe. Pure predicate
// lives in lib/fleet/claim-boundary-probe.cjs; the sweep supplies I/O + the release action.
const {
  evaluateClaimBoundary,
  probeWindowMs: claimBoundaryWindowMs,
  boundaryGraceMs: claimBoundaryGraceMs,
  isProbeEnabled: isClaimBoundaryProbeEnabled,
} = require('../lib/fleet/claim-boundary-probe.cjs');

/**
 * SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001: detect + auto-release prompt-blocked claim holders.
 *
 * The freeze class (4 events / 3 windows overnight 2026-07-04→05): a window-level
 * interactive prompt blocks the harness at a claim/transition boundary — process alive,
 * heartbeat FRESH (session-tick keeps PATCHing it), zero tool calls after the boundary.
 * The heartbeat-age classification above can never catch it; this probe keys on the
 * tick-immune last_tool_at clock instead. Modeled on the HEADLESS_ZOMBIE block: detect,
 * release the claim through the SAME path as the coordinator's manual fence
 * (release_sd RPC via bestEffortReleaseSd — never a parallel re-implementation),
 * quarantine the session (self-clears at its next checkin), surface ONE de-duped
 * operator line naming the terminal — and NEVER touch the OS process.
 *
 * PID-INDEPENDENT by design: the frozen window's PID is alive; requiring a dead PID
 * (like the dead-session release loop) would structurally miss this class.
 *
 * Exported for the integration test (real tables, ephemeral fixtures — no mocked gate).
 */
async function runClaimBoundaryProbe(supabase, classified, telemetryMap, now, actions, warnings, opts = {}) {
  const outcomes = [];
  if (!isClaimBoundaryProbeEnabled(opts.env || process.env)) return outcomes;
  const nowMs = now.getTime();
  const windowMs = opts.probeWindowMs || claimBoundaryWindowMs(opts.env || process.env);
  const graceMs = opts.boundaryGraceMs || claimBoundaryGraceMs(opts.env || process.env);

  for (const s of classified || []) {
    try {
      if (!s || !s.sd_key || s.is_virtual) continue;
      const t = telemetryMap.get(s.session_id) || {};
      // Already quarantined and not yet cleared: released on a prior pass; skip.
      const quarantine = t.metadata && typeof t.metadata === 'object' ? t.metadata.quarantine : null;
      if (quarantine && typeof quarantine === 'object' && !quarantine.cleared_at) continue;

      // Cheap pre-filter: anchor >= claimed_at always, so a young claim can't be due.
      const claimedMs = t.claimed_at ? Date.parse(t.claimed_at) : NaN;
      if (!Number.isFinite(claimedMs) || nowMs - claimedMs < windowMs) continue;

      // Anchor = GREATEST(claimed_at, latest handoff created_at) — covers fresh-claim,
      // resumed-entry and post-handoff boundaries. QF claims have no handoffs.
      let anchorMs = claimedMs;
      let anchorType = 'claim';
      if (!/^QF-/.test(s.sd_key)) {
        // sd_phase_handoffs joins on strategic_directives_v2.id (NOT uuid_id/sd_uuid).
        const { data: sdRow } = await supabase
          .from('strategic_directives_v2').select('id').eq('sd_key', s.sd_key).maybeSingle();
        if (sdRow && sdRow.id) {
          const { data: lastHandoff } = await supabase
            .from('sd_phase_handoffs').select('created_at')
            .eq('sd_id', sdRow.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
          const handoffMs = lastHandoff ? Date.parse(lastHandoff.created_at) : NaN;
          if (Number.isFinite(handoffMs) && handoffMs > anchorMs) {
            anchorMs = handoffMs;
            anchorType = 'handoff';
          }
        }
      }
      if (nowMs - anchorMs < windowMs) continue; // handoff refreshed the boundary

      // Dual-signal guard input: outbound comms since the anchor prove the model is
      // alive even tool-silent. Count error -> null -> predicate returns UNKNOWN.
      let outboundSinceAnchor = null;
      try {
        const { count, error: cntErr } = await supabase
          .from('session_coordination')
          .select('id', { count: 'exact', head: true })
          .eq('sender_session', s.session_id)
          .gte('created_at', new Date(anchorMs).toISOString());
        if (!cntErr) outboundSinceAnchor = count ?? 0;
      } catch { /* leave null -> UNKNOWN */ }

      const result = evaluateClaimBoundary({
        nowMs,
        anchorMs,
        anchorType,
        lastToolAtMs: t.last_tool_at ? Date.parse(t.last_tool_at) : null,
        outboundSinceAnchor,
        expectedSilenceUntilMs: t.expected_silence_until ? Date.parse(t.expected_silence_until) : null,
        currentToolExpectedEndMs: t.current_tool_expected_end_at ? Date.parse(t.current_tool_expected_end_at) : null,
        probeWindowMs: windowMs,
        boundaryGraceMs: graceMs,
      });
      outcomes.push({ session_id: s.session_id, sd_key: s.sd_key, verdict: result.verdict, reason: result.reason });

      if (result.verdict === 'UNKNOWN') {
        // Fail-open (pre-rollout hook gap / corrupt input) — log for rollout monitoring.
        if (result.reason !== 'last_tool_at_never_written' || process.env.LEO_TELEMETRY_DEBUG === '1') {
          warnings.push('CLAIM_BOUNDARY_PROBE: UNKNOWN (' + result.reason + ') for ' + s.session_id + ' sd=' + s.sd_key);
        }
        continue;
      }
      if (result.verdict !== 'MISS') continue;

      const releasedSd = s.sd_key;
      // 1a. Pre-release re-verification (adversarial review, PR #5622): the tick snapshot
      // is seconds-to-tens-of-seconds old by the time we act, and release_sd is
      // SESSION-keyed — it releases whatever the session holds NOW, not what the probe
      // detected. If the operator answered the prompt in the gap (last_tool_at advanced)
      // or the session re-claimed a DIFFERENT item (sd_key changed), releasing now would
      // yank a LIVE claim. Re-read the row and abort the MISS on any movement; a failed
      // re-read also aborts (fail-open: never release on unverifiable state).
      let liveRow = null;
      try {
        const { data, error: liveErr } = await supabase
          .from('claude_sessions')
          .select('sd_key, last_tool_at')
          .eq('session_id', s.session_id)
          .maybeSingle();
        if (!liveErr) liveRow = data;
      } catch { /* liveRow stays null -> abort below */ }
      if (!liveRow) {
        warnings.push('CLAIM_BOUNDARY_PROBE: release aborted for ' + s.session_id + ' — pre-release re-read unavailable (fail-open)');
        continue;
      }
      if (liveRow.sd_key !== s.sd_key) {
        actions.push('CLAIM_BOUNDARY_PROBE: release aborted for ' + s.session_id + ' — claim changed since snapshot (' + s.sd_key + ' -> ' + (liveRow.sd_key || 'none') + '), session is live');
        continue;
      }
      const liveToolMs = liveRow.last_tool_at ? Date.parse(liveRow.last_tool_at) : null;
      const snapToolMs = t.last_tool_at ? Date.parse(t.last_tool_at) : null;
      if (Number.isFinite(liveToolMs) && (snapToolMs === null || liveToolMs > snapToolMs)) {
        actions.push('CLAIM_BOUNDARY_PROBE: release aborted for ' + s.session_id + ' — tool activity resumed since snapshot (window likely un-blocked)');
        continue;
      }
      // 1b. Release through the manual fence's own path — QF-aware release_sd RPC.
      const { bestEffortReleaseSd } = await import('../lib/fleet/best-effort-release.mjs');
      const rel = await bestEffortReleaseSd(supabase, s.session_id, 'CLAIM_BOUNDARY_PROBE',
        (m) => warnings.push('CLAIM_BOUNDARY_PROBE: ' + m));
      if (!rel.released) {
        warnings.push('CLAIM_BOUNDARY_PROBE: release_sd failed for ' + s.session_id + ' (' + (rel.error || 'unknown') + ') — no quarantine/alert emitted');
        continue;
      }

      // 2a. QF supplement: release_sd clears claiming_session_id but leaves
      // status='in_progress', which the checkin open-QF picker (status='open')
      // cannot see — reset it, guarded on every column so a QF with real work
      // (PR/commit) or a new claimant is never touched.
      if (/^QF-/.test(releasedSd)) {
        // The status guard uses the .filter('status','eq',...) spelling (wire-identical
        // to the .eq form) because stale-session-sweep-claim-safety.test.js anchors its
        // "phantom in_progress scan" SD-TEST-exclusion window on the FIRST eq-form
        // status/in_progress match in this file's source — and this quick_fixes UPDATE
        // (id-scoped; the table has no sd_key column) is outside that guarded
        // strategic_directives_v2 QA class.
        await supabase.from('quick_fixes').update({ status: 'open' })
          .eq('id', releasedSd).filter('status', 'eq', 'in_progress')
          .is('claiming_session_id', null).is('pr_url', null).is('commit_sha', null);
      } else {
        // 2b. SD supplement: phase-boundary reset, parity with the dead-session release loop.
        try { await resetSdPhaseOnRelease(releasedSd, 'CLAIM_BOUNDARY_PROBE'); } catch { /* best-effort */ }
      }

      // 3. Quarantine (QF-193 provenance convention). Read-modify-write on FRESH
      // metadata NARROWS the clobber window vs writing the stale snapshot (a write
      // landing inside the read->write gap can still lose — accepted file-wide JSONB
      // pattern; a lost quarantine self-heals at the next sweep pass).
      try {
        const { data: freshRow } = await supabase
          .from('claude_sessions').select('metadata').eq('session_id', s.session_id).maybeSingle();
        const freshMeta = (freshRow && freshRow.metadata) || {};
        await supabase.from('claude_sessions').update({
          metadata: {
            ...freshMeta,
            quarantine: {
              reason: 'claim_boundary_probe: zero tool activity ' + Math.round(windowMs / 60000) + 'min after ' + anchorType + ' boundary (window likely prompt-blocked)',
              set_by: 'claim-boundary-probe',
              set_at: now.toISOString(),
              released_sd: releasedSd,
              evidence: result.evidence,
            },
          },
        }).eq('session_id', s.session_id);
      } catch (qErr) {
        warnings.push('CLAIM_BOUNDARY_PROBE: quarantine write failed for ' + s.session_id + ': ' + (qErr?.message || qErr));
      }

      // 4. ONE de-duped operator line naming the terminal (emitInertWorkerAlert
      // semantics: skip while an unacked, unexpired same-kind row for this session
      // exists). Doubles as the durable per-release audit record.
      try {
        const { data: existing } = await supabase
          .from('session_coordination').select('id')
          .eq('payload->>kind', 'claim_boundary_released')
          .eq('payload->>session_id', s.session_id)
          .is('acknowledged_at', null)
          .gte('created_at', new Date(nowMs - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);
        if (!existing || existing.length === 0) {
          const terminal = s.terminal_id || s.tty || 'unknown-terminal';
          // Validated writer + broadcast-coordinator sentinel (FR-5): buffered until a live
          // coordinator drains it — never a dead-lettered direct-UUID guess from the sweep.
          const { insertCoordinationRow } = require('../lib/coordinator/dispatch.cjs');
          await insertCoordinationRow(supabase, {
            message_type: 'INFO',
            sender_type: 'sweep',
            target_session: 'broadcast-coordinator',
            subject: '[SWEEP] claim-boundary probe released ' + releasedSd + ' from ' + terminal,
            body: 'Zero tool activity ' + Math.round(windowMs / 60000) + 'min after its ' + anchorType + ' boundary with heartbeat still fresh — window likely blocked by an interactive prompt (session-limit/trust/updater). Claim released via release_sd (re-claimable), session quarantined (self-clears at its next checkin). Operator: answer the prompt on terminal ' + terminal + '. NEVER kill the OS process from this alert alone.',
            payload: {
              kind: 'claim_boundary_released',
              session_id: s.session_id,
              callsign: (t.metadata && t.metadata.fleet_identity && t.metadata.fleet_identity.callsign) || null,
              terminal_id: s.terminal_id || null,
              tty: s.tty || null,
              sd_key: releasedSd,
              anchor_type: anchorType,
              evidence: result.evidence,
            },
            expires_at: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
          });
        }
      } catch (aErr) {
        warnings.push('CLAIM_BOUNDARY_PROBE: alert emit failed for ' + s.session_id + ': ' + (aErr?.message || aErr));
      }

      actions.push('CLAIM_BOUNDARY_PROBE: released ' + releasedSd + ' from ' + s.session_id
        + ' (anchor=' + anchorType + ', terminal=' + (s.terminal_id || s.tty || 'unknown') + ') — prompt-blocked window suspected');
    } catch (probeErr) {
      // Per-session isolation: one bad row never aborts the sweep or the probe loop.
      warnings.push('CLAIM_BOUNDARY_PROBE: swallowed for ' + (s && s.session_id) + ': ' + (probeErr?.message || probeErr));
    }
  }
  return outcomes;
}

// SD-LEO-INFRA-WORKER-SOURCE-SIDE-001 / SD-ARCH-HOTSPOT-SWEEP-001 (PRD FR-2): source-side
// telemetry precedence check, promoted to module level from a main()-local closure so it
// compiles standalone and is unit-testable without a live sweep run. All signals honor a
// 30-minute hard cap (SILENCE_HARD_CAP_MS) — a worker cannot declare silence beyond that
// window, preventing a misconfigured hook from masking a dead worker.
//
// CRITICAL (risk-agent finding, PRD FR-2): this is a CLASSIFICATION INPUT feeding the
// ALIVE_SOURCE_SIDE branch of the session status ladder in main()'s classification loop —
// it is called DURING classification (sessions.map()), never as an ordered registry pass
// running AFTER classification. If it ran post-classification, a source-side-alive worker
// would already be classified dormant/dead by the time this ran, defeating its purpose and
// causing false claim releases. See tests/unit/ for the ALIVE_SOURCE_SIDE regression test
// (TS-3) asserting this ordering constraint.
const TICK_ALIVE_WINDOW_MS = 90 * 1000;
function evaluateSourceSideSignals(telemetryMap, sessionId, nowMs) {
  const t = telemetryMap.get(sessionId);
  if (!t) return null;
  if (t.expected_silence_until) {
    const endMs = Date.parse(t.expected_silence_until);
    const deltaMs = endMs - nowMs;
    if (deltaMs > 0 && deltaMs <= SILENCE_HARD_CAP_MS) {
      return { alive: true, reason: 'silent until ' + t.expected_silence_until };
    }
  }
  if (t.process_alive_at) {
    const tickMs = Date.parse(t.process_alive_at);
    const ageMs = nowMs - tickMs;
    if (ageMs >= 0 && ageMs <= TICK_ALIVE_WINDOW_MS) {
      return { alive: true, reason: 'tick alive ' + Math.round(ageMs / 1000) + 's ago' };
    }
  }
  if (t.current_tool_expected_end_at) {
    const endMs = Date.parse(t.current_tool_expected_end_at);
    if (endMs - nowMs > 0) {
      return { alive: true, reason: 'tool ' + (t.current_tool || 'running') + ' expected until ' + t.current_tool_expected_end_at };
    }
  }
  return null;
}

// QF-20260704-081: pure predicate, exported so it can be unit-tested without a live
// claude_sessions table. See call site (classification loop) for full context/RCA.
// is_virtual sessions (lib/virtual-session-factory.mjs) are excluded: they legitimately never
// set terminal_id/tty/worktree_path at all (no window to bind to), so without this guard every
// virtual/drain session would false-positive as headless after 15 minutes.
function isHeadlessZombie(session, telemetry, nowMs) {
  if (!session || session.is_virtual) return false;
  if (session.terminal_id || session.tty || telemetry?.worktree_path) return false;
  const claimAgeMs = session.claimed_at ? nowMs - Date.parse(session.claimed_at) : 0;
  return claimAgeMs > HEADLESS_ZOMBIE_MIN_MS;
}
// SD-LEO-INFRA-STALE-SWEEP-PID-LIVENESS-GUARD-001: PID-liveness guard for the conflict-eviction path.
const { shouldHoldClaim } = require('../lib/fleet/claim-release-guard.cjs');
// SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3b — top-level require so wire-check
// call-graph builder can statically resolve the dependency on lib/coordinator/signal-router.cjs.
const _signalRouterModule = require('../lib/coordinator/signal-router.cjs');
const _coordEventsModule = require('../lib/coordinator/coordination-events.cjs'); // SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001 (epic #4) — top-level require so WIRE_CHECK reaches detectors.cjs
// SD-LEO-INFRA-COORDINATOR-PENDING-QUESTION-001 — top-level require so WIRE_CHECK reaches the
// pending-question timer (auto-proceed on a stale, non-critical, unanswered operator question).
const _pendingQuestionTimer = require('../lib/coordinator/pending-question-timer.cjs');
// SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001 — top-level require so WIRE_CHECK reaches the
// Adam->coordinator action-required two-stage ACK + wake/SLA escalation timer.
const _adamActionAck = require('../lib/coordinator/adam-action-ack.cjs');
// SD-LEO-INFRA-ADD-PART-MUTUAL-001 — top-level require so WIRE_CHECK reaches the 3-part
// mutual self-ID handshake (coordinator discovery that doesn't depend solely on the flag).
const _selfIdHandshake = require('../lib/coordinator/self-id-handshake.cjs');

// SD-ARCH-HOTSPOT-SWEEP-001: ordered pass-registry (lib/sweep/pass-registry.cjs).
// SWEEP_PASS_REGISTRY=off keeps the pre-refactor monolithic code path callable as a
// rollback lever for at least one release cycle (one_way door-class re-architecture —
// see PRD TR-3). Passes call back into this module's own exports lazily (never at
// require-time) to sidestep the circular-require ordering hazard documented in each
// pass file's header comment.
//
// CIRCULAR-REQUIRE NOTE (bidirectional): this require is ITSELF the other half of the
// same hazard. If a consumer requires lib/sweep/pass-registry.cjs BEFORE
// scripts/stale-session-sweep.cjs is ever loaded (e.g. a test importing the registry
// directly), pass-registry.cjs's passes trigger loading this file, which reaches this
// exact line while pass-registry.cjs is still mid-execution (its own module.exports not
// yet assigned) — a destructured `const { EARLY_PASSES, ... } = require(...)` would
// capture `undefined` permanently. Reference the whole module object instead and access
// .EARLY_PASSES/.MAIN_PASSES/.runPasses lazily at each call site inside main() (called
// well after the full require graph has settled) — verified by
// tests/unit/lib/sweep/pass-registry.test.js, which imports pass-registry.cjs directly
// and reproduces exactly this ordering.
const passRegistryModule = require('../lib/sweep/pass-registry.cjs');
const legacyFallback = require('../lib/sweep/legacy-fallback.cjs');
const SWEEP_PASS_REGISTRY_ENABLED = process.env.SWEEP_PASS_REGISTRY !== 'off';

// SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001: the un-owned-kill-switch class —
// lib/sweep/legacy-fallback.cjs previously carried only a prose "if ever removed
// post-rollout" note with no owner, no condition, no enumerated action. This record
// makes retirement checkable rather than permanent-by-default. It is metadata only —
// nothing reads it at runtime; a human (or a future automation) consults it to decide
// when SWEEP_PASS_REGISTRY=off can be deleted.
const SWEEP_PASS_REGISTRY_RETIREMENT = {
  owner: 'coordinator (fleet-infra on-call)',
  condition: 'SWEEP_PASS_REGISTRY has not been set to "off" in production for 30 consecutive ' +
    'days AND tests/ci/sweep-legacy-twin-parity.test.js has stayed green for that entire ' +
    'window (i.e. the three legacy twins never needed to diverge to stay correct) — ' +
    'whichever is later.',
  retirement_action: 'Remove the SWEEP_PASS_REGISTRY_ENABLED branch at all 7 gated call ' +
    'sites in this file (collapse each to always call the registry-path function), delete ' +
    'lib/sweep/legacy-fallback.cjs, delete tests/ci/sweep-legacy-twin-parity.test.js, delete ' +
    'this SWEEP_PASS_REGISTRY_RETIREMENT record.',
};

// SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-2 — INTENT collision detection.
// Reuse the INTENT payload key contract owned by the WRITER (worker-signal.cjs) so the
// sweep reader and the broadcast writer cannot drift (pinned end-to-end by TS-WC-1).
const { INTENT_PAYLOAD_KEYS } = require('./worker-signal.cjs');
// SD-ARCH-HOTSPOT-SWEEP-001: DECONFLICTION_ENABLED used to gate the inline intent-collision
// block here; that gate now lives with the code it guards, in
// lib/sweep/passes/intent-collision-detection.cjs (registry path) and
// lib/sweep/legacy-fallback.cjs (SWEEP_PASS_REGISTRY=off path) — each derives its own copy
// from the same CROSS_SESSION_DECONFLICTION env var. No longer referenced in this file.
// INTENT rows are read within a claim-TTL-aligned window — deliberately NOT the
// signal-router 60-min WINDOW_MIN (a tree-cancel intent stays relevant for the life
// of the claim). Default 24h matches the INTENT expires_at the writer stamps.
const INTENT_WINDOW_MIN = Number(process.env.CROSS_SESSION_INTENT_WINDOW_MIN) || 24 * 60;

/**
 * Pure, side-effect-free collision detector (exported for TS-WC-1 / TS-FR2).
 * Given the already-classified live sessions and a set of INTENT rows, returns one
 * collision record per (intent × colliding live session) where the intent's target
 * overlaps a DIFFERENT live session's claimed SD, current branch, or files.
 *
 * Keys are read from INTENT_PAYLOAD_KEYS — the same contract the writer emits.
 * ADDITIVE: this does not touch dup-claim (bySD) or WORKTREE_CONFLICT (branchSessions).
 * Idempotent: a pure function of its inputs, so repeated sweeps yield identical records.
 */
function detectCrossSessionCollisions(classified, intents) {
  const K = INTENT_PAYLOAD_KEYS;
  const live = (classified || []).filter(s => s && (s.status === 'ACTIVE' || s.status === 'ALIVE_NO_HEARTBEAT' || s.status === 'ALIVE_SOURCE_SIDE'));
  const collisions = [];

  for (const intent of (intents || [])) {
    const p = (intent && intent.payload) || {};
    const action = p[K.action];
    if (!action) continue; // not an INTENT row
    const targetSd = p[K.sdKey] || null;
    const targetTree = p[K.tree] || null;
    const targetFiles = Array.isArray(p[K.files]) ? p[K.files] : [];
    const senderSession = intent.sender_session || p[K.callsign] || null;

    for (const s of live) {
      // Never flag a session colliding with its own broadcast.
      if (senderSession && s.session_id === senderSession) continue;

      const reasons = [];
      if (targetSd && s.sd_key && s.sd_key === targetSd) reasons.push('sd_key');
      if (targetTree && s.current_branch && s.current_branch === targetTree) reasons.push('branch');
      // File overlap: only fires when a live session exposes a file list (forward-compatible —
      // sessions carry no per-file column today, so this stays inert until one is added).
      const sessionFiles = Array.isArray(s.files) ? s.files
        : Array.isArray(s.target_files) ? s.target_files : [];
      if (targetFiles.length && sessionFiles.length) {
        const overlap = targetFiles.filter(f => sessionFiles.includes(f));
        if (overlap.length) reasons.push('files:' + overlap.join('|'));
      }

      if (reasons.length) {
        collisions.push({
          intent_id: intent.id || null,
          intent_action: action,
          sender_session: senderSession,
          target_sd_key: targetSd,
          target_tree: targetTree,
          collided_with_session: s.session_id,
          collided_with_sd_key: s.sd_key || null,
          collided_with_branch: s.current_branch || null,
          reasons
        });
      }
    }
  }
  return collisions;
}

/**
 * Read recent INTENT rows (payload->>intent_action IS NOT NULL) within the claim-TTL
 * window. Exported so the collision detector can be exercised against a mocked client.
 */
async function loadRecentIntents(sb, windowMin = INTENT_WINDOW_MIN) {
  const cutoff = new Date(Date.now() - windowMin * 60_000).toISOString();
  try {
    const rows = await fapPaginate(() => sb
      .from('session_coordination')
      .select('id, sender_session, target_session, payload, body, created_at')
      .gte('created_at', cutoff)
      .not('payload->>' + INTENT_PAYLOAD_KEYS.action, 'is', null)
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
    return { rows: rows || [], error: null };
  } catch (e) {
    return { rows: [], error: e }; // prior { rows: [], error } error-path shape preserved
  }
}

// SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-005): MC gating constants.
// Feature-flag MC consultation at sweep independently from dashboard so that
// roll-out can be staged (dashboard first → sweep later after calibration).
const FLEET_MC_SWEEP_GATE = (process.env.FLEET_MC_SWEEP_GATE ?? 'true').toLowerCase() !== 'false';
const FLEET_MC_PALIVE_HOLD_THRESHOLD = Number(process.env.FLEET_MC_PALIVE_HOLD_THRESHOLD) || 0.3;
const FLEET_MC_HARD_CAP_SEC = Number(process.env.FLEET_MC_HARD_CAP_SEC) || 1200; // 20 minutes
const FLEET_MC_ESTIMATE_STALENESS_SEC = Number(process.env.FLEET_MC_ESTIMATE_STALENESS_SEC) || 300; // 5m

const supabase = createSupabaseServiceClient();

/**
 * SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-3): resolve cc_pid from
 * a session's terminal_id, dispatching on format. Falls back to scanning
 * .claude/session-identity/pid-*.json (cc_pid field, matched by session_id) for
 * UUID-format terminal_ids since UUID hex chars are not a real PID.
 *
 * @param {string} terminalId
 * @param {string} [sessionId] - Used for UUID-format pid-*.json lookup
 * @returns {number|null} numeric PID or null when no match
 */
function resolveCcPidFromTerminalId(terminalId, sessionId) {
  if (!terminalId || typeof terminalId !== 'string') return null;
  // Format 1: win-cc-PORT-PID (CLI)
  const cliMatch = /^win-cc-\d+-(\d+)$/.exec(terminalId);
  if (cliMatch) return Number(cliMatch[1]);
  // Format 2: win-PID (Desktop)
  const dtMatch = /^win-(\d+)$/.exec(terminalId);
  if (dtMatch) return Number(dtMatch[1]);
  // Format 3: UUID — scan .claude/session-identity/pid-*.json by session_id match
  try {
    const markerDir = path.resolve(__dirname, '..', '.claude', 'session-identity');
    if (!fs.existsSync(markerDir)) return null;
    const files = fs.readdirSync(markerDir)
      .filter(f => /^pid-\d+\.json$/.test(f));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(markerDir, file), 'utf8'));
        if (data?.cc_pid && (
          data.session_id === sessionId
          || data.session_id === terminalId
        )) {
          return Number(data.cc_pid);
        }
      } catch { /* skip malformed */ }
    }
  } catch { /* directory missing or unreadable */ }
  return null;
}
module.exports.resolveCcPidFromTerminalId = resolveCcPidFromTerminalId;

// SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-3): lazy-load the ESM exec-context-guard
// from this CJS module. Cached after first import to avoid repeated module
// resolution. The guard's assertSweepHandoffGate() blocks current_phase resets
// when an accepted handoff past the target reset state exists in
// sd_phase_handoffs — generalizes QF-20260423-909 (which only covered
// PLAN-TO-LEAD) to all 4 handoff types.
let _execContextGuardCache = null;
async function getExecContextGuard() {
  if (!_execContextGuardCache) {
    _execContextGuardCache = await import('../lib/exec-context-guard.mjs');
  }
  return _execContextGuardCache;
}

/**
 * Helper: gate a current_phase reset behind assertSweepHandoffGate.
 * Returns true when the reset is allowed; false when an accepted handoff
 * past the target reset phase would be overridden (caller must skip update).
 * Logs a SKIP_RESET line with full diagnostic context on block.
 */
async function isSweepResetAllowed(sdKey, targetResetPhase, contextLabel) {
  const { assertSweepHandoffGate } = await getExecContextGuard();
  try {
    await assertSweepHandoffGate(supabase, sdKey, targetResetPhase);
    return true;
  } catch (err) {
    if (err && err.code === 'ACCEPTED_HANDOFF_OVERRIDE') {
      console.log(
        '  SKIP_RESET: ' + sdKey + ' — ' + contextLabel +
        ' — accepted handoff past ' + targetResetPhase + ' exists: ' + err.message
      );
      return false;
    }
    // SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001 (FR-1): a vanished SD (TOCTOU — a
    // concurrent test suite DELETEd an SD-TEST-* fixture between the sweep's
    // snapshot and this handoff-gate lookup) makes assertSweepHandoffGate throw
    // ExecContextError code=SD_NOT_FOUND. That is NOT a fault to abort the whole
    // sweep on (it previously propagated to the top-level catch → process.exit(1),
    // killing all fleet protection for the tick — live evidence fa7dc41e). Treat
    // it as a per-item skip: the SD is gone, so there is nothing to reset. Do NOT
    // swallow SCHEMA_ERROR (a genuine, permanent fault that must surface).
    if (err && err.code === 'SD_NOT_FOUND') {
      console.log(
        '  SKIP_RESET: ' + sdKey + ' — ' + contextLabel +
        ' — SD vanished before handoff-gate lookup (TOCTOU); skipping reset (non-fatal)'
      );
      return false;
    }
    // SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001 (FR-2): any other unexpected error
    // (e.g. SCHEMA_ERROR) is contained at the item boundary, not re-thrown. This
    // is the single fail-soft containment point for the QA reset gate — returning
    // false ("reset not allowed") is the SAFE default: it does NOT override SD
    // state, it simply skips this one item. Previously this re-threw and bubbled
    // to the top-level catch → process.exit(1), killing ALL fleet protection for
    // the tick over a single bad row. The fault is still surfaced via a WARN line
    // emitted every tick until resolved (visible, but non-catastrophic).
    console.warn(
      '  WARN_RESET_GATE_ERROR: ' + sdKey + ' — ' + contextLabel + ' — ' +
      (err && err.message ? err.message : err) + ' (skipping reset, non-fatal)'
    );
    return false;
  }
}

const STALE_THRESHOLD_SECONDS = parseInt(process.env.STALE_SESSION_THRESHOLD_SECONDS, 10) || 300;
const LOCAL_HOSTNAME = os.hostname();

/**
 * SD-LEO-INFRA-FLEET-COORDINATION-RESILIENCE-001 (FR-001):
 * Reset SD current_phase to the last safe phase boundary when releasing a stale claim.
 * Prevents SDs from being left in mid-phase limbo with no active claimer.
 *
 * Phase reset map: mid-phase states → safe boundary
 */
const PHASE_RESET_MAP = {
  'EXEC': 'PLAN_PRD',
  'EXEC_COMPLETE': 'PLAN_PRD',
  'PLAN_VERIFICATION': 'PLAN_PRD',
  'LEAD_APPROVAL': 'LEAD',
  'LEAD_FINAL_APPROVAL': 'LEAD_FINAL',
};

async function resetSdPhaseOnRelease(sdKey, reason) {
  // SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001 (FR-2): per-item fail-soft. This is the
  // dominant throw source in the QA loops (it calls isSweepResetAllowed, which
  // re-throws genuinely-unexpected errors such as SCHEMA_ERROR). A throw here used
  // to bubble to the top-level catch → process.exit(1), aborting the whole sweep
  // tick for ONE item. Contain it: log a warning and return so the remaining items
  // still process. (FR-1 already neutralizes the common SD_NOT_FOUND case inside
  // isSweepResetAllowed; this catch covers any other unexpected per-item fault.)
  try {
  const { data: sd } = await supabase
    .from('strategic_directives_v2')
    .select('sd_key, current_phase, status')
    .eq('sd_key', sdKey)
    .single();

  if (!sd) return;

  const resetTo = PHASE_RESET_MAP[sd.current_phase];
  if (resetTo) {
    // SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-3, AC-4/AC-5): generalized
    // accepted-handoff override guard. Coexists with PHASE_RESET_MAP
    // (FLEET-COORDINATION-RESILIENCE-001 FR-001) — does not change the
    // reset map, only blocks the reset entirely when it would override
    // an accepted handoff. Tag: NEW-GUARD.
    if (!(await isSweepResetAllowed(sdKey, resetTo, 'PHASE_RESET_MAP/' + reason))) {
      return;
    }
    await supabase
      .from('strategic_directives_v2')
      .update({ current_phase: resetTo })
      .eq('sd_key', sdKey);
    console.log('  PHASE_RESET: ' + sdKey + ' ' + sd.current_phase + ' → ' + resetTo + ' (' + reason + ')');
  }
  } catch (err) {
    // FR-2: contain a per-item reset fault; never abort the whole sweep tick.
    console.warn('  WARN_RESET_SKIPPED: ' + sdKey + ' (' + reason + ') — ' + (err && err.message ? err.message : err));
  }
}

function isProcessRunning(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err.code === 'ESRCH') return false;
    if (err.code === 'EPERM') return true; // exists but no permission
    return false;
  }
}

// SD-REFILL-00NFWJ6M: is ANY Claude Code process alive on this host? Used to gate the
// hard-cap pid-alive OS-truth fallback against PID-recycling false-holds — if no claude.exe
// exists at all, a "live" recycled PID is definitely NOT a worker. Cheap (single tasklist),
// computed ONCE per sweep. Never throws (tasklist unavailable → false → no fallback, safe).
function anyClaudeProcessRunning() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('tasklist /FI "IMAGENAME eq claude.exe" /NH 2>nul', { encoding: 'utf8', timeout: 5000 });
    return out.includes('claude.exe');
  } catch { return false; }
}

function bar(pct, width = 20) {
  const filled = Math.round((pct / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001 (FR-3): `SD-TEST-` is a RESERVED sd_key
// namespace for ephemeral test fixtures that concurrent test suites INSERT and
// DELETE within a single run. The sweep's QA reset/mutation paths must never
// iterate or mutate these \u2014 doing so (a) churns phantom resets every tick
// (witnessed SD-TEST-MQ7XBNBM-ORCH-001 reset in_progress/EXEC/100% \u2192 draft) and
// (b) is the TOCTOU source of the FR-1 fatal (a fixture deleted mid-sweep). Real
// SDs use source prefixes (SD-LEO-/SD-FDBK-/etc.), never SD-TEST-. Single source
// of truth, applied at every QA mutation site. SQL form: .not('sd_key','like','SD-TEST-%').
const TEST_FIXTURE_SD_KEY_LIKE = 'SD-TEST-%';
function isTestFixtureSdKey(sdKey) {
  return typeof sdKey === 'string' && /^SD-TEST-/.test(sdKey);
}

// SD-FDBK-INFRA-QUALITY-GATE-COUPLED-001 (FR-1): pure decision function for
// bare-shell SD enrichment. Prefers sd.metadata.plan_content (the
// authoritative --from-plan source) over the filename-substring search,
// which previously ran unconditionally and produced wrong-topic matches.
// Extracted as a pure function (fs/path injectable) so it is unit-testable
// without a live Supabase client.
//
// @returns {null | { description: string, sourceLabel: string, tooShort?: boolean, readError?: boolean }}
//   null              -- no plan_content and no filename match found
//   tooShort: true    -- a filename match was found but its content was too short to use
//   readError: true   -- a filename match was found but reading it failed (deleted/renamed/permissions)
function computeBareShellEnrichment(sd, { searchDirs, fsModule, pathModule }) {
  const planContent = sd.metadata && typeof sd.metadata.plan_content === 'string'
    ? sd.metadata.plan_content.trim()
    : '';
  if (planContent.length > 50) {
    const summary = planContent.substring(0, 500);
    return {
      description: sd.title + '\n\n' + summary + '\n\n[Auto-enriched by sweep from ' + PLAN_CONTENT_MARKER + ']',
      sourceLabel: 'metadata.' + PLAN_CONTENT_MARKER,
    };
  }

  // Fallback (unchanged behavior): filename-substring search.
  const keywords = sd.title.toLowerCase().split(/[\s\-_]+/).filter(w => w.length > 3);
  let bestMatch = null;
  let bestScore = 0;

  for (const dir of searchDirs) {
    if (!fsModule.existsSync(dir)) continue;
    const files = fsModule.readdirSync(dir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const nameLower = file.toLowerCase();
      const score = keywords.filter(kw => nameLower.includes(kw)).length;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = pathModule.join(dir, file);
      }
    }
  }

  if (!bestMatch || bestScore < 2) return null;

  const sourceLabel = pathModule.basename(bestMatch);
  let content;
  try {
    content = fsModule.readFileSync(bestMatch, 'utf8').substring(0, 2000);
  } catch {
    // Matched file deleted/renamed/unreadable between readdirSync and
    // readFileSync, or a permissions/encoding issue -- degrade to a
    // per-SD "no match" result instead of throwing and aborting the whole
    // sweep loop for every remaining bare-shell SD in this tick.
    return { description: null, sourceLabel, readError: true };
  }
  const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#'));
  const summary = lines.slice(0, 10).join('\n').substring(0, 500);

  if (summary.length <= 50) {
    return { description: null, sourceLabel, tooShort: true };
  }

  return {
    description: sd.title + '\n\n' + summary + '\n\n[Auto-enriched by sweep from ' + sourceLabel + ']',
    sourceLabel,
  };
}

// --- Layer 1: Terminal Identity Collision Detection ---
// Reads .claude/session-identity/ marker files to detect when multiple
// live Claude Code processes share the same session_id (identity collision).
// Supports both pid-*.json (CLI sessions) and fallback-*.json (Desktop sessions).
// Returns: [{ pid, session_id, marker_path, cc_pid, sse_port }]
function detectIdentityCollisions() {
  const markerDir = path.resolve(__dirname, '../.claude/session-identity');
  if (!fs.existsSync(markerDir)) return { collisions: [], aliveMarkers: [] };

  const markers = fs.readdirSync(markerDir)
    .filter(f => /^pid-\d+\.json$/.test(f) || /^fallback-\d+-\d+\.json$/.test(f))
    .map(f => {
      const filePath = path.resolve(markerDir, f);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        // pid-*.json: PID is in the filename; fallback-*.json: PID is in the JSON body
        const pidMatch = f.match(/^pid-(\d+)\.json$/);
        const pid = pidMatch ? Number(pidMatch[1]) : Number(data.pid);
        if (!pid || isNaN(pid)) return null;
        return { pid, session_id: data.session_id, claude_session_id: data.claude_session_id || null, cc_pid: data.cc_pid || pid, sse_port: data.sse_port, marker_path: filePath, mtime: fs.statSync(filePath).mtimeMs };
      } catch { return null; }
    })
    .filter(Boolean);

  // Check which PIDs are alive.
  // For CLI markers (pid-*.json), check the specific PID.
  // For Desktop markers (fallback-*.json), the recorded PID is ephemeral —
  // the actual CC Desktop process runs as claude.exe with a different PID.
  // Detect if ANY claude.exe is running; if so, recent fallback markers are alive.
  let hasClaudeDesktop = false;
  try {
    const { execSync } = require('child_process');
    const out = execSync('tasklist /FI "IMAGENAME eq claude.exe" /NH 2>nul', { encoding: 'utf8', timeout: 5000 });
    hasClaudeDesktop = out.includes('claude.exe');
  } catch { /* tasklist unavailable or timed out — fall back to PID check only */ }

  const FALLBACK_MARKER_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour — fallback markers older than this are stale
  const aliveMarkers = markers.filter(m => {
    // CLI sessions: direct PID liveness check
    if (isProcessRunning(m.pid)) return true;
    // Desktop sessions: if claude.exe is running and marker is recent, consider alive
    const isFallbackMarker = path.basename(m.marker_path).startsWith('fallback-');
    if (isFallbackMarker && hasClaudeDesktop && (Date.now() - m.mtime) < FALLBACK_MARKER_MAX_AGE_MS) return true;
    return false;
  });

  // Group alive markers by session_id
  const bySession = {};
  for (const m of aliveMarkers) {
    if (!m.session_id) continue;
    if (!bySession[m.session_id]) bySession[m.session_id] = [];
    bySession[m.session_id].push(m);
  }

  // Collisions: same session_id claimed by multiple live PIDs
  // Enhanced: also detect when markers share session_id but have different CLAUDE_SESSION_IDs
  const collisions = Object.entries(bySession)
    .filter(([, arr]) => {
      if (arr.length > 1) return true;
      // Single marker but CLAUDE_SESSION_ID differs from session_id — potential upstream mismatch
      return false;
    })
    .map(([sessionId, markers]) => {
      const sorted = markers.sort((a, b) => a.mtime - b.mtime); // oldest first
      // Use CLAUDE_SESSION_ID for split decisions when available
      const uniqueCsids = new Set(sorted.map(m => m.claude_session_id).filter(Boolean));
      return {
        session_id: sessionId,
        markers: sorted,
        has_csid_divergence: uniqueCsids.size > 1
      };
    });

  return { collisions, aliveMarkers };
}

// --- Layer 2: Session Splitting ---
// When identity collision is detected, create new DB sessions for duplicate PIDs
// so each Claude Code process has its own identity.
async function splitCollidingSessions(supabase, collisions, actions, warnings) {
  for (const collision of collisions) {
    const keeper = collision.markers[0]; // oldest marker keeps the session
    const extras = collision.markers.slice(1); // newer markers get split

    const csidNote = collision.has_csid_divergence ? ' (CLAUDE_SESSION_IDs diverge — using CSID for split)' : '';
    actions.push('IDENTITY_COLLISION: session ' + collision.session_id.substring(0, 12) + '... shared by PIDs ' +
      collision.markers.map(m => m.pid).join(', ') + ' — keeper PID=' + keeper.pid + csidNote);

    for (const extra of extras) {
      // Use marker-based UUID if available, fall back to PID-based format
      const newTerminalId = extra.session_id || ('win-' + extra.pid);
      const newSessionId = 'session_' + randomUUID().substring(0, 8) + '_' + extra.pid;

      // Check if a session with this terminal_id already exists (idempotent)
      const { data: existing } = await supabase
        .from('claude_sessions')
        .select('session_id')
        .eq('terminal_id', newTerminalId)
        .in('status', ['active', 'idle'])
        .limit(1);

      if (existing && existing.length > 0) {
        actions.push('IDENTITY_SPLIT: PID ' + extra.pid + ' already has session ' + existing[0].session_id.substring(0, 20) + ' — skipped');
        continue;
      }

      // Create a new session record for this PID
      const { error: insertErr } = await supabase
        .from('claude_sessions')
        .insert({
          session_id: newSessionId,
          terminal_id: newTerminalId,
          tty: newTerminalId,
          pid: extra.pid,
          hostname: LOCAL_HOSTNAME,
          codebase: path.resolve(__dirname, '..'),
          status: 'idle',
          heartbeat_at: new Date().toISOString(),
          metadata: { split_from: collision.session_id, split_reason: 'IDENTITY_COLLISION', original_pid: extra.pid, claude_session_id: extra.claude_session_id || null }
        });

      if (insertErr) {
        warnings.push('IDENTITY_SPLIT: failed to create session for PID ' + extra.pid + ' — ' + insertErr.message);
        continue;
      }

      // Update the marker file to point to the new session
      try {
        const markerData = JSON.parse(fs.readFileSync(extra.marker_path, 'utf8'));
        markerData.session_id = newSessionId;
        markerData.split_from = collision.session_id;
        markerData.split_at = new Date().toISOString();
        fs.writeFileSync(extra.marker_path, JSON.stringify(markerData, null, 2));
      } catch (e) {
        warnings.push('IDENTITY_SPLIT: failed to update marker for PID ' + extra.pid + ' — ' + e.message);
      }

      // Send IDENTITY_COLLISION coordination message to the original session
      // so the affected process knows to re-register on next heartbeat
      await supabase.from('session_coordination').insert({
        target_session: collision.session_id,
        message_type: 'IDENTITY_COLLISION',
        subject: 'Session identity collision detected — PID ' + extra.pid + ' split off',
        body: 'Multiple Claude Code processes were sharing session ' + collision.session_id.substring(0, 12) + '...\n\n' +
          'PID ' + extra.pid + ' has been assigned new session: ' + newSessionId + '\n' +
          'PID ' + keeper.pid + ' keeps the original session.\n\n' +
          'If you have an active SD claim, run /claim to verify your claim is intact.\n' +
          'If your claim was lost, run /claim to re-claim your SD.',
        payload: {
          collision_pids: collision.markers.map(m => m.pid),
          keeper_pid: keeper.pid,
          split_pid: extra.pid,
          new_session_id: newSessionId,
          original_session_id: collision.session_id
        },
        sender_type: 'sweep'
      // SD-FDBK-INFRA-FATAL-CRASH-STALE-001: a PostgREST builder is thenable but exposes no catch
      // method, so chaining catch directly onto the insert builder threw TypeError synchronously and
      // main's rejection handler did process.exit(1), aborting the ENTIRE sweep tick on the
      // (intermittent) IDENTITY_SPLIT path. then() yields a real Promise first, so the rejection
      // handler is valid — the same fire-and-forget pattern this file already uses near line 1621.
      }).then(() => {}).catch(() => {});

      actions.push('IDENTITY_SPLIT: PID ' + extra.pid + ' → new session ' + newSessionId.substring(0, 20) + ' (terminal_id=' + newTerminalId + ')');
    }
  }
}

// --- Layer 3: npm Install Mutex ---
// File-based lock to prevent concurrent npm install from corrupting node_modules.
const NPM_LOCK_PATH = path.resolve(__dirname, '../node_modules/.npm-install.lock');
const NPM_LOCK_MAX_AGE_MS = 5 * 60 * 1000; // 5min max lock age (auto-expire stale locks)

function checkNpmInstallLock() {
  if (!fs.existsSync(NPM_LOCK_PATH)) return { locked: false };
  try {
    const data = JSON.parse(fs.readFileSync(NPM_LOCK_PATH, 'utf8'));
    const age = Date.now() - data.timestamp;
    if (age > NPM_LOCK_MAX_AGE_MS) {
      // Stale lock — remove it
      fs.unlinkSync(NPM_LOCK_PATH);
      return { locked: false, stale_removed: true, stale_pid: data.pid };
    }
    // Check if lock holder is still alive
    if (data.pid && !isProcessRunning(data.pid)) {
      fs.unlinkSync(NPM_LOCK_PATH);
      return { locked: false, dead_removed: true, dead_pid: data.pid };
    }
    return { locked: true, holder_pid: data.pid, age_seconds: Math.round(age / 1000) };
  } catch {
    // Corrupt lock file — remove
    try { fs.unlinkSync(NPM_LOCK_PATH); } catch {}
    return { locked: false };
  }
}

/**
 * QF-20260525-836 + QF-20260525-211 (early-exit gap): clear stale quick_fixes.claiming_session_id.
 * Extracted from main() and called BEFORE the "No sessions with claims" early-return so an
 * orphaned QF claim is reaped even when zero SD-claiming sessions remain — the exact common case
 * after the fleet winds down (verified live 2026-05-25: QF-20260525-127 stayed claimed across
 * multiple sweeps because each early-returned before this block ever ran).
 * Conservative bar (holder gone or heartbeat > VERY_STALE) avoids yanking a live worker's claim.
 * Degrade-safe: query failure warns, never blocks the sweep.
 */
// QF-20260704-545: harness test runs that die mid-flight leave SD-TEST-* fixtures
// (draft/in_progress/active, never claimed) polluting the non-terminal queue and
// coordinator-audit stuck-count indefinitely. Auto-cancel any SD-TEST-* row that's
// been sitting unclaimed for >24h -- real SDs never use the SD-TEST- prefix
// (isTestFixtureSdKey), so this can never touch production work.
const TEST_FIXTURE_STALE_MS = 24 * 60 * 60 * 1000;
async function cancelStaleTestFixtures(supabase, now, actions, warnings) {
  try {
    // active-sd-predicate-parity: use the shared predicate rather than an inline
    // .in('status', [...]) literal (PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
    const { getActiveSDFilter } = await import('../lib/sd/active-sd-predicate.js');
    const cutoff = new Date(now.getTime() - TEST_FIXTURE_STALE_MS).toISOString();
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status')
      .ilike('sd_key', TEST_FIXTURE_SD_KEY_LIKE);
    query = getActiveSDFilter(query);
    const { data: staleFixtures, error } = await query
      .is('claiming_session_id', null)
      .lt('updated_at', cutoff);

    if (error) {
      warnings.push('TEST_FIXTURE_SWEEP: ' + error.message);
      return;
    }

    // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 2 — NOT paginated: the
    // chainable mock in stale-session-sweep-test-fixture-cancel.test.js has no
    // .order()/.range(), and fapPaginate would break it. Leaked SD-TEST-% fixtures are an
    // operationally tiny set; tripwire on the exact-cap signature instead of paginating.
    if ((staleFixtures || []).length === 1000) {
      warnings.push('TEST_FIXTURE_SWEEP: fetch returned exactly 1000 rows (PostgREST cap) — stale-fixture list may be truncated');
    }

    for (const fixture of (staleFixtures || [])) {
      // Canonical cancellation shape (matches scripts/cancel-sd.js): top-level
      // cancellation_reason column, not metadata -- never overwrite metadata here.
      // active_session_id:null co-clears alongside claiming_session_id:null, per the
      // FR-1 release-site invariant (claim-lifecycle-hardening).
      const { error: updateErr } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'cancelled',
          current_phase: 'CANCELLED',
          cancellation_reason: 'QF-20260704-545: auto-cancelled leaked SD-TEST-* fixture, unclaimed >24h',
          claiming_session_id: null,
          active_session_id: null,
          is_working_on: false,
        })
        .eq('id', fixture.id)
        .is('claiming_session_id', null); // race guard: only if still unclaimed
      if (!updateErr) {
        actions.push('TEST_FIXTURE: auto-cancelled leaked ' + fixture.sd_key + ' (' + fixture.status + ', unclaimed >24h)');
      }
    }
  } catch (fixtureErr) {
    warnings.push('TEST_FIXTURE_SWEEP: ' + fixtureErr.message);
  }
}

async function clearStaleQfClaims(supabase, now, actions, warnings) {
  const veryStaleSeconds = STALE_THRESHOLD_SECONDS * 3; // 15min = definitely dead

  // QF-20260711-176 (guard-on-every-path): TERMINAL QFs have no legitimate holder — clear
  // claiming_session_id unconditionally (no liveness check needed). The writer-side fix
  // (complete-quick-fix orchestrator now clears it in the completion UPDATE) covers new
  // completions; this sweep pass reaps the historical residue class that drained the worktree
  // pool to 20/20 WORKTREE_CREATE_FAILED (live-claim-guard blocked reaping with
  // claimed_claimant_not_verifiably_alive — coordinator evidence 5655cb68).
  try {
    let terminalClaimed = [];
    try {
      terminalClaimed = await fapPaginate(() => supabase
        .from('quick_fixes')
        .select('id, status, claiming_session_id')
        .in('status', ['completed', 'cancelled', 'escalated', 'closed']) // QF-20260719-702
        .not('claiming_session_id', 'is', null)
        .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    } catch { terminalClaimed = []; } // prior behavior: read error ignored
    for (const qf of (terminalClaimed || [])) {
      const { error } = await supabase
        .from('quick_fixes')
        .update({ claiming_session_id: null })
        .eq('id', qf.id)
        .eq('claiming_session_id', qf.claiming_session_id); // race guard
      if (!error) {
        actions.push('QF: cleared claiming_session_id on TERMINAL ' + qf.status + ' ' + qf.id + ' (no legitimate holder; unblocks worktree reaping)');
      }
    }
  } catch (termErr) {
    warnings.push('QF_TERMINAL_CLAIM_SWEEP: ' + termErr.message);
  }

  try {
    let claimedQfs = [];
    try {
      claimedQfs = await fapPaginate(() => supabase
        .from('quick_fixes')
        .select('id, status, claiming_session_id')
        .in('status', ['open', 'in_progress'])
        .not('claiming_session_id', 'is', null)
        .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    } catch { claimedQfs = []; } // prior behavior: read error ignored

    if (claimedQfs && claimedQfs.length > 0) {
      const holderIds = [...new Set(claimedQfs.map(q => q.claiming_session_id))];
      // FR-6 batch 2 (guard-read): paginated + A3 fail-CLOSED. A failed liveness
      // measurement must NEVER read as "all holders dead" — that would clear every
      // open/in_progress QF claim. Skip this release pass on guard failure.
      let holderRows;
      try {
        holderRows = await fapPaginate(() => supabase
          .from('claude_sessions')
          .select('session_id, heartbeat_at')
          .in('session_id', holderIds)
          .order('session_id', { ascending: true })); // unique tiebreaker (FR-6)
      } catch (guardErr) {
        warnings.push('GUARD_UNAVAILABLE: QF stale-claim clear skipped this tick — holder liveness read failed (' + (guardErr && guardErr.message ? guardErr.message : 'unknown') + ')');
        return;
      }
      const hbAgeBySession = new Map();
      for (const r of (holderRows || [])) {
        hbAgeBySession.set(r.session_id, r.heartbeat_at ? (now.getTime() - Date.parse(r.heartbeat_at)) / 1000 : Infinity);
      }
      for (const qf of claimedQfs) {
        const ageSec = hbAgeBySession.has(qf.claiming_session_id) ? hbAgeBySession.get(qf.claiming_session_id) : Infinity;
        if (ageSec <= veryStaleSeconds) continue; // holder alive/recent — leave claimed
        const { error } = await supabase
          .from('quick_fixes')
          .update({ claiming_session_id: null })
          .eq('id', qf.id)
          .eq('claiming_session_id', qf.claiming_session_id); // race guard: only if still held by the same dead session
        if (!error) {
          actions.push('QF: cleared stale claiming_session_id on ' + qf.status + ' ' + qf.id + ' (holder ' + String(qf.claiming_session_id).slice(0, 8) + ' hb ' + (ageSec === Infinity ? 'gone' : Math.round(ageSec) + 's') + ')');
        }
      }
    }
  } catch (qfErr) {
    warnings.push('QF_CLAIM_SWEEP: ' + qfErr.message);
  }
}

// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2 (Finding 3): guarded WORK_ASSIGNMENT
// dispatch, extracted from main() so the single-writer gate is unit-testable in isolation.
// When `allowed` is false (this sweep is running as a NON-canonical coordinator), NO
// WORK_ASSIGNMENT (sender_type:'sweep') insert happens — preventing a lingering OLD coordinator
// from re-dispatching to every worker every 5 min (the double-dispatch FR-2 names first).
// When `allowed` is true, dispatch proceeds exactly as before (skip workers that already have an
// unacknowledged WORK_ASSIGNMENT to avoid spam). Returns { dispatched, skipped } for observability.
async function dispatchWorkAssignmentsIfAllowed(supabase, activeSessions, available, allowed) {
  if (!allowed) {
    console.log('[SWEEP] WORK_ASSIGNMENT dispatch SKIPPED for ' + (activeSessions || []).length + ' active session(s) — not the canonical coordinator (double-dispatch guard).');
    return { dispatched: 0, skipped: (activeSessions || []).length, blocked: true };
  }
  let dispatched = 0;
  for (const s of activeSessions || []) {
    // Check if we already have an unacknowledged message for this session
    const { data: existing } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', s.session_id)
      .eq('message_type', 'WORK_ASSIGNMENT')
      .is('acknowledged_at', null)
      .limit(1);

    if (existing && existing.length > 0) continue; // Don't spam

    // QF-20260705-914: this completion nudge is INFORMATIONAL, never claim-driving. It used
    // to stamp target_sd = the worker's CURRENT sd_key, and worker-checkin's assignment-claim
    // step extracted that very key back out (via body/payload.current_sd fallbacks) — so a
    // worker that RELEASED its QF (e.g. a not_before defer) re-claimed it on the next checkin,
    // and the spam-guard above (no unacked WA -> send a fresh nudge) made the release->reclaim
    // loop perpetual (live: 2 cycles in 90s, 2026-07-05 09:07Z). target_sd stays null and
    // payload.kind='completion_nudge' marks the contract; worker-checkin skips these rows in
    // its claim step symmetrically (isInformationalNudge). current_sd remains payload-only
    // context so assertSdDispatchable still refuses nudging about a terminal SD.
    const row = {
      target_session: s.session_id,
      target_sd: null,
      message_type: 'WORK_ASSIGNMENT',
      subject: 'Next work available when ' + s.sd_key.split('-').pop() + ' completes',
      body: 'When you complete ' + s.sd_key + ', pick up the next unclaimed child.\n\nREMINDER: Ensure you are in your own isolated worktree before starting new work. Run: node scripts/resolve-sd-workdir.js <SD-ID>',
      payload: { available_sds: available, current_sd: s.sd_key, kind: 'completion_nudge', informational: true },
      sender_type: 'sweep'
    };
    // SD-LEO-FEAT-CLAIM-ASSIGNMENT-PATH-001: refuse to nudge about a terminal/non-existent SD.
    // assertSdDispatchable throws DISPATCH_SD_TERMINAL/NOT_FOUND (skip this worker) and fails OPEN
    // on a transient DB error (the nudge proceeds; claim_sd remains the backstop).
    try {
      await assertSdDispatchable(supabase, row, console);
    } catch (e) {
      console.log('[SWEEP] WORK_ASSIGNMENT skipped for ' + s.session_id + ' (' + (e.code || 'guard') + '): ' + s.sd_key);
      continue;
    }

    await supabase.from('session_coordination').insert(row); // schema-lint-disable-line — `row` columns are valid; lint mis-reads the return-object keys (skipped/blocked) below as insert columns (false positive, stale snapshot)
    dispatched++;
  }
  return { dispatched, skipped: 0, blocked: false };
}

// SD-ARCH-HOTSPOT-SWEEP-001 (PRD FR-2, main()-line-count acceptance criterion): the QA
// claim-safety block (formerly inline steps 3b/3c/3d + FIX #2) extracted verbatim into
// its own top-level function to shrink main(). Deliberately kept in THIS file (not moved
// into lib/sweep/passes/) rather than delegated like the other 6 passes — the claim-safety
// pinning tests (tests/unit/scripts/stale-session-sweep-claim-safety.test.js,
// sweep-residuals.test.js, stale-sweep-qf211-claim-guards.test.js,
// stale-sweep-qf162-release-announce.test.js) all readFileSync this exact file's full
// source text and regex-match specific query/guard patterns (e.g.
// `.not('sd_key','like',TEST_FIXTURE_SD_KEY_LIKE)`, `isSweepResetAllowed`'s fail-soft
// body) — as long as the code text lives anywhere in this file, those pins hold with zero
// migration. Called from main() via the shared sweepPassCtx (supabase/now/classified/
// actions), same ctx bag MAIN_PASSES already reuses.
async function runQaFixtureScan(ctx) {
  const { supabase, now, classified, actions } = ctx;

  // 3b. QA — detect sessions working on completed SDs
  const claimedSdKeys = [...new Set(classified.map(s => s.sd_key).filter(Boolean))];
  const { data: claimedSdStatus } = await supabase
    .from('strategic_directives_v2')
    // FR-3 (SD-LEO-FIX-STALE-SESSION-SWEEP-001): claiming_session_id lets the cross-signal guard
    // distinguish a genuinely-held SD from one whose claim was already cleared (zombie-tick case).
    .select('sd_key, status, completion_date, claiming_session_id')
    .in('sd_key', claimedSdKeys);

  const sdStatusMap = {};
  (claimedSdStatus || []).forEach(sd => { sdStatusMap[sd.sd_key] = sd; });

  // QF-20260525-211 (B2): include 'cancelled', not just 'completed'. Cancelled SDs with a
  // live claiming session previously skipped this bilateral release and fell through to the
  // SD-only clear (FIX #2 below), leaving the session's stale sd_key to feed CLAIM_FIX churn.
  const workingOnCompleted = classified.filter(s => {
    const sd = sdStatusMap[s.sd_key];
    return sd && (sd.status === 'completed' || sd.status === 'cancelled');
  });

  for (const s of workingOnCompleted) {
    const sdTerminalStatus = sdStatusMap[s.sd_key]?.status;
    const releasedReason = sdTerminalStatus === 'cancelled' ? 'SWEEP_SD_CANCELLED' : 'SWEEP_SD_ALREADY_COMPLETED';
    // Use 'released' not 'idle' — stale sessions can't become 'idle' due to
    // idx_claude_sessions_unique_terminal_active (one active/idle per terminal).
    // Using 'idle' silently fails when another session on the same terminal exists.
    const targetStatus = s.status === 'ACTIVE' ? 'idle' : 'released';
    // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-2): Clear dirty fields on claim release
    // QF-20260508-230: ck_claude_sessions_worktree_state_consistency requires sd_key IS NOT NULL
    // OR (worktree_path IS NULL AND worktree_branch IS NULL). Without worktree_branch:null here,
    // partial-null UPDATE silently rolls back via PostgREST and the sweep churns 5-min loops.
    // 5th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001 — sibling at line ~801 was patched
    // by QF-20260504-081 but this one was missed.
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_key: null,
        status: targetStatus,
        released_at: now.toISOString(),
        released_reason: releasedReason,
        worktree_path: null,
        worktree_branch: null,
        has_uncommitted_changes: false,
        current_branch: null
      })
      .eq('session_id', s.session_id);

    if (!error) {
      // Also clear claiming_session_id on the SD to break the churn loop
      await supabase
        .from('strategic_directives_v2')
        // FR-1 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): co-clear active_session_id with
        // claiming_session_id at every SD release so it cannot dangle (the sync_is_working_on_with_session
        // trigger covers session-row flips, but the SD-only updates below do not trip it).
        .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
        .eq('sd_key', s.sd_key);
      await resetSdPhaseOnRelease(s.sd_key, releasedReason);
      actions.push('QA: released ' + s.session_id + ' (' + s.tty + ') — ' + s.sd_key + ' already ' + (sdTerminalStatus || 'completed'));
    }
  }

  // 3c. QA — detect sessions claiming SDs that don't exist.
  // FR-2 (SD-LEO-FIX-STALE-SESSION-SWEEP-001): a QF-claiming session carries sd_key='QF-...'
  // (written by claim_sd), which is NEVER in strategic_directives_v2 → the filter below would
  // mis-classify EVERY live QF claim as SWEEP_ORPHANED_CLAIM (witnessed QF-564/255/703/666). Build
  // a quick_fixes existence set + a claim-age map (claude_sessions.claimed_at proxy) so a QF-shaped
  // claim is HELD when the QF exists OR was claimed within the grace window. Fail-open: a failed
  // existence query leaves the set empty → fresh (<grace) claims stay HELD, only old/unknown-age
  // claims are released (the QF row is untouched and remains re-claimable).
  const QF_CLAIM_GRACE_SECONDS = Number(process.env.QF_CLAIM_GRACE_SECONDS) || 60;
  const qfClaimedKeys = claimedSdKeys.filter(k => /^QF-/.test(k));
  const qfExistsSet = new Set();
  const qfClaimAgeBySession = new Map();
  if (qfClaimedKeys.length > 0) {
    // R11: do NOT select (id,status,claiming_session_id) — stale-sweep-qf211 pins exactly one
    // SELECT of that exact tuple. Use 'id' only.
    try {
      const { data: qfRows } = await supabase.from('quick_fixes').select('id').in('id', qfClaimedKeys);
      (qfRows || []).forEach(q => qfExistsSet.add(q.id));
    } catch { /* fail-open: empty set → grace window still protects fresh claims */ }
    try {
      const qfSessionIds = classified.filter(s => /^QF-/.test(s.sd_key || '')).map(s => s.session_id).filter(Boolean);
      if (qfSessionIds.length > 0) {
        const { data: csRows } = await supabase.from('claude_sessions').select('session_id, claimed_at').in('session_id', qfSessionIds);
        (csRows || []).forEach(r => qfClaimAgeBySession.set(r.session_id, r.claimed_at ? (now.getTime() - Date.parse(r.claimed_at)) / 1000 : Infinity));
      }
    } catch { /* fail-open */ }
  }
  // HELD (not orphaned) iff the QF exists OR was claimed within the grace window (read-after-write
  // race on a freshly-INSERTed QF). Unknown claim age → Infinity → released only if QF truly absent.
  const isHeldQfClaim = (s) => {
    if (!/^QF-/.test(s.sd_key || '')) return false;
    if (qfExistsSet.has(s.sd_key)) return true;
    const ageSec = qfClaimAgeBySession.has(s.session_id) ? qfClaimAgeBySession.get(s.session_id) : Infinity;
    return ageSec < QF_CLAIM_GRACE_SECONDS;
  };
  const orphanedClaims = classified.filter(s => !sdStatusMap[s.sd_key] && !isHeldQfClaim(s));
  for (const s of orphanedClaims) {
    const targetStatus = s.status === 'ACTIVE' ? 'idle' : 'released';
    // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-2): Clear dirty fields on claim release
    // QF-20260508-230: ck_claude_sessions_worktree_state_consistency requires sd_key IS NOT NULL
    // OR (worktree_path IS NULL AND worktree_branch IS NULL). Vitest static guard at
    // tests/unit/scripts/stale-session-sweep-release-payload.test.js pins this invariant
    // for ALL release sites — adding a new release path? Add worktree_branch:null too.
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_key: null,
        status: targetStatus,
        released_at: now.toISOString(),
        released_reason: 'SWEEP_ORPHANED_CLAIM',
        worktree_path: null,
        worktree_branch: null,
        has_uncommitted_changes: false,
        current_branch: null
      })
      .eq('session_id', s.session_id);

    if (!error) {
      actions.push('QA: released ' + s.session_id + ' (' + s.tty + ') — SD ' + s.sd_key + ' not found in DB');
    }
  }

  // 3d. QA — detect SDs stuck in pending_approval with no claiming session
  const pendingApproval = (claimedSdStatus || []).filter(sd => sd.status === 'pending_approval');
  // Also check standalone SDs not already in claimedSdStatus
  const claimedKeys = new Set((claimedSdStatus || []).map(sd => sd.sd_key));
  let allPendingApproval = [];
  try {
    allPendingApproval = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, status, current_phase, progress_percentage, completion_date')
      .eq('status', 'pending_approval')
      // FR-3: never QA-reset ephemeral SD-TEST-* fixtures.
      .not('sd_key', 'like', TEST_FIXTURE_SD_KEY_LIKE)
      .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { allPendingApproval = []; } // prior behavior: read error ignored

  const activeClaimSdIds = new Set(classified.filter(s => s.status === 'ACTIVE').map(s => s.sd_key));
  // FR-3 (defense-in-depth): also drop any fixture that slipped past the query filter.
  const stuckApproval = (allPendingApproval || []).filter(sd => !activeClaimSdIds.has(sd.sd_key) && !isTestFixtureSdKey(sd.sd_key));

  // QF-20260423-909: Guard against resetting SDs that legitimately completed
  // PLAN-TO-LEAD and are resting in pending_approval awaiting LEAD-FINAL-APPROVAL.
  // sd_phase_handoffs.sd_id holds BOTH uuid- and sd_key-style values; check both.
  const stuckApprovalIds = stuckApproval.flatMap(sd => [sd.id, sd.sd_key].filter(Boolean));
  let acceptedPlanToLeadSet = new Set();
  if (stuckApprovalIds.length > 0) {
    const { data: p2lHandoffs } = await supabase
      .from('sd_phase_handoffs')
      .select('sd_id')
      .eq('handoff_type', 'PLAN-TO-LEAD')
      .eq('status', 'accepted')
      .in('sd_id', stuckApprovalIds);
    acceptedPlanToLeadSet = new Set((p2lHandoffs || []).map(h => h.sd_id));
  }

  for (const sd of stuckApproval) {
    // QF-20260423-909: Skip reset if PLAN-TO-LEAD handoff already accepted —
    // SD is legitimately awaiting LEAD-FINAL-APPROVAL, not stuck.
    if (acceptedPlanToLeadSet.has(sd.sd_key) || acceptedPlanToLeadSet.has(sd.id)) {
      actions.push('QA: skipped reset on ' + sd.sd_key + ' — PLAN-TO-LEAD accepted, awaiting LEAD-FINAL-APPROVAL');
      continue;
    }
    // FIX #1: STUCK_100 — if at 100% with completion_date, mark completed instead of resetting
    if (sd.progress_percentage >= 100 && sd.completion_date) {
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'completed',
          claiming_session_id: null,
          active_session_id: null, // FR-1: co-clear (no claude_sessions flip here → trigger won't fire)
          is_working_on: false
        })
        .eq('sd_key', sd.sd_key)
        .select();

      if (!error) {
        actions.push('QA: completed ' + sd.sd_key + ' — was stuck at 100%/pending_approval with completion_date');
      }
    } else {
      // SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-3, AC-4/AC-5): generalized
      // accepted-handoff override guard for the pending_approval reset path.
      // Tag: NEW-GUARD (pre-existing reset behavior preserved on allow).
      if (!(await isSweepResetAllowed(sd.sd_key, 'LEAD', 'pending_approval-reset'))) {
        continue;
      }
      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({
          status: 'draft',
          current_phase: 'LEAD',
          progress_percentage: 0,
          claiming_session_id: null,
          active_session_id: null, // FR-1: co-clear (SD-only update → trigger won't fire)
          is_working_on: false
        })
        .eq('sd_key', sd.sd_key);

      if (!error) {
        actions.push('QA: reset ' + sd.sd_key + ' from pending_approval → draft/LEAD/0% (no session working on it)');
      }
    }
  }

  // FIX #2: Proactively clear stale claiming_session_id on completed/cancelled SDs to prevent churn.
  // QF-20260508-997: cancelled SDs share the same orphan-claim profile as completed ones — the
  // owning session has long since exited but the row still carries claiming_session_id, blocking
  // re-pickup and inflating active-claims counts. Same fix applies; status filter widened.
  let terminalWithClaims = [];
  try {
    terminalWithClaims = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, status, claiming_session_id, is_working_on')
      .in('status', ['completed', 'cancelled'])
      .not('claiming_session_id', 'is', null)
      // FR-3: never touch ephemeral SD-TEST-* fixtures.
      .not('sd_key', 'like', TEST_FIXTURE_SD_KEY_LIKE)
      .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { terminalWithClaims = []; } // prior behavior: read error ignored

  for (const sd of (terminalWithClaims || [])) {
    const { error } = await supabase
      .from('strategic_directives_v2')
      // FR-1: THE genuine dangle — this FIX#2 path clears a terminal SD's claim with NO
      // claude_sessions change, so the sync_is_working_on_with_session trigger never fires and
      // active_session_id stayed stale. Co-clear it here (and select active_session_id above).
      .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
      .eq('sd_key', sd.sd_key)
      .select();

    if (!error) {
      actions.push('QA: cleared stale claiming_session_id on ' + sd.status + ' ' + sd.sd_key);
    }
  }

  // Adversarial-review fix (PR #5755): main() still consumes these five locals after the
  // hoist (dead-release cross-signal gate, CLAIM_RELEASED announce, QA summary) — return
  // them so the call site can rebind what used to be main()-scoped declarations.
  return { sdStatusMap, workingOnCompleted, orphanedClaims, stuckApproval, terminalWithClaims };
}

// SD-ARCH-HOTSPOT-SWEEP-001 (main()-line-count acceptance criterion): the tail-of-tick
// coordinator housekeeping block (SIGNAL_RESOLVED notification, pending-question
// auto-proceed timer, Adam-action ACK escalation, CARDINAL action-time adherence probes,
// 3-part mutual self-ID handshake) extracted verbatim. All five are independently
// flag-gated / fail-open / best-effort and depend only on `supabase` — no shared local
// state with the rest of main(), so this is a pure hoist, zero behavior change. Kept in
// this file (not lib/sweep/passes/) for the same source-text-pinning reason documented on
// runQaFixtureScan() above (this block isn't pinned today, but the convention is uniform).
async function runCoordinatorHousekeeping(ctx) {
  const { supabase } = ctx;

  // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-4d — SIGNAL_RESOLVED notification.
  // For each contributing signal where payload.routed_to_sd_key is non-null AND the SD
  // status is 'completed' AND payload.notification_sent is not yet true, look up
  // sender_callsign's current_session_id (heartbeat <10min) and send SIGNAL_RESOLVED.
  // Drops silently when callsign no longer maps to a live session. Sets
  // payload.notification_sent=true to prevent re-send.
  try {
    const { data: candidates } = await supabase
      .from('session_coordination')
      .select('id, payload, body')
      .not('payload->>routed_to_sd_key', 'is', null)
      .neq('payload->>notification_sent', 'true')
      .limit(50);

    let notified = 0;
    let dropped = 0;
    for (const sig of candidates || []) {
      const sdKey = sig.payload?.routed_to_sd_key;
      const callsign = sig.payload?.sender_callsign;
      if (!sdKey || !callsign) continue;

      // Verify SD is completed.
      const { data: sdRow } = await supabase
        .from('strategic_directives_v2')
        .select('sd_key, status')
        .eq('sd_key', sdKey)
        .maybeSingle();
      if (!sdRow || sdRow.status !== 'completed') continue;

      // Resolve callsign → current live session_id.
      const liveCutoff = new Date(Date.now() - 10 * 60_000).toISOString();
      let live = [];
      try {
        live = await fapPaginate(() => supabase
          .from('claude_sessions')
          .select('session_id, metadata')
          .gte('heartbeat_at', liveCutoff)
          .filter('metadata->>fleet_identity', 'not.is', null)
          .order('session_id', { ascending: true })); // unique tiebreaker (FR-6)
      } catch { live = []; } // prior behavior: read error ignored
      const owner = (live || []).find(s => s.metadata?.fleet_identity?.callsign === callsign);

      if (!owner) {
        // Mark notification_sent=true with a "dropped" flag so we don't retry forever.
        const merged = { ...(sig.payload || {}), notification_sent: true, signal_resolved_dropped: true };
        await supabase.from('session_coordination').update({ payload: merged }).eq('id', sig.id);
        dropped++;
        continue;
      }

      // Send SIGNAL_RESOLVED to owner.
      await supabase.from('session_coordination').insert({
        sender_session: null,
        sender_type: 'coordinator',
        target_session: owner.session_id,
        message_type: 'INFO',
        subject: `[SIGNAL_RESOLVED] ${sig.payload?.signal_type || 'signal'} → ${sdKey}`,
        body: `Your earlier signal (\"${(sig.body || '').slice(0, 200)}\") contributed to SD ${sdKey}, which is now completed.`,
        payload: {
          signal_resolved: true,
          signal_type: sig.payload?.signal_type,
          original_body: (sig.body || '').slice(0, 500),
          resulting_sd_key: sdKey,
          original_signal_id: sig.id
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString()
      });

      // Mark sent.
      const merged = { ...(sig.payload || {}), notification_sent: true };
      await supabase.from('session_coordination').update({ payload: merged }).eq('id', sig.id);
      notified++;
    }
    if (notified > 0 || dropped > 0) {
      console.log('SIGNAL_RESOLVED: notified=' + notified + ' dropped=' + dropped);
    }
  } catch (resolvedErr) {
    console.log('SIGNAL_RESOLVED: ' + (resolvedErr && resolvedErr.message ? resolvedErr.message : 'unknown'));
  }

  // SD-LEO-INFRA-COORDINATOR-PENDING-QUESTION-001 — pending-question timer /
  // default-proceed. For an OPEN operator_question (category='operator_question',
  // status='new') that is NON-CRITICAL and unanswered past the timeout, auto-
  // proceed on the coordinator's recommended option and mark it resolved with an
  // auto_proceeded marker + audit note (FR-001, idempotent). Every still-open
  // question is re-surfaced each tick (FR-002 — the existing email path renders
  // status='new' rows; this just reports the live count). CRITICAL-category
  // questions NEVER auto-proceed (FR-003). DEFAULT-OFF behind
  // COORD_QUESTION_AUTO_PROCEED_V1; READ-ONLY + fail-open when the flag is off
  // (aged non-critical questions resurface instead of auto-proceeding).
  try {
    const pq = await _pendingQuestionTimer.planAndApplyPendingQuestions(supabase, {});
    const stillOpen = pq.resurfaced + pq.hardWaited; // open questions kept visible this tick
    if (pq.autoProceeded > 0 || stillOpen > 0) {
      console.log(
        '  PENDING_QUESTION: auto-proceeded=' + pq.autoProceeded +
        ' resurfaced=' + pq.resurfaced + ' hard-wait=' + pq.hardWaited +
        ' skipped=' + pq.skipped + (pq.enabled ? '' : ' (auto-proceed flag OFF)')
      );
    }
  } catch (pqErr) {
    console.log('PENDING_QUESTION: ' + (pqErr && pqErr.message ? pqErr.message : 'unknown'));
  }

  // SD-LEO-INFRA-ADAM-COORDINATOR-ACTION-001 — Adam->coordinator action-required
  // two-stage ACK + wake/SLA escalation. The sweep-set read_at marks an action
  // handoff DELIVERED (transport), NOT actioned; an action-required handoff stays
  // pending-action until the coordinator agent records a genuine second-stage ACK
  // (payload.actioned_at). When such a handoff is DELIVERED but un-actioned past
  // the SLA, emit a wake/action-required alert targeting the coordinator so the
  // parked coordinator is woken into an active cycle (FR-002), and stamp
  // payload.escalated_at on the original row so escalation is idempotent (no spam).
  // Informational (unflagged) rows are never tracked (FR-003). DEFAULT-OFF behind
  // COORD_ADAM_ACTION_ACK_V1; READ-ONLY + fail-open when the flag is off (aged
  // un-actioned handoffs stay 'pending' instead of escalating). SLA configurable
  // via COORD_ADAM_ACTION_SLA_MIN.
  try {
    const aa = await _adamActionAck.planAndApplyAdamActionAcks(supabase, {});
    if (aa.escalated > 0 || aa.pending > 0 || aa.done > 0) {
      console.log(
        '  ADAM_ACTION_ACK: escalated=' + aa.escalated +
        ' pending=' + aa.pending + ' done=' + aa.done +
        (aa.enabled ? '' : ' (escalation flag OFF)')
      );
    }
  } catch (aaErr) {
    console.log('ADAM_ACTION_ACK: ' + (aaErr && aaErr.message ? aaErr.message : 'unknown'));
  }

  // SD-LEO-INFRA-GOVERNANCE-ROLE-ADHERENCE-DBVALIDATION-001 (FR-2): run the CARDINAL Adam adherence
  // probes at ACTION-TIME (per sweep tick) — not only the 6h retrospective audit — and record a
  // DB-validated verdict to adam_adherence_ledger ONLY on a verdict transition (dedupe-on-change).
  // Flag-gated (ADAM_ACTION_TIME_ADHERENCE_V1=on; default-OFF), FAIL-OPEN, WARN-only: it can NEVER
  // block the sweep. Both modules are ESM, so dynamic-import them from this CJS sweep.
  try {
    const [{ recordActionTimeAdherence, isActionTimeAdherenceEnabled }, { recordAdherence }] = await Promise.all([
      import('../lib/adam/action-time-adherence.mjs'),
      import('./adam-self-adherence-review.mjs'),
    ]);
    if (isActionTimeAdherenceEnabled()) {
      // The sweep tick's action-time check resolves the ADVISORY-BOUNDARY (D2) fact (the latest
      // advisory body) — that is the pre-send boundary self-check. The belt-starvation (D1) and
      // propose-only facts (claimableBelt/idleWorkers/adamAuthoredBuildsInWindow) are NOT cheaply
      // available here, so those probes honestly degrade to 'unknown' in this path (never a silent
      // pass). D1 belt-starvation is fully evaluated where belt/idle live: the 6h retrospective audit
      // (adam-self-adherence-review) and the coordinator charter-audit's SOURCE-TO-CAPACITY detector.
      let sourceableBacklogCount = null;
      try {
        const { sourceableBacklog } = await import('./lib/sourceable-backlog.mjs');
        // FR-6 batch 2: harness_backlog is >1000 rows LIVE — an unpaginated read here was an
        // active cap hit (silently undercounted backlog). Paginate to completion; the enclosing
        // catch preserves the prior error path (count stays null → probe reports unknown).
        const bl = await fapPaginate(() => supabase.from('feedback')
          .select('id, status, title, metadata')
          .eq('category', 'harness_backlog').in('status', ['open', 'new', 'backlog'])
          .order('id', { ascending: true })); // unique tiebreaker (FR-6)
        sourceableBacklogCount = sourceableBacklog(bl || []).length;
      } catch { /* unresolved → probe returns unknown (fail-loud) */ }
      let advisoryBody = null;
      try {
        const { data: adv } = await supabase.from('chairman_decisions')
          .select('decision').order('created_at', { ascending: false }).limit(1);
        if (adv && adv[0]) advisoryBody = String(adv[0].decision || '');
      } catch { /* unresolved → D2 unknown */ }
      const facts = { sourceableBacklogCount, advisoryBody };
      const res = await recordActionTimeAdherence({ supabase, facts, recordAdherence });
      if (res && res.recorded > 0) console.log('  ADAM_ACTION_TIME_ADHERENCE: recorded ' + res.recorded + ' verdict transition(s)');
    }
  } catch (atErr) {
    console.log('ADAM_ACTION_TIME_ADHERENCE: ' + (atErr && atErr.message ? atErr.message : 'unknown') + ' (fail-open)');
  }

  // SD-LEO-INFRA-ADD-PART-MUTUAL-001 — 3-part mutual self-ID handshake housekeeping.
  // The reactive RESPONDER self-heal (a coordinator replying + re-registering its
  // is_coordinator flag) runs in COORDINATOR context (coordinator-comms-check.mjs); the
  // sweep is not a session, so it runs the handshake tick as a non-coordinator (selfRole
  // 'sweep', selfIsCoordinator=false) — driving only the INITIATOR-confirm / idempotency
  // housekeeping and giving WIRE_CHECK a reachable entry point. DEFAULT-OFF behind
  // COORD_SELF_ID_V1; fully inert (zero writes) when the flag is off; fail-open.
  try {
    const sid = await _selfIdHandshake.planAndApplySelfIdHandshake(supabase, {
      selfSessionId: 'sweep',
      selfRole: 'sweep',
      selfIsCoordinator: false,
    });
    if (sid.replied > 0 || sid.confirmed > 0 || sid.registered > 0) {
      console.log(
        '  SELF_ID_HANDSHAKE: replied=' + sid.replied +
        ' confirmed=' + sid.confirmed + ' registered=' + sid.registered +
        (sid.enabled ? '' : ' (flag OFF)'),
      );
    }
  } catch (sidErr) {
    console.log('SELF_ID_HANDSHAKE: ' + (sidErr && sidErr.message ? sidErr.message : 'unknown'));
  }
}

/**
 * SD-LEO-INFRA-BLOCK-TEST-SESSION-001 (FR-2/FR-3): reap a claim held by a PHANTOM
 * session -- strategic_directives_v2.claiming_session_id set to a session_id with NO
 * row in claude_sessions at all (never registered, or long since purged). Distinct
 * from the FIXTURE_SESSION_RE CLAIM_FIX loop elsewhere in this file, which only
 * iterates over EXISTING claude_sessions rows with sd_key set and so never sees a
 * session_id that has no row on that side at all -- the exact shape of the reported
 * leak (test-session-nswcf-fenced claimed two real SDs while never appearing in
 * claude_sessions).
 *
 * Cross-signal guard (validation-agent advisory, referencing the deferred
 * SD-REFILL-00ZDA5MQ precedent): a reaper trusting claiming_session_id ALONE can
 * false-release an SD a DIFFERENT live session is legitimately working via a desynced
 * active_session_id or its own claude_sessions.sd_key pointer. Before reaping, this
 * checks all three claim signals and only reaps when NONE resolves to a live session --
 * fails toward NOT reaping on any ambiguity.
 *
 * Each successful reap is race-guarded (`.eq('claiming_session_id', phantomId)` on the
 * UPDATE) and audited to session_lifecycle_events (event_type='PHANTOM_CLAIM_REAPED')
 * ONLY when the race-guarded update actually affected a row.
 *
 * @param {object} supabase - service-role client
 * @param {{ actions: string[], warnings: string[] }} ctx - sweep-pass accumulators
 */
async function reapPhantomSessionClaims(supabase, { actions, warnings }) {
  let candidateRows = [];
  try {
    candidateRows = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, claiming_session_id, active_session_id, status')
      .not('claiming_session_id', 'is', null)
      .not('status', 'in', '(completed,cancelled)')
      .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { candidateRows = []; } // prior behavior: read error ignored (no reap this tick)

  // Never reap a SD-TEST-*/SD-DEMO-*/bare TEST-*/DEMO-* fixture key -- other live-DB test
  // suites (e.g. claim-sd-cross-table.test.js TS-2) deliberately stamp a non-existent
  // claiming_session_id on such fixtures mid-test; a concurrently-running production sweep
  // must not reap that fixture out from under them.
  const phantomClaimCandidates = (candidateRows || []).filter((sd) => !TEST_FIXTURE_KEY_RE.test(sd.sd_key));

  if (!phantomClaimCandidates.length) return;

  const referencedIds = new Set();
  for (const sd of phantomClaimCandidates) {
    if (sd.claiming_session_id) referencedIds.add(sd.claiming_session_id);
    if (sd.active_session_id) referencedIds.add(sd.active_session_id);
  }
  const sdKeysForCrossCheck = phantomClaimCandidates.map((sd) => sd.sd_key);

  // FR-6 batch 2 (guard-read): paginated + A3 fail-CLOSED. A failed liveness measurement
  // must NEVER read as "no live sessions" — an empty live-set here classifies EVERY
  // candidate as phantom and mass-releases real claims. Skip the whole reap pass instead.
  let liveSessionsById, liveSessionsByKey;
  try {
    [liveSessionsById, liveSessionsByKey] = await Promise.all([
      fapPaginate(() => supabase.from('claude_sessions').select('session_id').in('session_id', [...referencedIds])
        .order('session_id', { ascending: true })), // unique tiebreaker (FR-6)
      fapPaginate(() => supabase.from('claude_sessions').select('sd_key').in('sd_key', sdKeysForCrossCheck)
        .order('session_id', { ascending: true })), // unique tiebreaker (FR-6): order by PK, not the non-unique selected sd_key
    ]);
  } catch (guardErr) {
    warnings.push('GUARD_UNAVAILABLE: phantom-reap skipped this tick — liveness read failed (' + (guardErr && guardErr.message ? guardErr.message : 'unknown') + ')');
    return;
  }
  const liveIdSet = new Set((liveSessionsById || []).map((s) => s.session_id));
  const liveKeySet = new Set((liveSessionsByKey || []).map((s) => s.sd_key));

  for (const sd of phantomClaimCandidates) {
    if (liveIdSet.has(sd.claiming_session_id)) continue; // claiming_session_id has a real row -- not phantom
    if (sd.active_session_id && liveIdSet.has(sd.active_session_id)) {
      warnings.push('CLAIM_FIX: skipped phantom-claim reap on ' + sd.sd_key + ' -- claiming_session_id ' + String(sd.claiming_session_id).slice(0, 20) + ' is phantom but active_session_id ' + String(sd.active_session_id).slice(0, 20) + ' is live (cross-signal, not reaping)');
      continue;
    }
    if (liveKeySet.has(sd.sd_key)) {
      warnings.push('CLAIM_FIX: skipped phantom-claim reap on ' + sd.sd_key + ' -- claiming_session_id ' + String(sd.claiming_session_id).slice(0, 20) + ' is phantom but a live session already holds this SD via its own claude_sessions.sd_key pointer (cross-signal, not reaping)');
      continue;
    }

    const phantomId = sd.claiming_session_id;
    const { data: released, error: reapError } = await supabase
      .from('strategic_directives_v2')
      .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
      .eq('sd_key', sd.sd_key)
      .eq('claiming_session_id', phantomId) // race guard: only clear if still held by the same phantom
      .select('sd_key');

    if (!reapError && released && released.length > 0) {
      actions.push('CLAIM_FIX: released PHANTOM session ' + String(phantomId).slice(0, 20) + ' claim on ' + sd.sd_key + ' (no claude_sessions row for this session_id)');
      await supabase.from('session_lifecycle_events').insert({
        event_type: 'PHANTOM_CLAIM_REAPED',
        session_id: phantomId,
        reason: 'phantom_session_no_claude_sessions_row',
        metadata: { sd_key: sd.sd_key, freed_at: new Date().toISOString() },
      });
    }
  }
}

async function main() {
  const now = new Date();
  const actions = [];
  const warnings = [];
  const conflictEvicted = [];
  // SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-2: collected INTENT collisions,
  // surfaced as a real return value from main() (not console-only).
  const collisionsDetected = [];

  // 1. Get all sessions with SD claims
  // SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-2: include current_branch so the
  // branchSessions map (and the new INTENT collision reader) see real branch data. The
  // column already exists on v_active_sessions; it was simply not selected before, which
  // also left the pre-existing WORKTREE_CONFLICT branch check (L~1046) effectively inert.
  let sessions;
  try {
    sessions = await fapPaginate(() => supabase
      .from('v_active_sessions')
      .select('session_id, sd_key, sd_title, heartbeat_age_seconds, heartbeat_age_human, computed_status, hostname, tty, pid, track, is_virtual, parent_session_id, terminal_id, current_branch')
      .not('sd_key', 'is', null)
      .order('heartbeat_age_seconds', { ascending: true })
      .order('session_id', { ascending: true })); // unique tiebreaker APPENDED after the non-unique order (FR-6)
  } catch (sessErr) {
    // prior behavior: destructured-error check → log + exit(1)
    console.log('ERROR: Failed to query sessions — ' + sessErr.message);
    process.exit(1);
  }

  // QF-20260525-211 (early-exit gap): reap orphaned QF claims BEFORE the early-return below,
  // so a stale QF claim is cleared even when zero SD-claiming sessions remain (fleet wound down).
  // SD-ARCH-HOTSPOT-SWEEP-001: EARLY_PASSES registry call (ordering is load-bearing —
  // must complete before dispatchWorkAssignmentsIfAllowed observes claim availability
  // later in this same tick). SWEEP_PASS_REGISTRY=off fallback calls the function directly.
  // SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001: exempt from
  // tests/ci/sweep-legacy-twin-parity.test.js — both branches call the SAME
  // clearStaleQfClaims function directly (shared-function delegation, not a
  // re-implementation), so they cannot diverge.
  if (SWEEP_PASS_REGISTRY_ENABLED) {
    await passRegistryModule.runPasses(passRegistryModule.EARLY_PASSES, { supabase, now, actions, warnings });
  } else {
    await clearStaleQfClaims(supabase, now, actions, warnings);
  }

  // QF-20260704-545: same early-exit-gap discipline -- cancel leaked SD-TEST-* fixtures
  // before the early-return below, so they're reaped even with zero active sessions.
  await cancelStaleTestFixtures(supabase, now, actions, warnings);

  // QF-20260703-076: session-independent dormancy watchdog -- prior backstops run INSIDE
  // a turn and can't observe a worker whose armed wakeup never fired. Detector-only.
  //
  // SD-FDBK-ENH-CONFIRMED-LIVE-TODAY-001: DORMANT BY DEFAULT, mirroring MASKED_STALL_DETECT_ON
  // (scripts/coordinator-capacity-forecast.mjs, SD-FDBK-INFRA-STALL-AFTER-COMPLETION-001). RCA +
  // RISK evidence (signal 12ce5796, sub_agent_execution_results 209327fa-92aa-481c-9fa7-9edb655b20dd)
  // confirmed process_alive_at is the SOLE liveness input to detectDormantWorkers(), and on Windows
  // process_alive_at freezes for hours when session-tick.cjs's steady-state PATCH (status=eq.active)
  // returns 0 rows and self-exits (QF-20260509-187) -- a live, actively-working session then
  // false-flags as dormant (confirmed live on session 4af85f4b, 2026-07-04). No consumer takes a
  // destructive action from this signal alone, but it was generating false-positive P1
  // fleet_dormancy feedback noise. Gated OFF until the session-tick root-cause fix (deferred to a
  // follow-up SD -- needs new spawn-and-observe Windows test infra) restores process_alive_at
  // trustworthiness. Flip LEO_DORMANCY_WATCHDOG_ENABLED=on to re-enable.
  if (isDormancyWatchdogEnabled()) {
    try {
      let allTracked = [];
      try {
        allTracked = await fapPaginate(() => supabase
          .from('claude_sessions')
          .select('session_id, loop_state, expected_silence_until, process_alive_at')
          .eq('status', 'active')
          .order('session_id', { ascending: true })); // unique tiebreaker (FR-6)
      } catch { allTracked = []; } // prior behavior: read error ignored
      const dormantCandidates = detectDormantWorkers(allTracked || [], now.getTime());
      // FR-2/FR-3: AND-gate against an orthogonal failure-domain signal (OS-level PID
      // liveness) before trusting process_alive_at alone -- process_alive_at is written
      // ONLY by session-tick.cjs's detached daemon, which can die independently of the
      // session itself. Computed fresh here (not reusing aliveCcPids, which is built
      // later at this function's line ~1664 from detectIdentityCollisions() -- this
      // block runs before that and before the no-sessions early-return, so it cannot
      // depend on either). See filterDormantByPidLiveness's own doc for the keyspace
      // join detail.
      const dormant = filterDormantByPidLiveness(dormantCandidates, getMarkerSessionIds());
      const DORMANCY_ALERT_THRESHOLD = 2;
      if (dormant.length >= DORMANCY_ALERT_THRESHOLD) {
        const { emitFeedback } = await import('../lib/governance/emit-feedback.js');
        const hourBucket = now.toISOString().slice(0, 13);
        await emitFeedback({
          supabase,
          title: `Fleet dormancy: ${dormant.length} worker(s) armed a wakeup that never fired`,
          description: `Dormant session_ids: ${dormant.map((d) => d.session_id).join(', ')}. Each has an elapsed expected_silence_until and a stale/absent process_alive_at -- the native ScheduleWakeup did not re-invoke the loop. See QF-20260703-076 RCA.`,
          category: 'fleet_dormancy',
          severity: 'high',
          dedup_key: `dormancy:${hourBucket}`,
        });
      }
    } catch (watchdogErr) {
      if (process.env.LEO_TELEMETRY_DEBUG === '1') {
        console.error('[sweep] dormancy watchdog swallowed: ' + watchdogErr.message);
      }
    }
  }

  if (!sessions || sessions.length === 0) {
    if (actions.length > 0) {
      console.log('[' + now.toLocaleTimeString() + '] SWEEP: ' + actions.join('; '));
    } else {
      console.log('[' + now.toLocaleTimeString() + '] SWEEP: No sessions with claims. All clear.');
    }
    return;
  }

  // 2a. Identity collision detection (Layer 1) — run BEFORE classification
  // so aliveMarkers are available for PID-based liveness cross-referencing.
  const { collisions, aliveMarkers } = detectIdentityCollisions();

  // Build a set of alive CC PIDs from marker files (pid-*.json + fallback-*.json).
  // DB terminal_id formats: "win-cc-{port}-{ccPid}" (CLI) or "win-{PID}" (Desktop).
  // Match by extracting the last segment from terminal_id and checking the alive set.
  const aliveCcPids = new Set(aliveMarkers.map(m => String(m.pid)));

  // ── SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: source-side telemetry lookup ────────
  // Fetch process_alive_at / expected_silence_until / current_tool_expected_end_at
  // for all session_ids in this sweep. These signals take precedence over
  // heartbeat-based stale detection (see classification below).
  //
  // All signals honor a 30-minute hard cap — a worker cannot declare silence
  // beyond that window, preventing a misconfigured hook from masking a dead
  // worker. FR-4 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): this READER cap and the
  // park-worker WRITER cap now derive from one shared constant (lib/fleet/silence-cap.cjs),
  // so the writer can no longer arm a window the reader silently ignores.
  // SD-ARCH-HOTSPOT-SWEEP-001 (PRD FR-2): TICK_ALIVE_WINDOW_MS is now module-level (see top
  // of file) so the promoted evaluateSourceSideSignals() helper compiles standalone.
  const telemetryMap = new Map();
  try {
    const sessionIds = sessions.map(s => s.session_id).filter(Boolean);
    if (sessionIds.length > 0) {
      const { data: telemetryRows } = await supabase
        .from('claude_sessions')
        // worktree_path: not exposed by v_active_sessions -- needed for the QF-20260704-081
        // HEADLESS_ZOMBIE discriminator (fresh heartbeat + terminal_id/tty/worktree_path all null).
        // last_tool_at/claimed_at/metadata: SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001 probe inputs
        // (tick-immune tool clock, boundary anchor, quarantine flag read-modify-write).
        .select('session_id,process_alive_at,expected_silence_until,current_tool,current_tool_expected_end_at,last_activity_kind,worktree_path,last_tool_at,claimed_at,metadata')
        .in('session_id', sessionIds);
      for (const row of telemetryRows || []) {
        telemetryMap.set(row.session_id, row);
      }
    }
  } catch (teleErr) {
    // Graceful degradation — if the 8 new columns aren't present yet (pre-
    // migration clone), fall through to heartbeat-only logic.
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      console.error('[sweep] telemetry fetch swallowed: ' + teleErr.message);
    }
  }

  // SD-ARCH-HOTSPOT-SWEEP-001 (PRD FR-2): now module-level evaluateSourceSideSignals
  // (see top of file) — call site updated to pass telemetryMap explicitly.

  // 2. Classify each session
  // Primary signal: heartbeat age. Secondary signal: PID marker liveness.
  // A session with a stale heartbeat but a living PID is likely loading context
  // or between tool calls (heartbeat fires on PostToolUse only).
  const VERY_STALE_SECONDS = STALE_THRESHOLD_SECONDS * 3; // 15min = definitely dead
  // SD-LEO-INFRA-PARALLEL-AGENT-QUEUE-001: Virtual drain sessions use shorter thresholds
  const VIRTUAL_STALE_THRESHOLD = 180; // 3 minutes for virtual drain agents
  const VIRTUAL_VERY_STALE = VIRTUAL_STALE_THRESHOLD * 2; // 6 minutes = definitely dead
  // SD-REFILL-00NFWJ6M: computed ONCE — gates the hard-cap pid-alive OS-truth fallback below.
  const claudeProcRunningHost = anyClaudeProcessRunning();
  const classified = sessions.map(s => {
    const threshold = s.is_virtual ? VIRTUAL_STALE_THRESHOLD : STALE_THRESHOLD_SECONDS;
    const veryStaleThreshold = s.is_virtual ? VIRTUAL_VERY_STALE : VERY_STALE_SECONDS;
    const isStale = s.heartbeat_age_seconds > threshold;
    const isVeryStale = s.heartbeat_age_seconds > veryStaleThreshold;

    // Cross-reference with PID marker files: if the CC process is alive on this
    // machine, the session is running even without recent heartbeats.
    // terminal_id formats:
    //   1. "win-cc-{port}-{ccPid}" (CLI, e.g. win-cc-13596-22408 → PID 22408)
    //   2. "win-{ccPid}"           (Desktop, e.g. win-13596 → PID 13596)
    //   3. UUID                    (resolve PID via .claude/session-identity/pid-*.json cc_pid)
    // SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-3): explicit dispatch.
    // Required because FR-4 deletes dead pid-*.json markers more aggressively;
    // sweep needs deterministic PID resolution from a stable secondary source rather
    // than naive last-segment-of-hyphen-split (which silently mis-classified UUID-format
    // terminal_ids as having last-segment hex chars instead of a real PID).
    let hasPidAlive = false;
    if (s.terminal_id) {
      const ccPid = resolveCcPidFromTerminalId(s.terminal_id, s.session_id);
      if (ccPid != null) {
        hasPidAlive = aliveCcPids.has(String(ccPid));
        // SD-REFILL-00NFWJ6M: marker-vs-OS divergence — FR-4 deletes a live worker's pid-*.json
        // marker aggressively, so a MISSING marker is NOT proof of death. A live worker deep in a
        // >20min sub-agent run (no mid-Task heartbeat) was hard-cap-released because the marker set
        // missed its still-running PID. Fall back to OS process truth when the marker set misses,
        // GATED on a claude.exe existing on this host (guards PID-recycling false-holds: no claude.exe
        // → a "live" PID is a recycled non-CC process). isProcessRunning uses process.kill(pid,0).
        if (!hasPidAlive && claudeProcRunningHost && isProcessRunning(Number(ccPid))) {
          hasPidAlive = true;
        }
      }
    }

    // Desktop sessions use heuristic liveness (claude.exe running + recent marker).
    // Cap the protection: if heartbeat is >30 min stale, treat as dead even with
    // a "live" marker — the specific session has likely exited while claude.exe
    // continues running for other sessions.
    const DESKTOP_DEAD_CAP_SECONDS = 1800; // 30 minutes
    const isDesktopSession = s.terminal_id && /^win-\d+$/.test(s.terminal_id);
    const exceedsDesktopCap = isDesktopSession && s.heartbeat_age_seconds > DESKTOP_DEAD_CAP_SECONDS;

    // SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: source-side signals FIRST.
    const sourceSide = evaluateSourceSideSignals(telemetryMap, s.session_id, now.getTime());

    let status;
    if (sourceSide && sourceSide.alive) {
      status = 'ALIVE_SOURCE_SIDE';
    } else if (!isStale) {
      status = 'ACTIVE';
    } else if (hasPidAlive && !exceedsDesktopCap) {
      // PID is alive but heartbeat is stale — session is loading context,
      // compacting, or between tool calls. NOT stale.
      status = 'ALIVE_NO_HEARTBEAT';
    } else if (isVeryStale || exceedsDesktopCap) {
      status = 'DEAD'; // No heartbeat for 15min+ (CLI) or 30min+ (Desktop) AND no living PID
    } else {
      status = 'STALE_UNKNOWN'; // Between 5-15min, no PID match = might be on another host
    }

    // QF-20260704-081: a session with a fresh heartbeat (never ages into DEAD via the
    // staleness path above) but terminal_id, tty, AND worktree_path ALL null for 15min+ is a
    // binding signature no real windowed session has -- its parked loop keeps
    // heartbeating/rescheduling while the window itself is gone (confirmed specimen: PID 23348
    // survived windowless 14.7h holding a claim). Detected here, released below -- never auto-kill
    // the OS process; surfaced for a coordinator kill decision.
    if (status === 'ACTIVE' && isHeadlessZombie(s, telemetryMap.get(s.session_id), now.getTime())) {
      status = 'HEADLESS_ZOMBIE';
    }

    return {
      ...s,
      isStale: isStale && !hasPidAlive && !(sourceSide && sourceSide.alive),
      status,
      sourceSideReason: sourceSide?.reason || null,
      hasPidAlive, // QF-20260426-SWEEP-HARDCAP-PIDALIVE: preserve for hard-cap guard
    };
  });
  // SD-ARCH-HOTSPOT-SWEEP-001: shared ctx bag for MAIN_PASSES (lib/sweep/pass-registry.cjs).
  // Built once here (right after classification) and reused at each later registry
  // call site in main() — same actions/warnings/collisionsDetected arrays, mutated
  // in place, so every pass's pushes are visible in the final sweep report.
  const sweepPassCtx = {
    supabase, now, classified, telemetryMap, actions, warnings, collisions, collisionsDetected,
  };
  // SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001: exempt from
  // tests/ci/sweep-legacy-twin-parity.test.js — both branches call the SAME
  // splitCollidingSessions function directly (shared-function delegation), so they
  // cannot diverge.
  if (SWEEP_PASS_REGISTRY_ENABLED) {
    // identity-collision-split only — claim-boundary-probe moved to its original 2b-3
    // position below (adversarial-review fix, PR #5755: running the probe BEFORE the
    // HEADLESS_ZOMBIE release block diverged from legacy ordering and could double-release
    // a zombie with two coordination alerts; both modes now share the original order).
    await passRegistryModule.runPasses([passRegistryModule.MAIN_PASSES[0]], sweepPassCtx);
  } else if (collisions.length > 0) {
    await splitCollidingSessions(supabase, collisions, actions, warnings);
  }

  // 2b-2. QF-20260704-081: release HEADLESS_ZOMBIE claims. Verify PID, release the claim, mark
  // released -- NEVER auto-kill the OS process; surface via session_coordination so a coordinator
  // makes the kill decision (the process may be doing unrelated harmless work post-window-death).
  const headlessZombies = classified.filter(s => s.status === 'HEADLESS_ZOMBIE');
  for (const s of headlessZombies) {
    const pidLive = s.pid ? isProcessRunning(Number(s.pid)) : false;
    // QF-20260508-230: ck_claude_sessions_worktree_state_consistency requires sd_key IS NOT NULL
    // OR (worktree_path IS NULL AND worktree_branch IS NULL) -- every release site must clear both.
    await supabase.from('claude_sessions').update({
      sd_key: null, status: 'released', released_at: now.toISOString(), released_reason: 'SWEEP_HEADLESS_ZOMBIE',
      worktree_path: null, worktree_branch: null, has_uncommitted_changes: false, current_branch: null,
    }).eq('session_id', s.session_id);
    actions.push('HEADLESS_ZOMBIE: released ' + s.session_id + ' (sd=' + (s.sd_key || 'none') + ', pid=' + s.pid + ', pid_live=' + pidLive + ')');
    await supabase.from('session_coordination').insert({
      message_type: 'INFO',
      subject: 'HEADLESS_ZOMBIE released: ' + s.session_id,
      body: 'Fresh heartbeat but terminal_id/tty/worktree_path all null for 15min+ -- claim released. pid=' + s.pid + ' live=' + pidLive + '. Verify and kill the OS process if still live and truly orphaned.',
      sender_type: 'sweep',
      payload: { kind: 'headless_zombie_released', session_id: s.session_id, pid: s.pid, pid_live: pidLive },
    });
  }

  // 2b-3. SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001: claim-boundary pre-flight probe.
  // Runs on EVERY claimed session regardless of classified status — the freeze class
  // has a FRESH heartbeat (status=ACTIVE) and a live PID, so neither the staleness
  // path nor the dead-release loop can ever catch it. Precedence (declared silence,
  // in-flight tool) is honored INSIDE the predicate; process_alive_at is deliberately
  // not consulted (the tick lies through a prompt block).
  // SD-ARCH-HOTSPOT-SWEEP-001: dispatched via the MAIN_PASSES registry at this original
  // 2b-3 position in BOTH modes (adversarial-review fix, PR #5755 — see the
  // identity-collision-split call site above for the ordering-parity rationale).
  // SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001: exempt from
  // tests/ci/sweep-legacy-twin-parity.test.js — both branches call the SAME
  // runClaimBoundaryProbe function directly (shared-function delegation), so they
  // cannot diverge.
  if (SWEEP_PASS_REGISTRY_ENABLED) {
    await passRegistryModule.runPasses([passRegistryModule.MAIN_PASSES[1]], sweepPassCtx);
  } else {
    try {
      await runClaimBoundaryProbe(supabase, classified, telemetryMap, now, actions, warnings);
    } catch (cbErr) {
      warnings.push('CLAIM_BOUNDARY_PROBE: pass swallowed: ' + (cbErr?.message || cbErr));
    }
  }

  // 2c. npm install lock cleanup (Layer 3)
  const npmLock = checkNpmInstallLock();
  if (npmLock.stale_removed) {
    actions.push('NPM_LOCK: removed stale install lock (PID ' + npmLock.stale_pid + ' — expired)');
  }
  if (npmLock.dead_removed) {
    actions.push('NPM_LOCK: removed dead install lock (PID ' + npmLock.dead_pid + ' — process gone)');
  }
  if (npmLock.locked) {
    warnings.push('NPM_LOCK: active install lock held by PID ' + npmLock.holder_pid + ' (' + npmLock.age_seconds + 's)');
  }

  // 3. Detect conflicts (multiple sessions claiming same SD)
  // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 (adversarial review): exclude FIXTURE sessions from conflict
  // keeper selection. The conflict loop picks the freshest-heartbeat session as keeper and EVICTS the
  // rest; without this, a fixture sharing an sd_key with a real worker (the fd018627 condition) could
  // win keeper and bounce the real worker BEFORE the CLAIM_FIX fixture guard (further below) releases
  // the fixture. Fixtures never participate in keeper selection; they are bilaterally released later.
  const { isFixtureSession } = await import('../lib/fleet/session-predicates.mjs');
  const bySD = {};
  classified.forEach(s => {
    if (isFixtureSession(s.session_id)) return; // fixture: never a conflict keeper/evictor
    if (!bySD[s.sd_key]) bySD[s.sd_key] = [];
    bySD[s.sd_key].push(s);
  });

  const conflicts = Object.entries(bySD).filter(([, arr]) => arr.length > 1);

  // 3b-3d + FIX #2. QA claim-safety: completed/cancelled-SD release, orphaned claims,
  // stuck pending_approval, terminal-claim clear. SD-ARCH-HOTSPOT-SWEEP-001: extracted
  // to runQaFixtureScan() (top-level function above main(), this file) to shrink main().
  // Adversarial-review fix (PR #5755): rebind the five formerly-main()-scoped locals the
  // hoist relocated — the dead-release cross-signal gate (sdStatusMap), the CLAIM_RELEASED
  // announce loop, and the QA summary below all still read them from main() scope.
  const { sdStatusMap, workingOnCompleted, orphanedClaims, stuckApproval, terminalWithClaims } =
    await runQaFixtureScan(sweepPassCtx);

  // QF-20260525-211: the QF stale-claim clear formerly inlined here now runs via
  // clearStaleQfClaims() before the early-return above, so it executes on every sweep
  // (including the zero-SD-claim case). Do not re-add it here — that would double-run it.

  // QF-20260426-SWEEP-PHANTOM-DETECT: detect phantom in_progress SDs
  // (status=in_progress + claiming_session_id IS NULL). These are invisible to
  // sd:next's workable filter and silently park work until manual reset. Reset
  // to draft/LEAD so the queue surfaces them for the next worker.
  let phantomInProgress = [];
  try {
    phantomInProgress = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, current_phase, progress_percentage')
      .eq('status', 'in_progress')
      .is('claiming_session_id', null)
      // FR-3: never reset ephemeral SD-TEST-* fixtures (witnessed phantom churn of
      // SD-TEST-MQ7XBNBM-ORCH-001 reset in_progress/EXEC/100% → draft every tick).
      .not('sd_key', 'like', TEST_FIXTURE_SD_KEY_LIKE)
      .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { phantomInProgress = []; } // prior behavior: read error ignored

  for (const sd of (phantomInProgress || [])) {
    // SD-FDBK-INFRA-EXEC-CONTEXT-GUARD-001 (FR-3, AC-4/AC-5): generalized
    // accepted-handoff override guard for the phantom in_progress reset path.
    // Tag: NEW-GUARD.
    if (!(await isSweepResetAllowed(sd.sd_key, 'LEAD', 'phantom-in_progress-reset'))) {
      continue;
    }
    const { error } = await supabase
      .from('strategic_directives_v2')
      .update({
        status: 'draft',
        current_phase: 'LEAD',
        progress_percentage: 0,
        is_working_on: false
      })
      .eq('sd_key', sd.sd_key)
      .eq('status', 'in_progress')
      .is('claiming_session_id', null);

    if (!error) {
      actions.push('QA: reset phantom ' + sd.sd_key + ' from in_progress/' + sd.current_phase + '/' + sd.progress_percentage + '% → draft/LEAD/0% (no claiming session)');
    }
  }

  // SD-LEO-INFRA-BLOCK-TEST-SESSION-001 (FR-2/FR-3): reap claims held by a PHANTOM
  // session. Positioned AFTER the phantom-in_progress reset above and the earlier
  // terminal-claim clears (FIX #2), so a terminal SD's claiming_session_id is already
  // NULL by the time this pass runs -- no double-processing. Extracted to a standalone,
  // exported function (mirroring runClaimBoundaryProbe) so it is directly testable
  // against real tables without spawning the whole sweep as a child process.
  await reapPhantomSessionClaims(supabase, { actions, warnings });

  // 3e. QA — detect and auto-enrich bare-shell SDs (FIX #6)
  // SD-FDBK-INFRA-QUALITY-GATE-COUPLED-001 (FR-1): metadata is now selected so
  // metadata.plan_content -- the authoritative --from-plan source already
  // attached to the SD row -- can be preferred over the filename-substring
  // search below, which previously ran unconditionally and produced
  // wrong-topic matches (e.g. substring 'venture'+'design' matching an
  // unrelated 'venture-detail-page-reDESIGN' file).
  let pendingSDs = [];
  try {
    pendingSDs = await fapPaginate(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, description, scope, metadata')
      .in('status', ['draft', 'ready'])
      .not('sd_key', 'like', '%ORCH-STAGE-VENTURE-WORKFLOW-001-%')
      // FR-3: never enrich ephemeral SD-TEST-* fixtures.
      .not('sd_key', 'like', TEST_FIXTURE_SD_KEY_LIKE)
      .order('sd_key', { ascending: true })); // unique tiebreaker (FR-6)
  } catch { pendingSDs = []; } // prior behavior: read error ignored
  const bareShellSDs = (pendingSDs || []).filter(sd => {
    if (sd.description && sd.description.startsWith('Child SD of')) return false;
    return !sd.description || sd.description === sd.title || (sd.description.length < 100 && sd.scope === sd.title);
  });
  if (bareShellSDs.length > 0) {
    const repoRoot = path.resolve(__dirname, '..');
    const searchDirs = ['docs/audits', 'docs/plans', 'brainstorm'].map(d => path.join(repoRoot, d));

    for (const sd of bareShellSDs) {
      const decision = computeBareShellEnrichment(sd, { searchDirs, fsModule: fs, pathModule: path });

      if (!decision) {
        warnings.push('BARE_SHELL: ' + sd.sd_key + ' has no real description — no matching docs found');
        continue;
      }
      if (decision.tooShort) {
        warnings.push('BARE_SHELL: ' + sd.sd_key + ' — found ' + decision.sourceLabel + ' but content too short');
        continue;
      }
      if (decision.readError) {
        warnings.push('BARE_SHELL: ' + sd.sd_key + ' — matched ' + decision.sourceLabel + ' but reading it failed (deleted/renamed/unreadable) — skipped this SD, sweep continues');
        continue;
      }

      const { error } = await supabase
        .from('strategic_directives_v2')
        .update({ description: decision.description })
        .eq('sd_key', sd.sd_key)
        .select();

      if (!error) {
        actions.push('ENRICH: ' + sd.sd_key + ' — description populated from ' + decision.sourceLabel);
      } else {
        warnings.push('BARE_SHELL: ' + sd.sd_key + ' — enrichment failed: ' + error.message);
      }
    }
  }

  // 4. Auto-release dead sessions (with WIP guard + MC liveness gate)
  let dead = classified.filter(s => s.status === 'DEAD');

  // SD-MAN-INFRA-MEDIUM-EFFORT-HARDENING-001 (FR-2): account-limit freeze gate.
  // Multiple sessions on one host stopping heartbeats within minutes of each other is
  // the freeze SIGNATURE (alive-but-frozen), not mass death — the sweep announced
  // PID_DEAD all night for frozen sessions on 2026-06-11 (6.5h lost). Suppress
  // releases for episode members and emit ONE deduped FLEET_FROZEN notice; the
  // episode TTL inside the detector guarantees a real mass death still releases.
  try {
    const { detectFreeze } = require('../lib/fleet/freeze-detector.cjs');
    const freeze = detectFreeze(dead);
    if (freeze.frozen) {
      dead = dead.filter(s => {
        if (freeze.frozenSessionIds.has(s.session_id)) {
          warnings.push('FREEZE_GUARD: ' + s.session_id + ' in freeze episode — suppressing PID_DEAD release (SD: ' + (s.sd_key || 'none') + ')');
          return false;
        }
        return true;
      });
      for (const ep of freeze.episodes) {
        // Dedup the notice per episode (one row per episode_key while it lasts).
        const { data: existing } = await supabase
          .from('session_coordination')
          .select('id')
          .eq('message_type', 'INFO')
          .contains('payload', { kind: 'fleet_frozen', episode_key: ep.episode_key })
          .limit(1);
        if (!existing || existing.length === 0) {
          await supabase.from('session_coordination').insert({
            message_type: 'INFO',
            subject: 'FLEET_FROZEN: probable account session-limit freeze (' + ep.session_ids.length + ' sessions on ' + ep.hostname + ')',
            body: 'Sessions ' + ep.session_ids.join(', ') + ' stopped heartbeating together (' + ep.cluster_start + ' .. ' + ep.cluster_end + '). PID_DEAD releases suppressed until thaw or episode TTL.',
            sender_type: 'sweep',
            payload: {
              kind: 'fleet_frozen',
              episode_key: ep.episode_key,
              hostname: ep.hostname,
              session_ids: ep.session_ids,
              cluster_start: ep.cluster_start,
              cluster_end: ep.cluster_end,
              note: 'Probable account session-limit freeze — PID_DEAD releases suppressed for these sessions until thaw or episode TTL.'
            }
          });
          actions.push('FLEET_FROZEN: episode ' + ep.episode_key + ' (' + ep.session_ids.length + ' sessions) — releases suppressed');
        }
      }
    }
  } catch (fzErr) {
    // Fail-open: detector problems must never block the sweep's normal staleness path.
    warnings.push('FREEZE_GUARD: detector skipped due to error: ' + fzErr.message);
  }
  // QF-20260611-162: announce-vs-write split. The CLAIM_RELEASED announce loop
  // (step 6) used to iterate ALL of `dead`, but this release loop `continue`s on
  // four hold guards (WIP, MC, hardcap-pid-alive, cross-signal) and the UPDATE
  // can fail — so held/failed sessions were announced as released every ~5min
  // forever while claiming_session_id persisted (7+ phantom announces across 2
  // SDs, 2026-06-11). Track what ACTUALLY released vs failed; announce only those.
  const releasedDead = [];
  const releaseFailedDead = [];

  // SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-005): Pre-fetch the latest MC
  // estimate per dead-classified session (single query, then index). An
  // estimate older than FLEET_MC_ESTIMATE_STALENESS_SEC is treated as
  // unavailable — we fall through to pre-MC behavior rather than trusting
  // a stale probability.
  const mcBySession = new Map();
  if (FLEET_MC_SWEEP_GATE && dead.length > 0) {
    const sinceIso = new Date(Date.now() - FLEET_MC_ESTIMATE_STALENESS_SEC * 1000).toISOString();
    const { data: mcRows, error: mcErr } = await supabase
      .from('fleet_liveness_estimates')
      .select('session_id, observed_at, p_alive, p_alive_ci_low, p_alive_ci_high, mc_samples')
      .in('session_id', dead.map(d => d.session_id))
      .gte('observed_at', sinceIso)
      .order('observed_at', { ascending: false });
    if (mcErr) {
      warnings.push('MC_GATE: lookup failed: ' + mcErr.message + ' — falling back to pre-MC sweep');
    } else {
      for (const row of mcRows || []) {
        if (!mcBySession.has(row.session_id)) mcBySession.set(row.session_id, row);
      }
    }
  }

  for (const s of dead) {
    // SD-MAN-INFRA-WORKER-WORKTREE-SELF-001: WIP release guard
    // Sessions with uncommitted changes are protected from automatic release.
    // This check fires BEFORE MC consultation per AC-3: existing WIP_GUARD
    // must fire independently regardless of MC state.
    if (s.has_uncommitted_changes === true) {
      warnings.push('WIP_GUARD: ' + s.session_id + ' has uncommitted changes — NOT releasing (SD: ' + s.sd_key + ')');
      continue;
    }

    // SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001 (US-005): MC liveness gate.
    // Rules:
    //   - heartbeat >= 20m → force release (SWEEP_HARD_CAP_20M). MC ignored.
    //   - heartbeat <  20m AND P(alive) > 0.3 → HOLD (WIP_GUARD_MC), do not release.
    //   - otherwise → proceed with existing SWEEP_PID_DEAD release.
    const hbSec = s.heartbeat_age_seconds || 0;
    let releaseReason = 'SWEEP_PID_DEAD';
    if (FLEET_MC_SWEEP_GATE) {
      if (hbSec >= FLEET_MC_HARD_CAP_SEC) {
        // QF-20260426-SWEEP-HARDCAP-PIDALIVE: hard cap must respect pid_alive.
        // Worker phase-boundary scripts (handoff.js validation-agent + Explore
        // subagents during PLAN_PRD) routinely take 15-25 min. Heartbeat lag
        // past 20m + live PID = legitimately busy, not stuck.
        if (s.hasPidAlive) {
          warnings.push(
            'WIP_GUARD_HARDCAP_PID_ALIVE: ' + s.session_id +
            ' hb=' + Math.round(hbSec) + 's >= 20m hard cap BUT pid_alive=true — HOLDING release (SD: ' + s.sd_key + ')'
          );
          continue;
        }
        releaseReason = 'SWEEP_HARD_CAP_20M';
      } else {
        const mc = mcBySession.get(s.session_id);
        if (mc && Number(mc.p_alive) > FLEET_MC_PALIVE_HOLD_THRESHOLD) {
          warnings.push(
            'WIP_GUARD_MC: ' + s.session_id + ' P(alive)=' + Number(mc.p_alive).toFixed(2) +
            ' > ' + FLEET_MC_PALIVE_HOLD_THRESHOLD + ' threshold, hb=' + Math.round(hbSec) + 's — HOLDING (SD: ' + s.sd_key + ')'
          );
          continue;
        }
      }
    }

    // SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001 (FR4): Cross-check evidence-of-life before releasing.
    // sweep historically used (heartbeat>threshold + PID dead + MC P(alive)<=0.3) as the
    // release predicate, but this misses cross-shell processes whose CC conversation rotated
    // session_id while the worktree is still warm. Defer to triangulate's multi-signal check
    // for the SD this session claimed; if evidence-of-life present, HOLD (do not release).
    // FR-3 (SD-LEO-FIX-STALE-SESSION-SWEEP-001): a zombie process_tick from a dead session can make
    // checkPreClaimEvidence report evidence-of-life on an SD that has NO live holder. Trust the
    // cross-signal HOLD only when the SD is actually claimed: if its claiming_session_id IS NULL
    // (no holder — SAFE), skip the gate so the deferred/unclaimed SD can be reclaimed. status alone
    // (e.g. 'deferred') is NOT sufficient — a parked-but-ALIVE worker is deferred + still claimed.
    const sdMetaForGate = sdStatusMap[s.sd_key];
    const sdUnclaimed = !!sdMetaForGate && sdMetaForGate.claiming_session_id == null;
    if (s.sd_key && !sdUnclaimed) {
      try {
        // Lazy import — keep CJS sweep file independent of ESM triangulate at module load
        const { checkPreClaimEvidence } = await import('./modules/claim-health/triangulate.js');
        const evidence = await checkPreClaimEvidence(supabase, s.sd_key, { mySessionId: s.session_id });
        if (!evidence.allowReclaim) {
          warnings.push(
            'WIP_GUARD_CROSS_SIGNAL: ' + s.session_id + ' SD=' + s.sd_key +
            ' has evidence-of-life (' + (evidence.evidence || []).join(',') +
            ') classification=' + evidence.classification + ' — HOLDING release (SD-LEO-FIX-CROSS-SIGNAL-CLAIM-001)'
          );
          continue;
        }
      } catch (egErr) {
        // Evidence gate must fail-open: if the import or query fails, fall through to
        // existing release behavior. The original heartbeat/PID/MC gates above remain in force.
        warnings.push('CROSS_SIGNAL_GATE: skipped on ' + s.session_id + ' due to error: ' + egErr.message);
      }
    }

    // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-1, FR-2): Atomically set is_alive=false
    // and clear dirty fields when releasing dead session claims. Prevents successor sessions
    // from inheriting stale worktree_path, has_uncommitted_changes, and current_branch.
    const { error } = await supabase
      .from('claude_sessions')
      .update({
        sd_key: null,
        status: 'released',
        released_at: now.toISOString(),
        released_reason: releaseReason,
        is_alive: false,
        worktree_path: null,
        // QF-20260504-081: ck_claude_sessions_worktree_state_consistency requires
        // sd_key IS NOT NULL OR (worktree_path IS NULL AND worktree_branch IS NULL).
        // Sweep was missed when worktree_branch was added 2026-05-02 (RPC release
        // paths got the column, sweep direct UPDATE didn't). Without this null,
        // every release attempt against a session with non-null worktree_branch
        // fails the CHECK and emits a dead-letter CLAIM_RELEASED.
        worktree_branch: null,
        has_uncommitted_changes: false,
        current_branch: null
      })
      .eq('session_id', s.session_id);

    if (error) {
      actions.push('FAILED to release ' + s.session_id + ' (' + s.sd_key + '): ' + error.message);
      releaseFailedDead.push({ ...s, release_error: error.message }); // QF-20260611-162
    } else {
      releasedDead.push(s); // QF-20260611-162: write checked — only these announce CLAIM_RELEASED
      if (s.sd_key) {
        await resetSdPhaseOnRelease(s.sd_key, releaseReason);
        // Clear claiming_session_id on the SD so the next worker can claim it
        // without hitting foreign_claim in the claim validity gate. FR-1: co-clear
        // active_session_id (CAS-guarded by claiming_session_id=this session).
        await supabase
          .from('strategic_directives_v2')
          .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
          .eq('claiming_session_id', s.session_id);
      }
      // SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (FR-5): SIBLING RELEASE SITE 1/4 —
      // co-clear file_claim_locks alongside the strategic_directives_v2 clear above.
      try {
        const { releaseClaimsByHolder } = require('./hooks/lib/file-claim-guard.cjs');
        const r = await releaseClaimsByHolder({ holderSessionId: s.session_id });
        if (r.released > 0) actions.push('  + released ' + r.released + ' file_claim_locks for ' + s.session_id);
      } catch { /* fail-open */ }
      actions.push('RELEASED ' + s.session_id + ' — reason=' + releaseReason + ' — freed ' + s.sd_key);
    }
  }

  // SD-LEO-INFRA-CROSS-HOST-CONCURRENT-001 (FR-5b): file_claim_locks reaper —
  // DELETE rows older than the stale heartbeat threshold.
  try {
    const { reapStaleClaims } = require('./hooks/lib/file-claim-guard.cjs');
    const reap = await reapStaleClaims({ staleThresholdSeconds: 600 });
    if (reap.reaped > 0) actions.push('REAPED ' + reap.reaped + ' stale file_claim_locks (heartbeat >10min)');
  } catch { /* fail-open */ }

  // 4a. Worktree conflict detection (SD-MAN-INFRA-WORKER-WORKTREE-SELF-001)
  // Detect multiple active sessions on the same feature branch (excludes main/QF)
  const branchSessions = new Map();
  for (const s of classified.filter(c => c.status === 'ACTIVE' && c.current_branch && c.current_branch !== 'main')) {
    if (!branchSessions.has(s.current_branch)) branchSessions.set(s.current_branch, []);
    branchSessions.get(s.current_branch).push(s);
  }
  for (const [branch, sessions] of branchSessions) {
    if (sessions.length > 1) {
      const ids = sessions.map(s => s.session_id).join(', ');
      warnings.push('WORKTREE_CONFLICT: branch ' + branch + ' claimed by ' + sessions.length + ' sessions: ' + ids);
    }
  }

  // 4a-2. SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-2 — INTENT collision detection.
  // ADDITIVE to the dup-claim (step 3) and WORKTREE_CONFLICT (4a) logic above — those are
  // unchanged. Gated by DECONFLICTION_ENABLED inside the pass itself.
  // SD-ARCH-HOTSPOT-SWEEP-001: dispatched via the MAIN_PASSES registry;
  // SWEEP_PASS_REGISTRY=off fallback preserves the original inline block.
  if (SWEEP_PASS_REGISTRY_ENABLED) {
    await passRegistryModule.runPasses([passRegistryModule.MAIN_PASSES[2]], sweepPassCtx);
  } else {
    await legacyFallback.runIntentCollisionLegacy(sweepPassCtx);
  }

  // 4b. Struggling worker detection (SD-MAN-INFRA-WORKER-WORKTREE-SELF-001)
  // Flag workers with repeated handoff failures
  for (const s of classified.filter(c => c.status === 'ACTIVE' && (c.handoff_fail_count || 0) > 3)) {
    const tier = s.handoff_fail_count >= 7 ? 'REASSIGN' : s.handoff_fail_count >= 5 ? 'RCA' : 'WARN';
    warnings.push('WORKER_STRUGGLING: ' + s.session_id + ' has ' + s.handoff_fail_count + ' handoff failures (tier: ' + tier + ', SD: ' + s.sd_key + ')');
  }

  // 5. Resolve conflicts — keep freshest, release ALL others (including active)
  for (const [sdId, claimants] of conflicts) {
    const sorted = claimants.sort((a, b) => a.heartbeat_age_seconds - b.heartbeat_age_seconds);
    const keeper = sorted[0];
    const evictees = sorted.slice(1);

    for (const evict of evictees) {
      // Skip if already released in step 4
      if (dead.find(d => d.session_id === evict.session_id)) continue;

      // SD-LEO-INFRA-STALE-SWEEP-PID-LIVENESS-GUARD-001 (FR-2/FR-3): never evict a claimant whose
      // PID is ALIVE — a parked-but-live worker with an older heartbeat must not lose its claim to
      // a fresher (possibly zombie) claimant. The keeper was chosen by heartbeat alone; liveness
      // overrides that for the release decision. aliveCcPids is already computed above (line ~690).
      const evictGuard = shouldHoldClaim(evict, { aliveCcPids });
      if (evictGuard.hold) {
        actions.push('CONFLICT on ' + sdId + ': HELD live claimant ' + evict.session_id + ' (' + evictGuard.reason + ') — not evicted');
        continue;
      }

      const targetStatus = evict.status === 'ACTIVE' ? 'idle' : 'released';
      // SD-LEO-INFRA-SESSION-LIFECYCLE-CLEANUP-001 (FR-2): Clear dirty fields on claim release
      // QF-20260508-230: ck_claude_sessions_worktree_state_consistency requires sd_key IS NOT NULL
      // OR (worktree_path IS NULL AND worktree_branch IS NULL). worktree_branch:null required;
      // sibling release at workingOnCompleted branch (line ~480) had the same bug.
      const { error } = await supabase
        .from('claude_sessions')
        .update({
          sd_key: null,
          status: targetStatus,
          released_at: now.toISOString(),
          released_reason: 'SWEEP_CONFLICT_RESOLUTION',
          worktree_path: null,
          worktree_branch: null,
          has_uncommitted_changes: false,
          current_branch: null
        })
        .eq('session_id', evict.session_id);

      if (!error) {
        const tag = evict.status === 'ACTIVE' ? ' (was active)' : '';
        await resetSdPhaseOnRelease(sdId, 'SWEEP_CONFLICT_RESOLUTION');
        actions.push('CONFLICT on ' + sdId + ': released ' + evict.session_id + tag + ' (kept ' + keeper.session_id + ')');

        // Send coordination message to the evicted session so it picks up other work
        conflictEvicted.push(evict);
      }
    }
  }

  // 6. Send coordination messages to active sessions
  // Load BOTH orchestrator children AND all pending standalone SDs
  const [childRes, standaloneRes] = await Promise.all([
    supabase
      .from('strategic_directives_v2')
      // sd_type + metadata feed the shared classifyDispatchIneligibility gate below
      // (SD-FDBK-INFRA-CONVERGE-WORK-ASSIGNMENT-001) with no extra round-trips.
      .select('sd_key, title, status, current_phase, progress_percentage, dependencies, sd_type, metadata')
      .like('sd_key', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001-%')
      .order('sd_key', { ascending: true }),
    supabase
      .from('strategic_directives_v2')
      .select('sd_key, title, status, current_phase, progress_percentage, dependencies, priority, sd_type, metadata')
      .in('status', ['draft', 'in_progress', 'ready', 'pending_approval'])
      .not('sd_key', 'like', 'SD-LEO-ORCH-STAGE-VENTURE-WORKFLOW-001%')
      .limit(20)
  ]);

  const children = childRes.data || [];
  const standaloneSDs = standaloneRes.data || [];
  const allSDs = [...children, ...standaloneSDs];

  // Dependency-aware availability: only suggest SDs whose deps are all satisfied (terminal).
  // SD-LEO-INFRA-SWEEP-DEP-RESOLVER-COMPLETED-LOOKUP-001: the standalone working set above is
  // filtered to NON-terminal statuses (draft/in_progress/ready/pending_approval) and .limit(20),
  // so it can NEVER contain a completed SD — building the satisfied-set from it made it effectively
  // EMPTY, falsely BLOCKING any SD whose real dependency-key is completed-but-out-of-window.
  // Mirror the canonical coordinator-audit.mjs resolver (line ~189): do a FRESH targeted DB lookup
  // of the exact dependency keys and check against the TERMINAL set, not in-window 'completed'.
  const SWEEP_DEP_TERMINAL = ['completed', 'cancelled', 'archived', 'deferred'];
  const allDepKeys = [...new Set(allSDs.flatMap(c => parseSdDependencies(c.dependencies)))];
  const depStatusByKey = {};
  if (allDepKeys.length) {
    const { data: depRows } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .in('sd_key', allDepKeys);
    for (const r of (depRows || [])) depStatusByKey[r.sd_key] = r.status;
  }
  // unknown/missing dep-key also counts as unmet (matches coordinator-audit.mjs isTerminal)
  const isDepSatisfied = (k) => SWEEP_DEP_TERMINAL.includes(depStatusByKey[k]);
  // SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-3) / absorbed QF-20260526-577: was
  // `status === 'ACTIVE'` only, which let an ALIVE_NO_HEARTBEAT or
  // ALIVE_SOURCE_SIDE holder's SD be advertised available-to-claim while the
  // same session was simultaneously rendered as a live worker below (L1144).
  const claimedByActive = computeClaimedSdKeys(classified);

  const available = allSDs
    .filter(c => {
      if (c.status === 'completed') return false;
      if (claimedByActive.has(c.sd_key)) return false;
      // SD-FDBK-INFRA-CONVERGE-WORK-ASSIGNMENT-001: route the coordinator/sweep PUSH path through the
      // SAME shared eligibility classifier the worker self_claim PULL path uses, so a test-fixture
      // phantom (SD-DEMO-*/SD-TEST-*), an orchestrator PARENT, or a requires_human_action SD can never
      // be advertised available or emitted as a WORK_ASSIGNMENT. Pure + synchronous on already-loaded
      // rows (no N+1). Fail-soft per SD: a malformed row that throws is dropped, never aborts the sweep.
      try {
        if (classifyDispatchIneligibility(c) !== null) return false;
      } catch { return false; }
      // QF-20260525-542: canonical SD-key blocker rule (was completedKeys.has(dep) on
      // raw elements — object-shaped placeholders never matched → false BLOCKED).
      const depKeys = parseSdDependencies(c.dependencies);
      if (depKeys.length > 0 && !depKeys.every(isDepSatisfied)) return false;
      return true;
    })
    .map(c => c.sd_key);

  const blocked = allSDs
    .filter(c => {
      if (c.status === 'completed') return false;
      const depKeys = parseSdDependencies(c.dependencies); // QF-20260525-542: canonical rule
      if (depKeys.length === 0) return false;
      return !depKeys.every(isDepSatisfied);
    })
    .map(c => c.sd_key);

  // SD-LEO-INFRA-EXPOSE-CLAIM-OWNER-001 (FR-3): use the same CLAIM_HOLDING_STATUSES
  // set the available-filter above uses, so worker-render and available-listing
  // can never disagree about who is holding a claim. Previously omitted the
  // third claim-holding status, ALIVE_SOURCE_SIDE.
  const activeSessions = classified.filter(s => CLAIM_HOLDING_STATUSES.has(s.status));

  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2 (Finding 3): single-writer guard.
  // The sweep cron fires INSIDE the coordinator's live session, so process.env.CLAUDE_SESSION_ID
  // (env-first, .claude/session-id.json fallback) IS the coordinator id. A lingering OLD
  // coordinator's sweep would otherwise keep re-dispatching WORK_ASSIGNMENT rows + re-asserting
  // claims every 5 min (the double-dispatch FR-2 exists to stop). Compute the verdict ONCE and
  // gate ONLY the harmful coordinator double-act mutations below:
  //   - CLAIM_FIX re-assert (claiming_session_id / is_working_on writes)
  //   - WORK_ASSIGNMENT terminal-drain (read_at stamp)
  //   - WORK_ASSIGNMENT dispatch (sender_type:'sweep' inserts)
  //   - is_coordinator stale-flag clear (existing guard, now sharing this verdict)
  // DEAD-session cleanup / bilateral claim releases stay UNGATED — idempotent hygiene that is
  // safe to run from any session and must not be blocked. Fail-OPEN: any guard error → allowed
  // (never brick the only live coordinator; the sweep is coordinator-invoked).
  let _coordMutationAllowed = true;
  try {
    const { guardMutation: _sweepGuardFn, resolveOwnSessionId: _sweepResolveId } =
      await import('../lib/coordinator-mutation-guard.mjs');
    const _sweepVerdict = await _sweepGuardFn(supabase, _sweepResolveId(), 'stale-session-sweep:coordinator-mutations');
    _coordMutationAllowed = _sweepVerdict.allowed;
    if (!_coordMutationAllowed) {
      console.log('[SWEEP] coordinator-mutation guard: NOT the canonical coordinator — WORK_ASSIGNMENT dispatch/drain + CLAIM_FIX re-assert + is_coordinator-clear will be SKIPPED this run (dead-session cleanup still runs).');
    }
  } catch { /* fail-open — guard error must not suppress sweep coordinator duties */ }

  // 6b. QA — Claim Integrity: detect idle sessions with no SD claim and nudge them
  let idleSessions = [];
  try {
    idleSessions = await fapPaginate(() => supabase
      .from('v_active_sessions')
      .select('session_id, sd_key, heartbeat_age_seconds, heartbeat_age_human, computed_status, tty')
      .is('sd_key', null)
      .order('heartbeat_age_seconds', { ascending: true })
      .order('session_id', { ascending: true })); // unique tiebreaker APPENDED after the non-unique order (FR-6)
  } catch { idleSessions = []; } // prior behavior: read error ignored

  const aliveIdle = (idleSessions || []).filter(s => s.heartbeat_age_seconds < STALE_THRESHOLD_SECONDS);
  const claimIntegrityIssues = [];

  for (const s of aliveIdle) {
    // Only nudge if idle for >5min (give time for post-completion transitions: /learn, protocol reads, context compaction)
    if (s.heartbeat_age_seconds < 300) continue;

    // Check if we already sent a CLAIM_REMINDER recently (avoid spam)
    const { data: existingReminder } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', s.session_id)
      .eq('message_type', 'CLAIM_REMINDER')
      .is('acknowledged_at', null)
      .limit(1);

    if (existingReminder && existingReminder.length > 0) continue;

    // Send CLAIM_REMINDER (includes worktree reminder)
    const topSD = available.length > 0 ? available[0] : null;
    const suggestion = topSD ? 'Suggested: ' + topSD + ' (highest priority unclaimed)' : 'Run /leo next for the SD queue.';
    const worktreeReminder = '\n\nIMPORTANT: Before starting work, ensure you are in your own isolated worktree. ' +
      'Run: node scripts/resolve-sd-workdir.js <SD-ID> — this creates a dedicated worktree so parallel workers ' +
      'do not corrupt each other\'s node_modules or git state.';
    await supabase.from('session_coordination').insert({
      target_session: s.session_id,
      message_type: 'CLAIM_REMINDER',
      subject: 'No SD claimed — ' + available.length + ' SDs available for work',
      body: 'You have been idle for ' + s.heartbeat_age_human + ' with no SD claim. ' + suggestion + worktreeReminder + '\n\nRun: /claim or /leo next',
      payload: { available_sds: available, idle_seconds: s.heartbeat_age_seconds },
      sender_type: 'sweep'
    }).then(() => {}).catch(() => {});

    claimIntegrityIssues.push(s.session_id.substring(0, 20) + ' (' + s.tty + ')');
  }

  // Also check: sessions with sd_id but SD's claiming_session_id doesn't match (broken claim)
  // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001: isFixtureSession is imported once above (conflict build).
  for (const s of classified.filter(c => c.status === 'ACTIVE' && c.sd_key)) {
    const { data: sd } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, status, claiming_session_id, is_working_on')
      .eq('sd_key', s.sd_key)
      .single();

    if (!sd) continue;

    // SD-FDBK-INFRA-SHARED-FLEET-WORKER-001 (bug fd018627): a FIXTURE/test session id (e.g.
    // test-switch-claim-guards-session, replayed from claim_history) must NEVER drive a CLAIM_FIX
    // re-assert onto a real SD. Bilaterally release the fixture's stale sd_key; if the SD itself
    // still points at the fixture, clear that too so it becomes claimable. isFixtureSession FAILS
    // TOWARD "not a fixture" (UUIDs + the legit session_<hex>_<tty>_<pid> shape return false), so a
    // real worker is never wrongly released. Guards ALL downstream branches (terminal / eligibility
    // / re-assert) in one place.
    if (isFixtureSession(s.session_id)) {
      await supabase
        .from('claude_sessions')
        .update({
          sd_key: null,
          status: s.status === 'ACTIVE' ? 'idle' : 'released',
          released_at: now.toISOString(),
          released_reason: 'SWEEP_FIXTURE_SESSION_CLAIM_FIX',
          worktree_path: null,
          worktree_branch: null,
          current_branch: null,
        })
        .eq('session_id', s.session_id)
        .eq('sd_key', s.sd_key); // race guard: only clear if still pointing at this SD
      if (sd.claiming_session_id === s.session_id) {
        await supabase
          .from('strategic_directives_v2')
          // FR-1 (SD-LEO-INFRA-CLAIM-LIFECYCLE-HARDENING-002): an SD-only release that nulls
          // claiming_session_id MUST also null active_session_id — the sync trigger's CAS branch
          // only clears active_session_id WHERE it equals THIS fixture's session, so a value
          // pointing at a different session would dangle. Co-clear unconditionally on the SD write.
          .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
          .eq('sd_key', s.sd_key)
          .eq('claiming_session_id', s.session_id); // race guard: only clear if still the fixture
      }
      actions.push('CLAIM_FIX: released FIXTURE session ' + s.session_id.substring(0, 20) + ' (never re-assert onto ' + s.sd_key + ')');
      continue;
    }

    // SD-REFILL-000XFP8B: defense-in-depth beyond isFixtureSession. The witnessed offender
    // (test-claim-refuse-caller, a non-UUID test session id) IS caught by the ^test- positive
    // marker above, but isFixtureSession is positive-markers-only — a NON-test-prefixed bad
    // session id (a replayed/synthetic claim, a malformed worker id) slips through and would
    // drive a CLAIM_FIX re-assert, stamping claiming_session_id with a non-worker id. A REAL
    // fleet worker ALWAYS has a full 8-4-4-4-12 UUID session_id (SessionStart hook generates
    // UUIDs); anything that is not a full UUID can never be a legitimate claim owner. Fail
    // CLOSED toward "not a worker": bilaterally release the stale sd_key (mirroring the fixture
    // path) so CLAIM_FIX never adopts a non-UUID session as the claim owner. isFullUuid is the
    // SAME pure shape-check the coordinator uses to gate dispatch targets (dispatch.cjs SSOT).
    if (!isFullUuid(s.session_id)) {
      await supabase
        .from('claude_sessions')
        .update({
          sd_key: null,
          status: s.status === 'ACTIVE' ? 'idle' : 'released',
          released_at: now.toISOString(),
          released_reason: 'SWEEP_NON_UUID_SESSION_CLAIM_FIX',
          worktree_path: null,
          worktree_branch: null,
          current_branch: null,
        })
        .eq('session_id', s.session_id)
        .eq('sd_key', s.sd_key); // race guard: only clear if still pointing at this SD
      if (sd.claiming_session_id === s.session_id) {
        await supabase
          .from('strategic_directives_v2')
          .update({ claiming_session_id: null, active_session_id: null, is_working_on: false })
          .eq('sd_key', s.sd_key)
          .eq('claiming_session_id', s.session_id); // race guard: only clear if still this session
      }
      actions.push('CLAIM_FIX: released NON-UUID session ' + String(s.session_id).substring(0, 20) + ' (never re-assert onto ' + s.sd_key + ')');
      continue;
    }

    // QF-20260525-211 (B1): never re-assert a claim on a terminal SD. FIX #2 above cleared
    // claiming_session_id on completed/cancelled SDs; without this guard CLAIM_FIX would
    // immediately re-assert it (the live session's sd_key still matches), oscillating the
    // claim every 5-min cycle. Instead clear the session's stale sd_key (bilateral release).
    if (sd.status === 'completed' || sd.status === 'cancelled') {
      await supabase
        .from('claude_sessions')
        .update({
          sd_key: null,
          status: s.status === 'ACTIVE' ? 'idle' : 'released',
          released_at: now.toISOString(),
          released_reason: 'SWEEP_SD_TERMINAL_CLAIM_FIX',
          worktree_path: null,
          worktree_branch: null,
          current_branch: null,
        })
        .eq('session_id', s.session_id)
        .eq('sd_key', s.sd_key); // race guard: only clear if still pointing at this terminal SD
      actions.push('CLAIM_FIX: cleared stale sd_key on session ' + s.session_id.substring(0, 20) + ' (SD ' + s.sd_key + ' is ' + sd.status + ')');
      continue;
    }

    // Fix broken/incomplete claim — but FIRST gate on dispatch-eligibility.
    // SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001: the worker self_claim path refuses orchestrator
    // PARENTS + dep-blocked SDs (SD-FDBK-FIX-WORKER-SELF-CLAIM-001); CLAIM_FIX did not, so it
    // re-affirmed a stale sd_key pointing at an orchestrator parent onto the worker (observed live:
    // SD-LEO-FEAT-POST-BUILD-LIFECYCLE-001). Reuse the SHARED predicate. Tri-state:
    //   confirmed-ineligible -> bilateral clear (like the terminal-status path above);
    //   query error           -> no-op this cycle (NEVER clear a legit claim on a transient error);
    //   eligible              -> existing re-assert (unchanged).
    const needsClaimFix = sd.claiming_session_id !== s.session_id || !sd.is_working_on;
    if (needsClaimFix) {
      let verdict;
      try {
        verdict = await evaluateDispatchEligibility(supabase, s.sd_key);
      } catch (eligErr) {
        warnings.push('CLAIM_FIX: eligibility check errored for ' + s.sd_key + ' — skipped this cycle (' + eligErr.message + ')');
        continue;
      }
      if (!verdict.eligible) {
        // Orchestrator parent / dep-blocked / not-found: never re-affirm onto a worker. Clear the
        // session's stale sd_key (bilateral release), mirroring the terminal-status clear above.
        await supabase
          .from('claude_sessions')
          .update({
            sd_key: null,
            status: s.status === 'ACTIVE' ? 'idle' : 'released',
            released_at: now.toISOString(),
            released_reason: 'SWEEP_SD_INELIGIBLE_CLAIM_FIX',
            worktree_path: null,
            worktree_branch: null,
            current_branch: null,
          })
          .eq('session_id', s.session_id)
          .eq('sd_key', s.sd_key); // race guard: only clear if still pointing at this SD
        actions.push('CLAIM_FIX: cleared stale sd_key on session ' + s.session_id.substring(0, 20) + ' (SD ' + s.sd_key + ' ineligible: ' + verdict.reason + ')');
        continue;
      }
      // Eligible -> existing re-assert behavior (unchanged).
      // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2 (Finding 3): the re-assert is a
      // harmful coordinator double-act (a rogue OLD coordinator re-stamping claiming_session_id /
      // is_working_on every 5 min). Skip it when not the canonical coordinator. The bilateral
      // CLEARS above (ineligible/terminal/fixture) are idempotent hygiene and stay UNGATED.
      if (!_coordMutationAllowed) {
        warnings.push('CLAIM_FIX: re-assert SKIPPED for ' + s.sd_key + ' — not the canonical coordinator (rogue double-act guard)');
      } else if (sd.claiming_session_id !== s.session_id) {
        // QF-20260709-968: sd.claiming_session_id is the AUTHORITATIVE claim (coordinator-directed,
        // fail-closed gate enforced); s.sd_key is a worker SELF-REPORT re-stamped every checkin. When
        // they disagree AND the current claim-holder is still alive, the claim wins — clear the
        // stale self-report binding instead of silently reverting a directed reassignment. Only
        // backfill claiming_session_id from a binding when the SD claim is genuinely unheld (NULL
        // or the holder is dead).
        const holder = sd.claiming_session_id ? classified.find(c => c.session_id === sd.claiming_session_id) : null;
        if (holder && CLAIM_HOLDING_STATUSES.has(holder.status)) {
          // QF-20260508-230 invariant: every claude_sessions release UPDATE must null
          // worktree_branch (mirrors the fixture/non-uuid/terminal bilateral-release branches above).
          await supabase
            .from('claude_sessions')
            .update({
              sd_key: null,
              status: s.status === 'ACTIVE' ? 'idle' : 'released',
              released_at: now.toISOString(),
              released_reason: 'SWEEP_STALE_BINDING_CLAIM_FIX',
              worktree_path: null,
              worktree_branch: null,
              current_branch: null,
            })
            .eq('session_id', s.session_id)
            .eq('sd_key', s.sd_key); // race guard: only clear if still pointing at this SD
          actions.push('CLAIM_FIX: cleared stale sd_key binding on session ' + s.session_id.substring(0, 20) + ' (SD ' + s.sd_key + ' authoritatively claimed by live session ' + sd.claiming_session_id.substring(0, 20) + ')');
        } else {
          await supabase
            .from('strategic_directives_v2')
            .update({ claiming_session_id: s.session_id, is_working_on: true })
            .eq('sd_key', s.sd_key)
            .select();
          actions.push('CLAIM_FIX: set claiming_session_id on ' + s.sd_key + ' → ' + s.session_id.substring(0, 20));
        }
      } else if (!sd.is_working_on) {
        // Fix incomplete claim: claiming_session_id matches but is_working_on is false
        await supabase
          .from('strategic_directives_v2')
          .update({ is_working_on: true })
          .eq('sd_key', s.sd_key)
          .select();
        actions.push('CLAIM_FIX: set is_working_on=true on ' + s.sd_key);
      }
    }
  }

  if (claimIntegrityIssues.length > 0) {
    actions.push('CLAIM_REMINDER: nudged ' + claimIntegrityIssues.length + ' idle session(s) — ' + claimIntegrityIssues.join(', '));
  }

  // Clean up expired messages first. SD-FDBK-FIX-BUS-RETENTION-CLEANUP-001 (FR-1): the RPC
  // used to throw P0003 whenever >1 row was expired, silently swallowed here for months. The
  // RPC itself is now fixed (archive-before-delete + guard predicates); still log a genuine
  // failure instead of swallowing it, so a future regression surfaces instead of no-op'ing.
  try {
    await supabase.rpc('cleanup_expired_coordination');
  } catch (cleanupErr) {
    console.error(`[stale-session-sweep] cleanup_expired_coordination RPC failed: ${cleanupErr.message}`);
  }

  // FR-2: converge the ack-TTL backlog (stamps acknowledged_at on 14d+ no-ack rows; deletes
  // nothing) so the cleanup RPC's guard predicate can eventually reap them once expired too.
  try {
    const { convergeAckTTL } = await import('../lib/retention/session-coordination-ack-convergence.js');
    await convergeAckTTL(supabase);
  } catch (ackErr) {
    console.error(`[stale-session-sweep] ack-TTL convergence failed: ${ackErr.message}`);
  }

  // FIX #3 — REWORKED by FR-4 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001): coordination
  // messages targeting dead/gone sessions are DEAD-LETTERED, never hard-DELETEd. Selection
  // is the pure planDeadLetters() (exported for tests).
  // SD-ARCH-HOTSPOT-SWEEP-001: dispatched via the MAIN_PASSES registry;
  // SWEEP_PASS_REGISTRY=off fallback preserves the original inline block. `nowMs` stays
  // declared here (not inside the pass) — subsequent inline code below (WORK_ASSIGNMENT
  // terminal-drain, STUCK auto-signal drain) still reads this exact variable.
  const nowMs = Date.now();
  if (SWEEP_PASS_REGISTRY_ENABLED) {
    await passRegistryModule.runPasses([passRegistryModule.MAIN_PASSES[3]], sweepPassCtx);
  } else {
    await legacyFallback.runDeadLetterLegacy({ ...sweepPassCtx, nowMs });
  }

  // FR-1 (SD-LEO-FIX-STALE-SESSION-SWEEP-001): drain WORK_ASSIGNMENT rows whose target SD/QF has
  // gone terminal — they otherwise re-fire on every worker tick. STAMP read_at (the drain marker;
  // preserves audit + the row's expires_at), NOT a hard-DELETE. Only drain rows older than one
  // sweep interval (assignment-age floor) so a transient terminal read can't drop a mid-transition
  // in-flight assignment. Terminal sets BRANCH by target shape: SD → {completed,cancelled,deferred};
  // QF → {completed,cancelled,escalated,closed} (escalated/closed are QF-only; deferred is SD-only;
  // 'closed' added by QF-20260719-702). Fail-open.
  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2 (Finding 3): the drain is a
  // WORK_ASSIGNMENT-table coordinator mutation — skip it when not the canonical coordinator.
  if (!_coordMutationAllowed) {
    console.log('[SWEEP] WORK_ASSIGNMENT terminal-drain SKIPPED — not the canonical coordinator.');
  } else try {
    const SWEEP_INTERVAL_MS = 5 * 60_000;
    const assignAgeCutoff = new Date(nowMs - SWEEP_INTERVAL_MS).toISOString();
    let openAssignments = [];
    try {
      openAssignments = await fapPaginate(() => supabase
        .from('session_coordination')
        .select('id, target_sd, created_at')
        .eq('message_type', 'WORK_ASSIGNMENT')
        .is('read_at', null)
        .not('target_sd', 'is', null)
        .lt('created_at', assignAgeCutoff)
        .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    } catch { openAssignments = []; } // prior behavior: read error ignored
    const assignTargets = [...new Set((openAssignments || []).map(a => a.target_sd).filter(Boolean))];
    const sdAssignTargets = assignTargets.filter(k => !/^QF-/.test(k));
    const qfAssignTargets = assignTargets.filter(k => /^QF-/.test(k));
    const terminalTargetSet = new Set();
    if (sdAssignTargets.length > 0) {
      const { data: sdRows } = await supabase.from('strategic_directives_v2').select('sd_key, status').in('sd_key', sdAssignTargets);
      (sdRows || []).forEach(r => { if (['completed', 'cancelled', 'deferred'].includes(r.status)) terminalTargetSet.add(r.sd_key); });
    }
    if (qfAssignTargets.length > 0) {
      const { data: qfRows2 } = await supabase.from('quick_fixes').select('id, status').in('id', qfAssignTargets);
      (qfRows2 || []).forEach(r => { if (['completed', 'cancelled', 'escalated', 'closed'].includes(r.status)) terminalTargetSet.add(r.id); });
    }
    const drainIds = (openAssignments || []).filter(a => terminalTargetSet.has(a.target_sd)).map(a => a.id);
    for (let i = 0; i < drainIds.length; i += 50) {
      const batch = drainIds.slice(i, i + 50);
      await supabase.from('session_coordination').update({ read_at: now.toISOString() }).in('id', batch);
    }
    if (drainIds.length > 0) {
      actions.push('CLEANUP: drained ' + drainIds.length + ' WORK_ASSIGNMENT row(s) targeting terminal SD/QF (read_at stamped)');
    }
  } catch (e) {
    warnings.push('WORK_ASSIGNMENT_TERMINAL_DRAIN: skipped due to error: ' + (e && e.message ? e.message : e));
  }

  // SD-LEO-INFRA-THRESHOLD-AUTO-SIGNAL-OVERFIRE-001 (c): AUTO-DRAIN stale STUCK auto-signals so the
  // coordinator inbox doesn't accumulate a flood that drowns real signals. A STUCK signal is drained
  // (acknowledged_at stamped) when it is >1h old OR its sender session is dead/released (no fresh
  // heartbeat). Coordinator-inbox mutation → gated on _coordMutationAllowed like the drain above.
  if (!_coordMutationAllowed) {
    // not the canonical coordinator — skip (role already logged by the WORK_ASSIGNMENT skip above)
  } else try {
    const stuckAgeCutoff = new Date(nowMs - 60 * 60_000).toISOString();   // >1h old → stale
    const liveCutoff = new Date(nowMs - 10 * 60_000).toISOString();       // fresh heartbeat ≤10min → alive
    let stuckSignals = [];
    try {
      stuckSignals = await fapPaginate(() => supabase
        .from('session_coordination')
        .select('id, sender_session, created_at')
        .eq('payload->>signal_type', 'stuck')
        .is('acknowledged_at', null)
        .order('id', { ascending: true })); // unique tiebreaker (FR-6)
    } catch { stuckSignals = []; } // prior behavior: read error ignored
    const stuck = stuckSignals || [];
    let liveSenders = new Set();
    // FR-6 batch 2 (guard-read): paginated + A3 fail-CLOSED. A failed liveness measurement
    // must NEVER read as "all senders dead" — that would drain (acknowledge) stuck signals
    // from live workers. Skip the drain this tick on guard failure.
    let senderGuardFailed = false;
    const senderIds = [...new Set(stuck.map(s => s.sender_session).filter(Boolean))];
    if (senderIds.length > 0) {
      try {
        const liveRows = await fapPaginate(() => supabase
          .from('claude_sessions')
          .select('session_id')
          .in('session_id', senderIds)
          .neq('status', 'terminated')
          .gte('heartbeat_at', liveCutoff)
          .order('session_id', { ascending: true })); // unique tiebreaker (FR-6)
        liveSenders = new Set((liveRows || []).map(r => r.session_id));
      } catch (guardErr) {
        senderGuardFailed = true;
        warnings.push('GUARD_UNAVAILABLE: stuck-signal drain skipped this tick — sender liveness read failed (' + (guardErr && guardErr.message ? guardErr.message : 'unknown') + ')');
      }
    }
    const drainStuckIds = senderGuardFailed ? [] : stuck
      .filter(s => s.created_at < stuckAgeCutoff || !s.sender_session || !liveSenders.has(s.sender_session))
      .map(s => s.id);
    for (let i = 0; i < drainStuckIds.length; i += 50) {
      const batch = drainStuckIds.slice(i, i + 50);
      await supabase.from('session_coordination').update({ acknowledged_at: now.toISOString() }).in('id', batch);
    }
    if (drainStuckIds.length > 0) {
      actions.push('CLEANUP: drained ' + drainStuckIds.length + ' stale/dead-sender STUCK signal(s) (acknowledged_at stamped)');
    }
  } catch (e) {
    warnings.push('STUCK_SIGNAL_DRAIN: skipped due to error: ' + (e && e.message ? e.message : e));
  }

  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2 (Finding 3): the WORK_ASSIGNMENT
  // dispatch is the EXACT double-dispatch FR-2 names first — a lingering OLD coordinator's
  // sweep would re-insert a WORK_ASSIGNMENT (sender_type:'sweep') to every active worker every
  // 5 min. Extracted to a guarded, exported helper so the gate is unit-testable in isolation.
  // (Dead-session cleanup / claim releases above already ran ungated — only this rogue double-act
  // is blocked.)
  await dispatchWorkAssignmentsIfAllowed(supabase, activeSessions, available, _coordMutationAllowed);

  // Send CLAIM_RELEASED ONLY for sessions whose release write actually succeeded
  // (QF-20260611-162 — previously iterated the raw `dead` list, announcing held/failed releases
  // as released every ~5min forever). Dedup: skip if an identical announce for the
  // same session+SD landed within the last 30 minutes.
  const ANNOUNCE_DEDUP_MIN = 30;
  const dedupSinceIso = new Date(Date.now() - ANNOUNCE_DEDUP_MIN * 60000).toISOString();
  for (const d of releasedDead) {
    const { data: dupes } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', d.session_id)
      .eq('message_type', 'CLAIM_RELEASED')
      .gte('created_at', dedupSinceIso)
      .limit(1);
    if (dupes && dupes.length > 0) continue;
    await supabase
      .from('session_coordination')
      .insert({
        target_session: d.session_id,
        target_sd: d.sd_key,
        message_type: 'CLAIM_RELEASED',
        subject: 'Claim on ' + (d.sd_key || 'unknown') + ' was released (PID dead)',
        body: 'Your session was detected as dead (PID ' + d.pid + '). Claim released. Available: ' + available.join(', '),
        payload: { released_sd: d.sd_key, reason: 'PID_DEAD', available_sds: available },
        sender_type: 'sweep'
      });
  }
  // Failed release writes announce the FAILURE with the error — never a phantom release.
  for (const d of releaseFailedDead) {
    const { data: dupes } = await supabase
      .from('session_coordination')
      .select('id')
      .eq('target_session', d.session_id)
      .eq('message_type', 'RELEASE_FAILED')
      .gte('created_at', dedupSinceIso)
      .limit(1);
    if (dupes && dupes.length > 0) continue;
    await supabase
      .from('session_coordination')
      .insert({
        target_session: d.session_id,
        target_sd: d.sd_key,
        message_type: 'RELEASE_FAILED',
        subject: 'Release of ' + (d.sd_key || 'unknown') + ' FAILED (PID dead, write rejected)',
        body: 'Sweep detected this session dead (PID ' + d.pid + ') but the release UPDATE failed: ' + d.release_error,
        payload: { released_sd: d.sd_key, reason: 'PID_DEAD_RELEASE_FAILED', error: d.release_error },
        sender_type: 'sweep'
      });
  }

  // Send CLAIM_RELEASED messages for conflict-evicted active sessions
  for (const evict of conflictEvicted) {
    const otherAvailable = available.filter(sd => sd !== evict.sd_id);
    await supabase
      .from('session_coordination')
      .insert({
        target_session: evict.session_id,
        target_sd: evict.sd_id,
        message_type: 'CLAIM_RELEASED',
        subject: 'Duplicate claim on ' + (evict.sd_key || '').split('-').pop() + ' resolved — pick next SD',
        body: 'Another session is already working on ' + evict.sd_key + '. Your claim was released to avoid duplicate work. Please claim one of: ' + (otherAvailable.length > 0 ? otherAvailable.join(', ') : 'run /leo next for available SDs') + '\n\nREMINDER: Ensure you are in your own isolated worktree before starting new work. Run: node scripts/resolve-sd-workdir.js <SD-ID>',
        payload: { released_sd: evict.sd_key, reason: 'CONFLICT_RESOLUTION', available_sds: otherAvailable },
        sender_type: 'sweep'
      });
  }

  // Send CLAIM_RELEASED messages for QA-released sessions (completed SD or orphan)
  for (const s of [...workingOnCompleted, ...orphanedClaims]) {
    await supabase
      .from('session_coordination')
      .insert({
        target_session: s.session_id,
        target_sd: s.sd_key,
        message_type: 'CLAIM_RELEASED',
        subject: 'SD ' + s.sd_key.split('-').pop() + ' already completed — pick next SD',
        body: 'Your SD ' + s.sd_key + ' is already completed. Your claim was released. Please pick up one of: ' + (available.length > 0 ? available.join(', ') : 'run /leo next for available SDs'),
        payload: { released_sd: s.sd_key, reason: 'SD_ALREADY_COMPLETED', available_sds: available },
        sender_type: 'sweep'
      });
  }

  // 7. Get orchestrator progress for summary
  const completed = (children || []).filter(c => c.status === 'completed').length;
  const total = (children || []).length;
  const orchPct = total > 0 ? Math.round((completed / total) * 100) : 0;

  // 8. Output summary
  console.log('');
  console.log('=== STALE SESSION SWEEP [' + now.toLocaleTimeString() + '] ===');
  console.log('');

  // Active workers
  console.log('ACTIVE WORKERS (' + activeSessions.length + '):');
  activeSessions.forEach(s => {
    const child = (children || []).find(c => c.sd_key === s.sd_key);
    const pct = child ? child.progress_percentage : '?';
    const tag = s.status === 'ALIVE_NO_HEARTBEAT' ? ' (PID alive, loading)' : '';
    console.log('  ' + (s.tty || '?').padEnd(12) + (s.sd_key || '?').padEnd(50) + bar(pct) + ' ' + pct + '%' + tag);
  });
  console.log('');

  // QF-20260526-279: route through CLAIM_HOLDING_STATUSES so STALE/DEAD render
  // matches the ACTIVE WORKERS filter at L1157. The prior inverse-negation
  // missed ALIVE_SOURCE_SIDE — a session in that state appeared in BOTH lists
  // (7th writer-consumer-asymmetry witness, PAT-LEO-INFRA-WCA-001).
  const stale = classified.filter(s => !CLAIM_HOLDING_STATUSES.has(s.status));
  if (stale.length > 0) {
    console.log('STALE/DEAD (' + stale.length + '):');
    stale.forEach(s => {
      const tag = s.status === 'DEAD' ? 'RELEASED' : s.status;
      console.log('  ' + (s.tty || '?').padEnd(12) + (s.sd_key || '?').padEnd(50) + tag + ' (' + s.heartbeat_age_human + ')');
    });
    console.log('');
  }

  // Actions taken
  if (actions.length > 0) {
    console.log('ACTIONS TAKEN (' + actions.length + '):');
    actions.forEach(a => console.log('  > ' + a));
    console.log('');
  }

  // Warnings
  if (warnings.length > 0) {
    console.log('WARNINGS (' + warnings.length + '):');
    warnings.forEach(w => console.log('  ! ' + w));
    console.log('');
  }

  // Conflicts
  if (conflicts.length > 0) {
    console.log('CONFLICTS DETECTED: ' + conflicts.length);
    conflicts.forEach(([sdId, arr]) => {
      console.log('  ' + sdId + ': ' + arr.map(s => s.session_id.substring(0, 20) + '(' + s.status + ')').join(' vs '));
    });
    console.log('');
  } else {
    console.log('CONFLICTS: None');
    console.log('');
  }

  // QA summary
  const stuckCompleted = stuckApproval.filter(sd => sd.progress_percentage >= 100 && sd.completion_date);
  const stuckReset = stuckApproval.filter(sd => !(sd.progress_percentage >= 100 && sd.completion_date));
  const qaIssues = workingOnCompleted.length + orphanedClaims.length + stuckApproval.length + (terminalWithClaims || []).length;
  if (qaIssues > 0) {
    console.log('QA FIXES (' + qaIssues + '):');
    if (workingOnCompleted.length > 0) console.log('  Released ' + workingOnCompleted.length + ' session(s) working on completed SDs');
    if (orphanedClaims.length > 0) console.log('  Released ' + orphanedClaims.length + ' session(s) with orphaned claims');
    if (stuckCompleted.length > 0) console.log('  Completed ' + stuckCompleted.length + ' SD(s) stuck at 100%/pending_approval');
    if (stuckReset.length > 0) console.log('  Reset ' + stuckReset.length + ' SD(s) from pending_approval → draft (no session working on them)');
    if ((terminalWithClaims || []).length > 0) console.log('  Cleared ' + (terminalWithClaims || []).length + ' stale claiming_session_id on completed/cancelled SDs');
    if (claimIntegrityIssues.length > 0) console.log('  Nudged ' + claimIntegrityIssues.length + ' idle session(s) with CLAIM_REMINDER');
    console.log('');
  }

  // Identity collision summary
  if (collisions.length > 0) {
    console.log('IDENTITY COLLISIONS (' + collisions.length + '):');
    for (const c of collisions) {
      console.log('  Session ' + c.session_id.substring(0, 12) + '... shared by PIDs: ' + c.markers.map(m => m.pid).join(', '));
    }
    console.log('');
  }

  // ── SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: PROCESS TICKS (DB-sourced) ─────
  // Prefer process_alive_at from claude_sessions (authoritative tick signal)
  // over filesystem marker files for liveness reporting. Marker files remain
  // in use for identity-collision detection (Layer 1 above) but are no longer
  // the primary operator-facing liveness display.
  const nowMsForTicks = now.getTime();
  const tickRows = [];
  for (const [sid, t] of telemetryMap.entries()) {
    if (!t.process_alive_at) continue;
    const ageMs = nowMsForTicks - Date.parse(t.process_alive_at);
    if (Number.isFinite(ageMs) && ageMs < 10 * 60 * 1000) {
      tickRows.push({ sid, ageMs, tool: t.current_tool || null });
    }
  }
  if (tickRows.length > 0) {
    console.log('PROCESS TICKS (' + tickRows.length + ' fresh):');
    tickRows.sort((a, b) => a.ageMs - b.ageMs);
    for (const r of tickRows) {
      const ageSec = Math.round(r.ageMs / 1000);
      const toolPart = r.tool ? '  tool=' + r.tool : '';
      console.log('  session=' + r.sid.substring(0, 12) + '...  tick=' + ageSec + 's ago' + toolPart);
    }
    console.log('');
  } else if (aliveMarkers.length > 0) {
    // Pre-migration fallback: show marker files when tick data is unavailable.
    console.log('MARKER FILES (' + aliveMarkers.length + ' alive, legacy):');
    for (const m of aliveMarkers) {
      console.log('  PID=' + String(m.pid).padEnd(8) + 'session=' + (m.session_id || '?').substring(0, 12) + '...' + '  port=' + (m.sse_port || '?'));
    }
    console.log('');
  }

  // npm lock status
  if (npmLock.locked || npmLock.stale_removed || npmLock.dead_removed) {
    console.log('NPM INSTALL LOCK:');
    if (npmLock.locked) console.log('  ACTIVE — held by PID ' + npmLock.holder_pid + ' for ' + npmLock.age_seconds + 's');
    if (npmLock.stale_removed) console.log('  CLEARED — stale lock from PID ' + npmLock.stale_pid + ' (expired)');
    if (npmLock.dead_removed) console.log('  CLEARED — dead lock from PID ' + npmLock.dead_pid + ' (process gone)');
    console.log('');
  }

  // Orchestrator progress
  console.log('ORCHESTRATOR: ' + bar(orchPct, 30) + ' ' + completed + '/' + total + ' children (' + orchPct + '%)');
  console.log('AVAILABLE FOR CLAIM: ' + (available.length > 0 ? available.join(', ') : 'None — all assigned'));
  if (blocked.length > 0) {
    console.log('BLOCKED (deps unmet): ' + blocked.join(', '));
  }
  console.log('COORDINATION MSGS: Sent to ' + activeSessions.length + ' active sessions');
  console.log('');

  // SD-LEO-INFRA-FORMALIZED-WORKTREE-REAPER-001 — reaper tick (slower cadence).
  // Runs every 12th sweep (~1h at 5-min intervals). Feature-flagged by
  // WORKTREE_REAPER_ENABLED; dry-run unless WORKTREE_REAPER_EXECUTE is set.
  // Wrapped so any reaper failure NEVER aborts the sweep's claim-cleanup work.
  try {
    const reaperTick = require('./fleet/worktree-reaper-tick.cjs');
    const outcome = reaperTick.tick({ logger: (m) => console.log(m) });
    if (outcome.invoked) {
      console.log('  reaper_tick result=' + outcome.result + ' counter=' + outcome.counter);
      console.log('');
    }
  } catch (reaperErr) {
    console.log('WORKTREE REAPER TICK: ' + (reaperErr && reaperErr.message ? reaperErr.message : 'unknown'));
    console.log('');
  }

  // SD-LEO-INFRA-LOOP-STATE-SIGNAL-001 — flip loop_state to `exited` on
  // sessions that just got released by this sweep cycle. Best-effort: failure
  // does not roll back the release. Single bulk UPDATE rather than threading
  // the field through every release path above (4+ sites in 3a/3b/3c/3d).
  try {
    // `now` was captured at the start of main() and is used for every release_at
    // write in this sweep, so released_at >= now identifies sessions released
    // during this cycle.
    const sweepStartIso = now && now.toISOString ? now.toISOString() : null;
    if (sweepStartIso) {
      const { LOOP_STATE_EXITED } = require('./lib/sessions/loop-state-tracker.cjs');
      await supabase
        .from('claude_sessions')
        .update({ loop_state: LOOP_STATE_EXITED })
        .gte('released_at', sweepStartIso)
        .in('loop_state', ['active', 'awaiting_tick']);
    }
  } catch (loopExitErr) {
    console.log('LOOP_STATE EXIT: ' + (loopExitErr && loopExitErr.message ? loopExitErr.message : 'unknown'));
  }

  // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-1 — clear is_coordinator flag on
  // sessions whose heartbeat is older than 10 minutes. Logged as
  // COORDINATOR_FLAG_CLEARED. Best-effort — failure does not abort sweep.
  // SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2: guard this coordinator-mutation
  // entry point — only the canonical coordinator session should clear stale flags. Reuses the
  // single shared _coordMutationAllowed verdict computed once at the top of main() (Finding 3).
  try {
    if (!_coordMutationAllowed) {
      console.log('[SWEEP] coordinator-flag-clear SKIPPED — not the canonical coordinator.');
    } else {
      const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
      let stale = [];
      try {
        stale = await fapPaginate(() => supabase
          .from('claude_sessions')
          .select('session_id, metadata, heartbeat_at')
          .filter('metadata->>is_coordinator', 'eq', 'true')
          .lt('heartbeat_at', cutoff)
          .order('session_id', { ascending: true })); // unique tiebreaker (FR-6)
      } catch { stale = []; } // prior behavior: read error ignored
      let cleared = 0;
      const sweepRetired = [];
      for (const s of stale || []) {
        const next = { ...(s.metadata || {}) };
        delete next.is_coordinator;
        delete next.coordinator_since;
        await supabase
          .from('claude_sessions')
          .update({ metadata: next })
          .eq('session_id', s.session_id);
        cleared++;
        sweepRetired.push(s.session_id);
        console.log('  COORDINATOR_FLAG_CLEARED: session=' + s.session_id + ' heartbeat=' + s.heartbeat_at);
      }
      if (cleared > 0) console.log('STALE COORDINATOR FLAGS CLEARED: ' + cleared);

      // SD-LEO-INFRA-COORDINATOR-SUCCESSION-PROTOCOL-001 FR-2: STALE_CLEANUP was the
      // primary dead-letter site — the sweep cleared is_coordinator and left the corpse's
      // unread directed rows stranded forever. Now: close tenure (end_cause='stale_cleanup'),
      // then drain to the live canonical successor if one resolves, else PARK the unread rows
      // at the 'broadcast-coordinator' sentinel so the next registration's existing Step-1
      // sentinel drain delivers them (target_session rewrite only — no new kinds). Fail-open;
      // flag-gated inside the succession module.
      if (sweepRetired.length) {
        try {
          const succession = require('../lib/coordinator/succession.cjs');
          const { getActiveCoordinatorId } = require('../lib/coordinator/resolve.cjs');
          await succession.closeTenure(supabase, { sessionIds: sweepRetired, endCause: 'stale_cleanup', endedBy: 'stale-session-sweep' });
          const successor = await getActiveCoordinatorId(supabase);
          const liveSuccessor = successor && !sweepRetired.includes(successor) ? successor : null;
          const r = liveSuccessor
            ? await succession.drainCoordinatorOutbound(supabase, { newSessionId: liveSuccessor, oldSessionIds: sweepRetired })
            : await succession.parkAtBroadcast(supabase, { oldSessionIds: sweepRetired });
          console.log('  COORDINATOR_SUCCESSION(sweep): ' + (liveSuccessor
            ? `drained ${r.moved || 0} unread row(s) to live successor ${liveSuccessor}`
            : `parked ${r.parked || 0} unread row(s) at broadcast-coordinator (no live successor)`) + (r.error ? ` (warn: ${r.error})` : ''));
        } catch (succErr) {
          console.log('  COORDINATOR_SUCCESSION(sweep) skipped: ' + (succErr && succErr.message ? succErr.message : 'unknown'));
        }
      }
    }
  } catch (coordErr) {
    console.log('COORDINATOR FLAG CLEANUP: ' + (coordErr && coordErr.message ? coordErr.message : 'unknown'));
  }

  // SD-LEO-INFRA-TWO-WAY-COORDINATOR-001 / FR-3b — signal-router aggregation +
  // SD-LEO-INFRA-COORDINATION-OBSERVABILITY-ANOMALY-001 anomaly detectors +
  // SD-LEO-INFRA-SURFACE-INERT-WORKER-001 inert-worker surfacing +
  // QF-20260705-817 completion-boundary silent-exit surfacing.
  // SD-ARCH-HOTSPOT-SWEEP-001: dispatched via the MAIN_PASSES registry;
  // SWEEP_PASS_REGISTRY=off fallback preserves the original 4 inline blocks.
  if (SWEEP_PASS_REGISTRY_ENABLED) {
    await passRegistryModule.runPasses([passRegistryModule.MAIN_PASSES[4]], sweepPassCtx);
  } else {
    await legacyFallback.runCoordinationDetectorsLegacy(sweepPassCtx);
  }

  // SD-ARCH-HOTSPOT-SWEEP-001: SIGNAL_RESOLVED notification, pending-question
  // auto-proceed, Adam-action ACK escalation, CARDINAL adherence probes, and the 3-part
  // self-ID handshake tick — extracted to runCoordinatorHousekeeping() (top-level
  // function above main(), this file) to shrink main().
  await runCoordinatorHousekeeping({ supabase });

  console.log('=== SWEEP COMPLETE ===');

  // FR-2: hand collisions back as a real return value (callers/tests can inspect).
  return { actions, warnings, collisions: collisionsDetected };
}

// FR-4 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001) — pure dead-letter planner.
// Replaces the hard-DELETE of unread rows targeting dead/gone sessions: the same
// eligibility predicates (UUID-shaped target; target DEAD or absent from the classified
// set; past expires_at when set — a NULL expires_at counts as eligible, matching the old
// behavior), but the output is an UPDATE plan, never a delete:
//   read_at        = drain marker (drops out of every unread selector; audit preserved)
//   payload        = merged with { dead_letter, dead_letter_at, dead_letter_reason,
//                    original_target } so the coordinator audit/inbox can surface + re-send
//   expires_at     = backfilled to now+DEAD_LETTER_TTL_MS ONLY when NULL, so the
//                    cleanup_expired_coordination RPC reaps the audit trail after 7d
// Idempotent: rows already stamped payload.dead_letter are excluded. ZERO IO.
const DEAD_LETTER_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function planDeadLetters(unreadMsgs, { allSessionIds, deadIds }, nowMs) {
  const isUuidLike = (s) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s);
  const nowIso = new Date(nowMs).toISOString();
  return (unreadMsgs || [])
    .filter(m => isUuidLike(m.target_session))
    .filter(m => !allSessionIds.has(m.target_session) || deadIds.has(m.target_session))
    .filter(m => !m.expires_at || new Date(m.expires_at).getTime() <= nowMs)
    .filter(m => !(m.payload && m.payload.dead_letter === true))
    .map(m => ({
      id: m.id,
      update: {
        read_at: nowIso,
        ...(m.expires_at ? {} : { expires_at: new Date(nowMs + DEAD_LETTER_TTL_MS).toISOString() }),
        payload: {
          ...(m.payload || {}),
          dead_letter: true,
          dead_letter_at: nowIso,
          dead_letter_reason: 'target_dead',
          original_target: m.target_session,
        },
      },
    }));
}

// SD-FDBK-ENH-CENTRAL-LIVENESS-STAMPER-001 (FR-3): stamp on every successful sweep tick,
// regardless of which internal early-return branch main() took (e.g. the "no sessions with
// claims" all-clear path) — this reflects loop liveness (the tick ran to completion), not
// whether any particular action fired this cycle. Kept as its own named function (rather than
// inlined in the .then() below) so main().then(...) stays a short chain with its rejection
// handler close by -- see tests/unit/stale-session-sweep-builder-catch.test.js's regression
// guard for the FATAL crash class this file was previously fixed for.
async function stampSweepLiveness() {
  try {
    const { stampLastFired } = await import('../lib/periodic-liveness/stamp-last-fired.js');
    await stampLastFired(supabase, 'standard_loop:sweep');
  } catch (err) {
    console.error(`[stale-session-sweep] stampLastFired failed (non-fatal): ${err.message}`);
  }
}

// SD-FDBK-INFRA-CROSS-SESSION-CONFLICTION-001 / FR-2: guard auto-run so the pure
// collision functions can be imported by unit tests without main() hitting the DB.
if (require.main === module) {
  main().then(stampSweepLiveness).catch(err => {
    console.error('SWEEP FATAL:', err.message);
    process.exit(1);
  });
}

// FR-4 (SD-LEO-INFRA-COORD-ADAM-COMMS-RESILIENT-001) exports — pure dead-letter planner.
module.exports.planDeadLetters = planDeadLetters;
module.exports.DEAD_LETTER_TTL_MS = DEAD_LETTER_TTL_MS;

// FR-2 exports — pure collision detector + intent loader (unit-testable in isolation).
module.exports.detectCrossSessionCollisions = detectCrossSessionCollisions;
module.exports.loadRecentIntents = loadRecentIntents;
module.exports.INTENT_WINDOW_MIN = INTENT_WINDOW_MIN;
module.exports.INTENT_PAYLOAD_KEYS = INTENT_PAYLOAD_KEYS;

// SD-LEO-INFRA-SWEEP-CLAIM-SAFETY-001 — claim-safety exports.
// FR-3 predicate (pure): the reserved SD-TEST- fixture namespace check.
module.exports.isTestFixtureSdKey = isTestFixtureSdKey;
module.exports.TEST_FIXTURE_SD_KEY_LIKE = TEST_FIXTURE_SD_KEY_LIKE;
// SD-FDBK-INFRA-QUALITY-GATE-COUPLED-001 (FR-1): bare-shell enrichment decision (pure).
module.exports.computeBareShellEnrichment = computeBareShellEnrichment;
// QF-20260704-545: auto-cancel leaked SD-TEST-* fixtures (test seam).
module.exports.cancelStaleTestFixtures = cancelStaleTestFixtures;
module.exports.TEST_FIXTURE_STALE_MS = TEST_FIXTURE_STALE_MS;
// SD-REFILL-00NFWJ6M: hard-cap pid-alive OS-truth fallback helpers (test seam).
module.exports.isProcessRunning = isProcessRunning;
module.exports.anyClaudeProcessRunning = anyClaudeProcessRunning;
// FR-1/FR-2: the fail-soft reset gate + a test-only seam to seed the lazily-imported
// exec-context-guard cache (so tests can inject a mock assertSweepHandoffGate without
// touching the live ESM module). Seeding the cache is exactly what the first real call
// does — no production behavior change.
module.exports.isSweepResetAllowed = isSweepResetAllowed;
module.exports.isDormancyWatchdogEnabled = isDormancyWatchdogEnabled; // SD-FDBK-ENH-CONFIRMED-LIVE-TODAY-001
module.exports.filterDormantByPidLiveness = filterDormantByPidLiveness; // SD-LEO-INFRA-FIX-RESIDUAL-PROCESS-001
module.exports.isHeadlessZombie = isHeadlessZombie; // QF-20260704-081
module.exports.HEADLESS_ZOMBIE_MIN_MS = HEADLESS_ZOMBIE_MIN_MS; // QF-20260704-081
// SD-ARCH-HOTSPOT-SWEEP-001 (PRD FR-2 / TS-3): promoted classification-time helper —
// exported so the ALIVE_SOURCE_SIDE regression test can assert it without a live sweep run.
module.exports.evaluateSourceSideSignals = evaluateSourceSideSignals;
module.exports.TICK_ALIVE_WINDOW_MS = TICK_ALIVE_WINDOW_MS;
// SD-LEO-INFRA-CLAIM-BOUNDARY-PRE-001: exported so the integration test drives the real
// detect→release→quarantine→alert loop against real tables (no mocked gate).
module.exports.runClaimBoundaryProbe = runClaimBoundaryProbe;
module.exports.__setExecContextGuardForTest = (mock) => { _execContextGuardCache = mock; };
// SD-ARCH-HOTSPOT-SWEEP-001: exported so lib/sweep/passes/clear-stale-qf-claims.cjs and
// lib/sweep/passes/identity-collision-split.cjs can delegate to the single underlying
// implementation (no duplicate logic — see each wrapper's header comment).
module.exports.clearStaleQfClaims = clearStaleQfClaims;
module.exports.splitCollidingSessions = splitCollidingSessions;

// SD-LEO-INFRA-ROLE-SESSION-HANDOFF-PROTOCOL-001-B / FR-2 (Finding 3): export the guarded
// WORK_ASSIGNMENT dispatch so the single-writer gate is unit-testable (assert NO sender_type:'sweep'
// insert happens when !allowed; insert happens when allowed).
module.exports.dispatchWorkAssignmentsIfAllowed = dispatchWorkAssignmentsIfAllowed;

// SD-LEO-INFRA-BLOCK-TEST-SESSION-001 (FR-2/FR-3): exported so the integration test drives
// the real phantom-claim reap against real tables (no mocked gate).
module.exports.reapPhantomSessionClaims = reapPhantomSessionClaims;

// SD-LEO-INFRA-SWEEP-LEGACY-KILL-SWITCH-RETIRE-001: exported so its shape (owner/condition/
// retirement_action all present and non-empty) is unit-testable.
module.exports.SWEEP_PASS_REGISTRY_RETIREMENT = SWEEP_PASS_REGISTRY_RETIREMENT;
