'use strict';

/**
 * retry-state-manager.cjs — Transient per-SD tool retry counter.
 *
 * Backs ENFORCEMENT 11 (RCA Tiered Enforcement) in pre-tool-enforce.cjs.
 *
 * - State file:   .claude/retry-state-<session_id>.json (ephemeral, per session)
 * - Window:       10 minutes — invocations older than this do not count.
 * - Reset signal: a row in sub_agent_execution_results for sub_agent_code='RCA'
 *                 with created_at > state.reset_at clears all counters.
 *
 * Returned counts are tool+target specific:
 *   - Bash   → signature = 'Bash:' + sha256(command).slice(0, 16)
 *   - Edit/Write/MultiEdit → signature = '<tool>:' + absolute_file_path
 *
 * All disk / network errors are swallowed and the caller sees fail-open results
 * (attempts=0, rcaResetApplied=false) — the hook must never block on internal
 * bookkeeping failures.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RETRY_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001 — UUID-shape regex.
// fetchRcaInvocationSince queries sub_agent_execution_results.sd_id which is
// UUID-typed. Callers may pass either UUID or sd_key string; non-UUID inputs
// must be resolved before the PostgREST filter (silent miss otherwise).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Module-scope 60s TTL cache for sd_key→UUID resolutions.
const _sdKeyToUuidCache = new Map(); // key -> { uuid: string|null, expires_at: number }
const SD_KEY_CACHE_TTL_MS = 60 * 1000;

// QF-20260504-830 / SD-FDBK-INFRA-RCA-TIERED-ENFORCEMENT-001 — known-idempotent monitoring
// commands are exempt from signature dedup. RETAINED as the INTERLEAVING-SAFE backstop:
// these MUTATING scheduled scripts (worker-checkin, coordinator-*) cannot be covered by the
// read-only classifier below, and the exit-0 succeeding-poll exemption keys on a single
// per-session last-outcome file that interleaved loops CLOBBER (so a recurring command rarely
// matches its own prior outcome). isExempt short-circuits recordAndCount BEFORE the counter
// accrues, so the exemption holds under interleaving with no reliance on lastOutcome. Full
// removal of this allowlist requires per-command outcome storage (clobber-proof) — tracked as
// a follow-up; SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 stops the arms-race GROWTH via
// Control 4 (reliable exit-0 capture) + the read-only classifier, not by deleting these.
const EXEMPT_PATTERNS = [
  /\bscripts[/\\]stale-session-sweep\.cjs\b/,
  /\bscripts[/\\]fleet-dashboard\.cjs\b/,
  /\bscripts[/\\]assign-fleet-identities\.cjs\b/,
  /[/\\]?\.claude[/\\]tmp[/\\]coord-[\w-]+\.(?:cjs|mjs)\b/,
  /\bscripts[/\\]coordinator-self-review\.mjs\b/,           // loop 8, */5
  /\bscripts[/\\]coordinator-audit\.mjs\b/,                 // loop 5, */15
  /\bscripts[/\\]coordinator-email-summary\.mjs\b/,         // loop 6, */30
  /\bscripts[/\\]coordinator-startup-check\.mjs\b/,         // startup probe
  // QF-20260710-584 / RCA c6d429fc (LEARN-129): quiet-tick is a healthy idempotent
  // coordinator cadence (every run exits 0) but has no per-SD progress fingerprint, so
  // the succeeding-poll exemption doesn't save it across interleaved coordinator loops.
  /\bscripts[/\\]coordinator-quiet-tick\.mjs\b/,
  /\bsetActiveCoordinator\b/,
  /\bcoordinator[/\\]resolve\.cjs\b/,
  /\bscripts[/\\]adam-advisory\.cjs\b[^\n]*\binbox\b/,
  /\bscripts[/\\]solomon-advisory\.cjs\b[^\n]*\binbox\b/, // SOLOMON_LOOPS inbox-monitor (*/15) — mutating-but-idempotent tick (SD-LEO-INFRA-SOLOMON-CONSULT-001E-C); answer path (send/request) NOT exempt
  /\bscripts[/\\]worker-checkin\.cjs\b/,
  // QF-20260703-281: the mandated per-tick fleet-worker heartbeat (`worker-signal.cjs feedback
  // "wakeup-armed ..."`) is a side-effect-free notification re-run every ScheduleWakeup cycle
  // (~150-200s) -- its only "varying" content is often inside a $(date ...) substitution the
  // hook hashes BEFORE shell expansion, so 3 ticks collapse to one signature and trip LEARN-129.
  // Scoped to feedback+wakeup-armed ONLY: worker-signal.cjs's other paths (stuck, harness-bug,
  // request, solomon-consult) are NOT idempotent standing cadences and must keep the 3-strikes teeth.
  /\bscripts[/\\]worker-signal\.cjs\s+feedback\b[^\n]*wakeup-armed/,
  /\bscripts[/\\]coordinator-backlog-rank\.mjs\b/,
  /\bscripts[/\\]coordinator-capacity-forecast\.mjs\b/,
  // SD-LEO-INFRA-RCA-ENFORCEMENT-PROGRESS-STALL-NOT-REPETITION-001: apply-migration.js is one
  // invocation PER migration file — legitimately repeated (3 migrations applied in a row is
  // progress, not a stuck loop), but that per-file progress isn't visible to the SD-level
  // phase/percent progressFingerprint (Control 3), so it needs this allowlist backstop the same
  // way the other mutating-but-idempotent scheduled scripts above do.
  /\bscripts[/\\]apply-migration\.js\b/,
  // QF-20260704-784: `gh pr checks <PR#> --repo ...` is the fleet's standard CI-wait poll --
  // documented and used fleet-wide while waiting on slow CI. It returns NON-ZERO while checks
  // are still pending/running (that IS the expected in-progress signal, not a failure), so the
  // read-only-classifier's noFailureSignal branch (recordAndCount, below) never applies to it --
  // a non-zero exit is, by that classifier's design, indistinguishable from a genuine failure.
  // THREE distinct workers tripped LEARN-129 on this exact command class within 90min while
  // legitimately waiting on slow CI. Exempt unconditionally, like the other idempotent
  // scheduled/monitoring commands above -- a genuinely stuck/broken PR is caught by other
  // signals (claim TTL, coordinator liveness), not this repeat-guard.
  /\bgh\s+pr\s+checks\b/,
];

// SD-LEO-FIX-EXEMPT-REGISTERED-RECURRING-001: config-driven registration of recurring-tick
// exemptions, so adding a scheduled cadence script (adam-quiet-tick etc.) is a reviewed
// config PR instead of a code change. SAFETY PROPERTIES (risk ca54579b — both BLOCKING):
//   1. The config lives at a GIT-TRACKED path resolved __dirname-relative (NEVER the
//      LEO_RETRY_STATE_DIR-overridable state dir) — PR review is the teeth-erosion guard.
//   2. Entries are FULL basenames with extension only (validated below), escaped and
//      compiled into the same anchored `scripts/<name>` family as the builtins — an entry
//      can only ever exempt one physical script; bare prefixes ("adam") or extensions
//      (".mjs") that would disable a script family are rejected before compilation.
//   3. Fail-safe NARROWS, never widens: missing/unreadable/malformed config → builtin
//      EXEMPT_PATTERNS only; a rejected entry is skipped, never approximated.
// TRADEOFF (shared with every builtin entry): isExempt is exit-code-blind, so a
// persistently FAILING allowlisted tick is invisible to this repeat-guard — tick health
// is owned by the periodic-liveness watcher lane, not LEARN-129.
const TICK_EXEMPTIONS_CONFIG = path.resolve(__dirname, 'recurring-tick-exemptions.json');
const TICK_ENTRY_RE = /^[A-Za-z0-9._-]+\.(mjs|cjs|js)$/;
const TICK_ENTRY_MAX = 32;

function loadConfigExemptions() {
  const compiled = [];
  try {
    if (!fs.existsSync(TICK_EXEMPTIONS_CONFIG)) return compiled;
    const parsed = JSON.parse(fs.readFileSync(TICK_EXEMPTIONS_CONFIG, 'utf8'));
    const entries = Array.isArray(parsed && parsed.exempt_scripts) ? parsed.exempt_scripts : [];
    for (const entry of entries.slice(0, TICK_ENTRY_MAX)) {
      const script = entry && typeof entry.script === 'string' ? entry.script : '';
      const reason = entry && typeof entry.reason === 'string' ? entry.reason.trim() : '';
      if (!TICK_ENTRY_RE.test(script) || !reason) {
        process.stderr.write(`[retry-state-manager] tick-exemption entry rejected (needs full basename + extension and a reason): ${JSON.stringify(script)}\n`);
        continue;
      }
      try {
        const escaped = script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        compiled.push(new RegExp(`\\bscripts[/\\\\]${escaped}\\b`));
      } catch {
        // A single uncompilable entry is skipped — never approximated into a wider pattern.
      }
    }
    if (entries.length > TICK_ENTRY_MAX) {
      process.stderr.write(`[retry-state-manager] tick-exemption config capped at ${TICK_ENTRY_MAX} entries (${entries.length} present)\n`);
    }
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      process.stderr.write(`[retry-state-manager] tick-exemption config loaded: ${compiled.length} entr${compiled.length === 1 ? 'y' : 'ies'}\n`);
    }
  } catch (err) {
    // Fail-safe: config trouble can only NARROW exemptions (builtins still apply) and must
    // never block a tool call (this module runs inside a fail-open PreToolUse hook).
    process.stderr.write(`[retry-state-manager] tick-exemption config unreadable (builtins only): ${err.message}\n`);
  }
  return compiled;
}

const CONFIG_EXEMPT_PATTERNS = loadConfigExemptions();

/**
 * Whether a Bash command should bypass invocation tracking entirely (allowlist backstop).
 * Returns false for any non-string input.
 * @param {string} commandStr
 * @returns {boolean}
 */
function isExempt(commandStr) {
  if (typeof commandStr !== 'string' || !commandStr) return false;
  return EXEMPT_PATTERNS.some(rx => rx.test(commandStr)) ||
    CONFIG_EXEMPT_PATTERNS.some(rx => rx.test(commandStr));
}

// SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 (Control 2 — structural read-only
// classifier). COMPLEMENTS the allowlist above and fixes the SD's primary symptom: the
// coordinator's READ-ONLY monitoring loop (status/query Bash, never in the script allowlist)
// false-blocked at the 3-strikes guard. Exemption is structural:
//   (a) the succeeding-poll exemption in recordAndCount() — prior SAME command exited 0, now
//       RELIABLY captured by post-tool-rca-outcome.cjs Control 4 — covers non-interleaved ticks;
//   (b) this DENY-BY-DEFAULT classifier — covers provably READ-ONLY Bash even with no exit code.
// A FAILING loop (non-zero exit / stderr) still accumulates under every path — teeth preserved.

// Shell metacharacters that could chain or redirect into a mutation. Their presence means we
// cannot prove the command is read-only, so it is NOT classified read-only.
const MUTATION_OPERATOR_RE = /[;&|`]|>>?|\$\(|<\(/;

// Provably read-only leading verbs (anchored at the start of the trimmed command).
const READ_ONLY_LEADING_RE =
  /^(?:git\s+(?:status|log|diff|show|branch|rev-parse|describe|remote(?:\s+-v)?|config\s+--get|cat-file|ls-files|for-each-ref)\b|ls|ll|pwd|cat|head|tail|grep|rg|find|wc|stat|echo|whoami|date|env|printenv|which|type|node\s+--version|npm\s+(?:run\s+)?(?:ls|list|view|outdated)\b)/i;

/**
 * Structurally classify a Bash command as provably read-only / non-mutating.
 * DENY-BY-DEFAULT: returns true ONLY for a single simple command whose leading verb is
 * provably read-only AND which contains no chaining/redirection/mutation operators. Any
 * non-string, compound, or unknown command returns false (it still accumulates toward the
 * 3-strikes guard — an unknown shape is never silently exempted).
 * @param {string} commandStr
 * @returns {boolean}
 */
function isReadOnlyCommand(commandStr) {
  if (typeof commandStr !== 'string' || !commandStr) return false;
  const c = commandStr.trim();
  if (!c) return false;
  if (MUTATION_OPERATOR_RE.test(c)) return false; // cannot prove read-only
  return READ_ONLY_LEADING_RE.test(c);
}

/**
 * Resolve the on-disk session-scoped RCA-reset marker path.
 * @param {string} sessionId
 * @returns {string}
 */
function sessionRcaResetMarkerPath(sessionId) {
  const override = process.env.LEO_RETRY_STATE_DIR;
  const dir = override ? path.resolve(override) : path.resolve(__dirname, '../../.claude');
  return path.join(dir, `rca-reset-${sessionId}.json`);
}

/**
 * R5 (SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001): drop a session-scoped RCA-reset
 * marker. Reachable by ANY session — including coordinator/Adam sessions with no claimed SD,
 * for which the SD-scoped RCA-row reset (fetchRcaInvocationSince) is structurally
 * unavailable (it returns null when sdKey is falsy), leaving only EMERGENCY_RCA_BYPASS.
 * recordAndCount honors this marker when sdKey is falsy. Swallows errors (fail-open).
 * @param {string} sessionId
 * @param {string} [atIso] ISO timestamp (defaults to now)
 * @returns {string|null} the reset timestamp written, or null on failure
 */
function writeSessionRcaReset(sessionId, atIso) {
  if (!sessionId) return null;
  const at = atIso || new Date().toISOString();
  try {
    const fp = sessionRcaResetMarkerPath(sessionId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify({ reset_at: at }), 'utf8');
    fs.renameSync(tmp, fp);
    return at;
  } catch {
    return null;
  }
}

/**
 * Read the session-scoped RCA-reset marker timestamp, or null on absence/error.
 * @param {string} sessionId
 * @returns {string|null}
 */
function readSessionRcaReset(sessionId) {
  if (!sessionId) return null;
  try {
    const fp = sessionRcaResetMarkerPath(sessionId);
    if (!fs.existsSync(fp)) return null;
    const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return parsed && typeof parsed.reset_at === 'string' ? parsed.reset_at : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the on-disk state path for a session.
 * @param {string} sessionId
 * @returns {string}
 */
function stateFilePath(sessionId) {
  const override = process.env.LEO_RETRY_STATE_DIR;
  const dir = override
    ? path.resolve(override)
    : path.resolve(__dirname, '../../.claude');
  return path.join(dir, `retry-state-${sessionId}.json`);
}

/**
 * Build a stable signature for a tool invocation.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: optional `lastOutcome` param mixes a
 * digest of {exit_code, stderr_sha, stdout_sha} into the Bash signature so iterative
 * TDD (different failure each retry) does NOT collapse into the stuck-loop signature.
 * Same outcome → same digest → stuck-loop detection preserved.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001: stdout_sha is the primary real
 * differentiator on Claude Code — stderr_sha is near-always '' (real stderr is never
 * delivered on this harness; error text lands in stdout instead), so stderr_sha+exit_code
 * alone systematically collapsed distinct failures into one signature.
 *
 * Edit/Write/MultiEdit signatures are unchanged — file_path is the natural key.
 *
 * @param {string} toolName
 * @param {Object} input
 * @param {{exit_code?: number|string, stderr_sha?: string, stdout_sha?: string}} [lastOutcome] -
 *        optional outcome from the prior tool call (captured by post-tool-rca-outcome.cjs).
 *        Without it, returns the legacy command-only signature (back-compat).
 * @returns {string|null}
 */
/**
 * SD-FDBK-FIX-RCA-TIERED-ENFORCEMENT-001: canonical Bash command hash, shared by
 * signatureFor() and the succeeding-poll exemption in recordAndCount() so the
 * command_sha written by post-tool-rca-outcome.cjs compares equal to the current
 * command's hash.
 * @param {string} cmd
 * @returns {string} sha256(cmd) first 16 hex chars
 */
function bashCmdHash(cmd) {
  return crypto.createHash('sha256').update(cmd).digest('hex').slice(0, 16);
}

function signatureFor(toolName, input, lastOutcome) {
  if (!toolName || !input) return null;
  if (toolName === 'Bash') {
    const cmd = typeof input.command === 'string' ? input.command : '';
    if (!cmd) return null;
    const hash = bashCmdHash(cmd);
    // Outcome admixture (back-compat: missing/malformed lastOutcome → command-only signature).
    // SD-LEO-INFRA-RCA-TIERED-SIGNATURE-FALSE-POSITIVE-001: also admix stdout_sha — on
    // Claude Code, stderr_sha is near-always '' (real stderr is never delivered; error
    // text lands in stdout instead), so stderr_sha ALONE zeroed out the digest's entropy
    // and distinct failures collapsed into one signature. stdout_sha carries the real
    // distinguishing content. Trigger condition includes stdout_sha so a lastOutcome
    // carrying ONLY stdout_sha (no exit_code/stderr_sha) still gets outcome admixture.
    if (
      lastOutcome &&
      typeof lastOutcome === 'object' &&
      (lastOutcome.exit_code !== undefined || lastOutcome.stderr_sha !== undefined || lastOutcome.stdout_sha !== undefined)
    ) {
      const ec = lastOutcome.exit_code === undefined ? '' : String(lastOutcome.exit_code);
      const ss = typeof lastOutcome.stderr_sha === 'string' ? lastOutcome.stderr_sha : '';
      const so = typeof lastOutcome.stdout_sha === 'string' ? lastOutcome.stdout_sha : '';
      const outcomeDigest = crypto.createHash('sha256').update(`${ec}|${ss}|${so}`).digest('hex').slice(0, 8);
      return `Bash:${hash}:${outcomeDigest}`;
    }
    return `Bash:${hash}`;
  }
  if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit') {
    const fp = typeof input.file_path === 'string' ? input.file_path : '';
    if (!fp) return null;
    // SD-FDBK-ENH-PRE-TOOL-ENFORCE-001: mix an edit-CONTENT digest so DISTINCT edits to the
    // same file (a legit multi-part change) get DISTINCT signatures and do NOT accumulate as
    // retries; only IDENTICAL re-attempts (same content - the true blind-retry signal) share a
    // signature and trip the 3-strikes counter. Mirrors the Bash command+outcome admixture.
    let contentKey = '';
    if (toolName === 'Edit') {
      const o = typeof input.old_string === 'string' ? input.old_string : '';
      const n = typeof input.new_string === 'string' ? input.new_string : '';
      contentKey = JSON.stringify([o, n]);
    } else if (toolName === 'Write') {
      contentKey = typeof input.content === 'string' ? input.content : '';
    } else {
      try { contentKey = JSON.stringify(input.edits || []); } catch { contentKey = ''; }
    }
    const cdig = crypto.createHash('sha256').update(contentKey).digest('hex').slice(0, 12);
    return `${toolName}:${fp}:${cdig}`;
  }
  return null;
}

/**
 * Resolve sd_key string → UUID for sub_agent_execution_results.sd_id queries.
 * Returns null when input is null/undefined/unknown.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: closes silent UUID-vs-sd_key mismatch
 * (6th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * @param {string|null|undefined} sdKeyOrUuid
 * @returns {Promise<string|null>}
 */
async function resolveSdKeyToUuid(sdKeyOrUuid) {
  if (typeof sdKeyOrUuid !== 'string' || !sdKeyOrUuid) return null;
  // Already a UUID — pass through.
  if (UUID_REGEX.test(sdKeyOrUuid)) return sdKeyOrUuid;

  // Cache hit?
  const now = Date.now();
  const cached = _sdKeyToUuidCache.get(sdKeyOrUuid);
  if (cached && cached.expires_at > now) {
    return cached.uuid;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  // OR-query against strategic_directives_v2 (sd_key.eq.X OR id.eq.X).
  // Note: id column is UUID but PostgREST tolerates string equality in or() filter.
  const params = new URLSearchParams();
  params.set('select', 'id');
  params.set('or', `(sd_key.eq.${sdKeyOrUuid},id.eq.${sdKeyOrUuid})`);
  params.set('limit', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  let resolved = null;
  try {
    const resp = await fetch(`${url}/rest/v1/strategic_directives_v2?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.ok) {
      const rows = await resp.json();
      if (Array.isArray(rows) && rows.length > 0 && typeof rows[0].id === 'string') {
        resolved = rows[0].id;
      }
    }
  } catch {
    clearTimeout(timer);
    // Fail-open
  }

  _sdKeyToUuidCache.set(sdKeyOrUuid, { uuid: resolved, expires_at: now + SD_KEY_CACHE_TTL_MS });
  if (!resolved && process.env.LEO_TELEMETRY_DEBUG === '1') {
    process.stderr.write(`[retry-state-manager] sd_key resolution failed: ${sdKeyOrUuid}\n`);
  }
  return resolved;
}

/**
 * Read current state from disk. Returns an empty state on any error.
 * @param {string} sessionId
 * @returns {{ reset_at: string|null, invocations: Object<string, Array<number>> }}
 */
function readState(sessionId) {
  const empty = { reset_at: null, invocations: {} };
  try {
    const fp = stateFilePath(sessionId);
    if (!fs.existsSync(fp)) return empty;
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    if (!parsed.invocations || typeof parsed.invocations !== 'object') parsed.invocations = {};
    return parsed;
  } catch {
    return empty;
  }
}

/**
 * Atomically write state to disk. Swallows errors.
 * @param {string} sessionId
 * @param {Object} state
 */
function writeState(sessionId, state) {
  try {
    const fp = stateFilePath(sessionId);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    const tmp = `${fp}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
    fs.renameSync(tmp, fp);
  } catch {
    // Fail-open: bookkeeping failures never block enforcement.
  }
}

/**
 * Drop entries older than the retry window to keep state bounded.
 * @param {Object} state
 * @param {number} nowMs
 */
function pruneStale(state, nowMs) {
  for (const sig of Object.keys(state.invocations)) {
    const ts = state.invocations[sig].filter(t => nowMs - t <= RETRY_WINDOW_MS);
    if (ts.length === 0) {
      delete state.invocations[sig];
      // Drop the matching Control-3 progress fingerprint so it cannot leak past the window.
      if (state.progress && typeof state.progress === 'object') delete state.progress[sig];
    } else {
      state.invocations[sig] = ts;
    }
  }
}

/**
 * Check Supabase for a recent rca-agent invocation tied to this SD.
 * Used to reset counters once the caller acts on an RCA.
 * @param {string} sdKey
 * @param {string|null} lastResetAt - ISO timestamp of prior reset (or null)
 * @returns {Promise<string|null>} Newest matching created_at, or null on none / error
 */
async function fetchRcaInvocationSince(sdKey, lastResetAt) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !sdKey) return null;

  // SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: resolve sd_key→UUID before the
  // PostgREST filter. sub_agent_execution_results.sd_id is UUID-typed; passing
  // a sd_key string silently mismatches and the reset never fires.
  const sdUuid = await resolveSdKeyToUuid(sdKey);
  if (!sdUuid) return null;

  const params = new URLSearchParams();
  params.set('select', 'created_at');
  params.set('sub_agent_code', 'eq.RCA');
  params.set('sd_id', `eq.${sdUuid}`);
  params.set('order', 'created_at.desc');
  params.set('limit', '1');
  if (lastResetAt) params.set('created_at', `gt.${lastResetAt}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1200);
  try {
    const resp = await fetch(`${url}/rest/v1/sub_agent_execution_results?${params.toString()}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const rows = await resp.json();
    if (Array.isArray(rows) && rows.length > 0 && rows[0].created_at) {
      return rows[0].created_at;
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * Record a tool invocation and return the current attempt count.
 * Also performs RCA-reset lookup and state pruning. Fail-open on all errors.
 *
 * SD-LEO-INFRA-RCA-TIERED-SIGNATURE-001: optional `lastOutcome` param threads
 * the prior tool's outcome digest into the signature, allowing iterative TDD
 * to track at attempts=1 while preserving stuck-loop detection.
 *
 * @param {string} sessionId
 * @param {string} sdKey
 * @param {string} toolName
 * @param {Object} toolInput
 * @param {Object} [opts]
 * @param {Function} [opts.rcaCheck] - injectable async (sdKey, lastResetAt) => ISO|null
 * @param {number}   [opts.now]      - injectable current time in ms (for tests)
 * @param {Object}   [opts.lastOutcome] - {exit_code, stderr_sha} from prior tool call
 * @returns {Promise<{ attempts: number, signature: string|null, rcaResetApplied: boolean }>}
 */
async function recordAndCount(sessionId, sdKey, toolName, toolInput, opts = {}) {
  const signature = signatureFor(toolName, toolInput, opts.lastOutcome);
  if (!sessionId || !signature) {
    return { attempts: 0, signature: null, rcaResetApplied: false };
  }

  if (toolName === 'Bash') {
    const lo = opts.lastOutcome;
    const cmd = typeof (toolInput && toolInput.command) === 'string' ? toolInput.command : '';

    // QF-20260504-830 allowlist backstop (interleaving-safe): mutating idempotent scheduled
    // ticks short-circuit BEFORE the counter accrues, independent of lastOutcome — see the
    // EXEMPT_PATTERNS note above for why the exit-0/classifier paths cannot cover them.
    if (isExempt(cmd)) {
      return { attempts: 0, signature, rcaResetApplied: false, progressStalled: undefined };
    }

    // SD-FDBK-FIX-RCA-TIERED-ENFORCEMENT-001 + Control 4: a blind retry is, by definition,
    // re-running a FAILED command. If the immediately-prior invocation of THIS SAME command
    // exited 0 (now RELIABLY captured by post-tool-rca-outcome.cjs Control 4), this is a
    // succeeding poll (a recurring monitor/scheduled cron), not a retry — do not accumulate.
    // COMMAND-SCOPED: lastOutcome.command_sha must match the current command's hash, so an
    // interleaved success of a DIFFERENT command can never exempt a genuine failure loop.
    // STRICT: only exit_code 0/'0' exempts; non-zero codes still accumulate.
    if (
      lo && typeof lo === 'object' && cmd &&
      lo.command_sha === bashCmdHash(cmd) &&
      (lo.exit_code === 0 || lo.exit_code === '0')
    ) {
      return { attempts: 0, signature, rcaResetApplied: false, progressStalled: undefined };
    }

    // SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001 (Control 1 + Control 2): absence-of-
    // failure on a PROVABLY READ-ONLY command. When there is no failure signal — no prior
    // outcome at all, OR the prior outcome has a null/undefined exit_code AND empty stderr —
    // AND the command is structurally read-only/non-mutating, it cannot be a blind-retry
    // FAILURE loop, so it does not accumulate. CONJUNCTION (R1): read-only ALONE (without
    // absence-of-failure) or absence-of-failure ALONE (without read-only) does NOT exempt —
    // a FAILING read-only loop (non-null non-zero exit, or stderr) still accumulates.
    const noFailureSignal =
      !lo ||
      ((lo.exit_code === null || lo.exit_code === undefined) &&
        !(typeof lo.stderr_sha === 'string' && lo.stderr_sha));
    if (cmd && isReadOnlyCommand(cmd) && noFailureSignal) {
      return { attempts: 0, signature, rcaResetApplied: false, progressStalled: undefined };
    }
  }

  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const rcaCheck = opts.rcaCheck || fetchRcaInvocationSince;

  const state = readState(sessionId);
  pruneStale(state, now);

  let rcaResetApplied = false;
  try {
    const rcaAt = await rcaCheck(sdKey, state.reset_at);
    if (rcaAt) {
      state.invocations = {};
      state.progress = {};
      state.reset_at = rcaAt;
      rcaResetApplied = true;
    }
  } catch {
    // Fail-open: don't block on reset-check errors.
  }

  // R5 (SD-LEO-INFRA-RCA-AUTOSIGNAL-FALSE-POSITIVE-001): no-SD-claim sessions (coordinator/
  // Adam) cannot use the SD-scoped RCA-row reset above (fetchRcaInvocationSince returns null
  // when sdKey is falsy), leaving only EMERGENCY_RCA_BYPASS. Honor a session-scoped reset
  // marker any such session can drop via writeSessionRcaReset(sessionId).
  if (!rcaResetApplied && !sdKey) {
    try {
      const marker = readSessionRcaReset(sessionId);
      if (marker && (!state.reset_at || marker > state.reset_at)) {
        state.invocations = {};
        state.progress = {};
        state.reset_at = marker;
        rcaResetApplied = true;
      }
    } catch {
      // Fail-open.
    }
  }

  const existing = Array.isArray(state.invocations[signature]) ? state.invocations[signature] : [];

  // Control 3 support: track a per-signature progress fingerprint so the caller can suppress
  // a spurious auto-signal. progressStalled === true means the session showed NO progress
  // (phase/percent unchanged) since this signature first repeated; undefined when the caller
  // supplies no fingerprint (back-compat — the auto-signal then fires on the ===2 crossing
  // as before).
  let progressStalled;
  if (typeof opts.progressFingerprint === 'string') {
    if (!state.progress || typeof state.progress !== 'object') state.progress = {};
    const firstFp = state.progress[signature];
    if (firstFp === undefined) {
      state.progress[signature] = opts.progressFingerprint; // baseline on first sighting
      progressStalled = true;
    } else {
      progressStalled = firstFp === opts.progressFingerprint;
    }
  }

  existing.push(now);
  state.invocations[signature] = existing;

  writeState(sessionId, state);

  return { attempts: existing.length, signature, rcaResetApplied, progressStalled };
}

module.exports = {
  recordAndCount,
  signatureFor,
  readState,
  writeState,
  fetchRcaInvocationSince,
  resolveSdKeyToUuid,
  pruneStale,
  stateFilePath,
  isExempt,
  isReadOnlyCommand,
  writeSessionRcaReset,
  readSessionRcaReset,
  sessionRcaResetMarkerPath,
  bashCmdHash,
  RETRY_WINDOW_MS,
  UUID_REGEX,
  // Test-only export for cache reset between test cases
  _resetSdKeyCache: () => { _sdKeyToUuidCache.clear(); },
};
