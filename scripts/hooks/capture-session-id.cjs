/**
 * Capture Session ID Hook
 *
 * Reads session_id from Claude Code's SessionStart stdin JSON and persists it
 * via CLAUDE_ENV_FILE so all subsequent Bash tool invocations have
 * CLAUDE_SESSION_ID in their environment.
 *
 * This eliminates the need for fragile process tree walking to identify
 * which Claude Code conversation spawned a subprocess.
 *
 * Trigger: SessionStart (must be first hook to run)
 * Input: JSON via stdin with { session_id, ... }
 * Output: Writes CLAUDE_SESSION_ID to CLAUDE_ENV_FILE
 *
 * See: GitHub Issue #17188 (Expose Session Metadata via Environment Variables)
 * See: RCA-TERMINAL-IDENTITY-CHAIN-BREAK-001
 */

const fs = require('fs');
const path = require('path');
const { rankForModelEffort } = require('../../lib/fleet/tier-ladder.cjs');
const { drainAndExit } = require('../../lib/hooks/drain-undici.cjs'); // QF-20260719-890: drain before post-fetch exits
const { execSync } = require('child_process');

// SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001 (FR-7): self-load .env so process.env.SUPABASE_*
// resolves regardless of whether the parent shell pre-sourced .env. Hook subprocesses do NOT
// inherit other hooks' loaded env (each hook is a sibling spawn), so without this line
// upsertSessionRow silently returns at the supabaseUrl/Key check below — the smoking-gun
// failure mode F observed across 5 reproductions (sessions 2485521c, 8edf5243, 755f5696,
// 97270d12, fd8348ea). Reference pattern: lib/supabase-client.cjs:9.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001: spawn telemetry.
// Writes errors to .claude/pids/spawn-errors.log (NDJSON) and stderr.
// Rotates at SPAWN_LOG_MAX_BYTES, keeps SPAWN_LOG_KEEP_FILES most recent.
const SPAWN_LOG_MAX_BYTES = 1024 * 1024; // 1 MB
const SPAWN_LOG_KEEP_FILES = 3;

function getSpawnLogPath() {
  return path.resolve(__dirname, '../../.claude/pids/spawn-errors.log');
}

function rotateSpawnLogIfNeeded(logPath) {
  try {
    if (!fs.existsSync(logPath)) return;
    const size = fs.statSync(logPath).size;
    if (size < SPAWN_LOG_MAX_BYTES) return;
    // Shift .log → .log.1 → .log.2 → .log.3; drop oldest.
    for (let i = SPAWN_LOG_KEEP_FILES; i >= 1; i--) {
      const src = i === 1 ? logPath : `${logPath}.${i - 1}`;
      const dst = `${logPath}.${i}`;
      if (fs.existsSync(src)) {
        try { fs.renameSync(src, dst); } catch { /* best effort */ }
      }
    }
  } catch { /* rotation failures must not block */ }
}

function logSpawnError(sessionId, ccPid, err, code) {
  const entry = {
    timestamp: new Date().toISOString(),
    session_id: sessionId,
    cc_parent_pid: ccPid,
    error_message: err && err.message ? String(err.message) : String(err),
    error_code: code || (err && err.code) || 'UNKNOWN',
    platform: process.platform,
    node_version: process.version,
  };
  const logPath = getSpawnLogPath();
  try {
    const dir = path.dirname(logPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    rotateSpawnLogIfNeeded(logPath);
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch { /* last resort: stderr still runs below */ }
  // Errors always surface to stderr regardless of LEO_TELEMETRY_DEBUG.
  console.error(`SessionStart:session-tick: spawn failed: ${entry.error_message} (code=${entry.error_code} platform=${entry.platform})`);
}

// SD-LEO-INFRA-SESSION-PID-MARKER-001: timeouts sized so max internal work
// (tree_walk + scan) stays under the registered hook timeout in settings.json.
// Hook timeout = 15s; internal budget = tree_walk(6s) + scan(3s) = 9s → 6s margin.
const TREE_WALK_TIMEOUT_MS = 6000;
const SCAN_TIMEOUT_MS = 3000;

// QF-20260906-751: the ROOT CAUSE of the worktree-removal EPERM defect. spawn(...) below used
// to inherit process.cwd() (whatever worktree the SessionStart hook happened to fire from) with
// no `cwd` override, so the detached session-tick daemon held that directory open for its whole
// life (a Windows EPERM on `git worktree remove` even long after the worktree's own work was
// done). resolveRepoRoot() finds the shared main-repo root (identical from any worktree) via
// `git rev-parse --git-common-dir` -- the common .git directory's parent -- so the spawned
// daemon can be pinned there instead of a worktree that may need to be deleted later.
function resolveRepoRoot(cwd) {
  try {
    const commonDir = execSync('git rev-parse --git-common-dir', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    const absCommonDir = path.isAbsolute(commonDir) ? commonDir : path.resolve(cwd, commonDir);
    return path.dirname(absCommonDir);
  } catch {
    // Not a git repo, or git unavailable -- fail open to the hook's own cwd rather than block
    // SessionStart on a telemetry concern.
    return cwd;
  }
}

// QF-20260906-751: a SessionStart re-fire (compact/resume/clear) for a session that already has
// a LIVE tick daemon must reuse it, not spawn a second one. Checks the marker session-tick.cjs
// ITSELF writes (tick-<session_id>.json), at the SAME __dirname-relative location that
// unmodified script always uses -- deliberately NOT the shared repo root resolveRepoRoot() finds,
// even though the spawned daemon's cwd is pinned there (see the spawn site below). Moving the
// MARKER's own location would silently break lib/fleet/claimant-liveness.cjs and its ~15 fleet-
// coordination callers (stale-session-sweep.cjs, qf-start.js, reconcile-seats.mjs, ...), which
// read this same marker via a caller-supplied repoRoot that defaults to process.cwd() -- for a
// worker running from its own worktree, that's the worktree path, matching where this
// unmodified marker write already lands. This guard therefore only catches a duplicate spawn
// within the SAME worktree (the common case for repeated /clear); a session that moves across
// worktrees can still accumulate one daemon per worktree, same as before this fix -- closing
// that fully would require centralizing the .claude/pids canonical-location resolution across
// every consumer, out of scope for this quick fix. A dead/stale/malformed marker is treated as
// "no live daemon" -- this guard only ever SKIPS a spawn, never blocks one, so a bad read fails
// open to the pre-existing spawn behavior.
function findLiveTickPid(worktreeRoot, sessionId) {
  const markerPath = path.join(worktreeRoot, '.claude', 'pids', `tick-${sessionId}.json`);
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    const pid = Number(marker && marker.tick_pid);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    process.kill(pid, 0); // throws ESRCH if not alive; does not actually signal anything
    return pid;
  } catch {
    return null;
  }
}

function logDiscoveryEvent(fields) {
  // Structured JSON log on stderr (hook stdout is reserved for env-file exports).
  // Always-on at INFO per PRD FR-3.
  const entry = { event: 'capture-session-id.discovery', timestamp: new Date().toISOString(), ...fields };
  try { console.error(JSON.stringify(entry)); } catch { /* best effort */ }
}

// ── SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-4, FR-5, TR-1) ──
// Inline helpers so this hook stays dependency-free per the file header contract.
// These mirror lib/session-identity-sot.js but cannot import it (ESM from CJS hook).

/** Returns true when the SOT feature flag is enabled. */
function sotIsEnabled() {
  const v = process.env.SESSION_IDENTITY_SOT_ENABLED;
  if (!v) return false;
  return v === '1' || v === 'true' || v === 'TRUE' || v === 'yes' || v === 'on';
}

/**
 * Atomic write: tmp + fsync + rename. Crash-safe per TR-1.
 * Tmp file is cleaned up on any error so partial state never surfaces.
 */
function sotAtomicWrite(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, content, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }
}

/**
 * Select the long-lived Claude Code ancestor from a parsed process chain.
 * Pure function: takes [{pid, name, ppid}, ...] (chain[0] is current process),
 * returns the chosen entry or null. Exported for unit tests.
 *
 * SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-1, FR-3):
 *   Pass 1 — outermost claude.exe wins (claude.exe is the modern long-lived
 *            Claude Code process on Windows; node.exe is often a transient
 *            subprocess that dies within seconds).
 *   Pass 2 — original "first node.exe with non-shell parent" rule, with broadened
 *            skip-set including cmd.exe / pwsh.exe / powershell.exe, preserving
 *            backward compatibility for environments without claude.exe.
 *   Pass 3 — defensive fallback: outermost node.exe in chain.
 */
function selectAncestorFromChain(chain) {
  if (!Array.isArray(chain) || chain.length < 2) return null;
  const skipParents = ['node.exe', 'node', 'bash.exe', 'bash', 'sh.exe', 'sh', 'cmd.exe', 'pwsh.exe', 'powershell.exe'];

  // Pass 1: outermost claude.exe wins.
  for (let i = chain.length - 1; i >= 1; i--) {
    if (chain[i].name === 'claude.exe') return chain[i];
  }

  // Pass 2: original semantics with broadened skip-set.
  for (let i = 1; i < chain.length; i++) {
    const proc = chain[i];
    if (proc.name === 'node.exe' || proc.name === 'node') {
      const parent = chain[i + 1];
      if (!parent || !skipParents.includes(parent.name)) return proc;
    }
  }

  // Pass 3: outermost node.exe defensive fallback.
  for (let i = chain.length - 1; i >= 1; i--) {
    if (chain[i].name === 'node.exe' || chain[i].name === 'node') return chain[i];
  }

  return null;
}

/**
 * Find the Claude Code node.exe PID by walking the process ancestry chain.
 * Mirrors the logic in lib/terminal-identity.js findClaudeCodePid(), but in CJS
 * for use in this hook. Falls back to process scan if tree walk fails.
 *
 * @param {string} entryPath - SessionStart source from Claude Code (startup|resume|compact|reconnect|unknown)
 * @returns {string|null} Claude Code process PID
 */
function findClaudeCodePid(entryPath = 'unknown') {
  if (process.platform !== 'win32') {
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'none', outcome: 'skipped_non_windows', platform: process.platform });
    return null;
  }

  // Method 1: Walk process ancestry
  const walkStart = process.hrtime.bigint();
  try {
    const script = [
      `$p = ${process.pid}`,
      '$chain = @()',
      'while ($p -and $p -ne 0) {',
      '  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$p" -ErrorAction SilentlyContinue',
      '  if (-not $proc) { break }',
      '  $chain += "$($proc.ProcessId)|$($proc.Name)|$($proc.ParentProcessId)"',
      '  $p = $proc.ParentProcessId',
      '}',
      '$chain -join ";"'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: TREE_WALK_TIMEOUT_MS
    }).trim();

    if (raw) {
      const chain = raw.split(';').map(entry => {
        const [pid, name, ppid] = entry.split('|');
        return { pid, name: (name || '').toLowerCase(), ppid };
      });

      const selected = selectAncestorFromChain(chain);
      if (selected) {
        const dur = Number((process.hrtime.bigint() - walkStart) / 1000000n);
        logDiscoveryEvent({ entry_path: entryPath, method_used: 'tree_walk', outcome: 'success', duration_ms: dur, chain_depth: chain.length, resolved_name: selected.name });
        return selected.pid;
      }
    }
    const dur = Number((process.hrtime.bigint() - walkStart) / 1000000n);
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'tree_walk', outcome: 'no_match', duration_ms: dur });
  } catch (err) {
    const dur = Number((process.hrtime.bigint() - walkStart) / 1000000n);
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'tree_walk', outcome: 'error', duration_ms: dur, error: err && err.message ? String(err.message).slice(0, 200) : 'unknown' });
    /* fall through to scan */
  }

  // Method 2: Scan all node.exe / claude.exe processes for SSE port match.
  // SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-2): single CIM round-trip with WQL OR-filter so the
  // fallback path also discovers claude.exe and stays within SCAN_TIMEOUT_MS.
  const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
  if (!ssePort) {
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'skipped_no_sse_port' });
    return null;
  }
  const scanStart = process.hrtime.bigint();
  try {
    const script = [
      'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\' OR Name=\'claude.exe\'" -ErrorAction SilentlyContinue |',
      `  Where-Object { $_.ProcessId -ne ${process.pid} -and $_.CommandLine -match '${ssePort}' } |`,
      '  ForEach-Object { $_.ProcessId } |',
      '  Select-Object -First 1'
    ].join('\n');
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const raw = execSync(`powershell -NoProfile -EncodedCommand ${encoded}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: SCAN_TIMEOUT_MS
    }).trim();
    const dur = Number((process.hrtime.bigint() - scanStart) / 1000000n);
    if (raw && /^\d+$/.test(raw)) {
      logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'success', duration_ms: dur, sse_port: ssePort });
      return raw;
    }
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'no_match', duration_ms: dur, sse_port: ssePort });
  } catch (err) {
    const dur = Number((process.hrtime.bigint() - scanStart) / 1000000n);
    logDiscoveryEvent({ entry_path: entryPath, method_used: 'scan', outcome: 'error', duration_ms: dur, error: err && err.message ? String(err.message).slice(0, 200) : 'unknown' });
    /* give up */
  }

  return null;
}

/**
 * QF-20260424-143: Insert-if-not-exists claude_sessions row for this UUID.
 * SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 (FR2): retry-hardened.
 *
 * Mirrors session-tick.cjs PostgREST pattern (no supabase-js dep) so cold-start
 * latency stays negligible. `Prefer: resolution=merge-duplicates` makes POST act
 * as an upsert on the session_id unique key — safe for resume/compact where the
 * row may already exist. Heartbeat is refreshed either way.
 *
 * **Retry policy** (SD-LEO-FIX-SESSION-LIFECYCLE-HYGIENE-001 FR2): each attempt
 * has a 3s timeout; on failure we retry with exponential backoff (0ms, 500ms,
 * 1500ms) for up to 3 attempts total. This closes the fire-and-forget gap
 * observed 2026-04-24 (session 4b15d2aa missed claude_sessions entirely despite
 * hook running). The prior "session-tick will retry" comment was misleading —
 * session-tick.cjs only UPDATEs heartbeat, it does NOT CREATE the row; a
 * missing row stays missing until the next manual claim reaches sd-start.
 *
 * Still fail-soft after max retries: any final error is swallowed (or logged
 * with LEO_TELEMETRY_DEBUG=1). SessionStart never blocks on telemetry.
 */
// QF-20260627-531: pure metadata merge for the session upsert. Spreads the existing row's
// metadata first so coordinator-stamped fields (callsign, tier_rank, fleet_identity, …) survive,
// then stamps the telemetry fields. Exported for unit testing.
// SD-LEO-INFRA-AUTO-TIERING-ACTIVATION-001-B (FR-8): also persists `model` (previously written
// only to the local marker file, never the DB) as a secondary auto-source alongside the
// worker-checkin.cjs --model self-report. get-then-merge (base spread first) means an
// already-DB-stamped metadata.model is never clobbered by an absent/null model here.

// QF-20260710-406: SessionStart's stdin `model` field carries Claude Code's own model
// identifier (undocumented exact format, e.g. a versioned display name), not the short
// {haiku,sonnet,opus,fable} ladder alias. Substring-match on family name so any cased/
// versioned variant resolves; unrecognized strings pass through untouched and fall to
// tier-ladder's own normalizeModel, which maps conservative-UP (never under-restricts).
const MODEL_ALIAS_ORDER = ['fable', 'opus', 'sonnet', 'haiku'];
function coarseModelAlias(raw) {
  const s = typeof raw === 'string' ? raw.toLowerCase() : '';
  return MODEL_ALIAS_ORDER.find((alias) => s.includes(alias)) || raw;
}

function buildSessionMetadata(existingMetadata, ccPid, source, model) {
  const base = (existingMetadata && typeof existingMetadata === 'object' && !Array.isArray(existingMetadata))
    ? existingMetadata
    : {};
  const merged = { ...base, cc_pid: ccPid, source: source || 'unknown' };
  if (model) {
    merged.model = model;
    // SD-LEO-INFRA-FLEET-MODEL-REGISTRY-001 FR-1/FR-2: stamp the derived family and the
    // provenance beside the raw id, so both writers populate the same triple and
    // family-keyed consumers (notably the one-way-door gate) have a stable field to
    // read. These MUST stay inside this `if (model)` block: the no-model path is
    // pinned to exactly {cc_pid, source}, and an unconditional key would break it as
    // well as the no-clobber contract above. coarseModelAlias is reused rather than
    // importing a second resolver into this latency-sensitive SessionStart hook; it
    // passes an unrecognized id through untouched, so guard on a real family match.
    const family = coarseModelAlias(model);
    if (family && family !== model) merged.model_family = family;
    else if (MODEL_ALIAS_ORDER.includes(String(model).toLowerCase())) merged.model_family = String(model).toLowerCase();
    // SEC-01 (adversarial security review of this SD): an id naming NO known family must
    // CLEAR any inherited stamp, exactly as the check-in writer does. Setting-without-
    // clearing let a stale family outlive the model it described: a seat stamped 'fable'
    // that later ran an unrecognized id kept model_family='fable', and declaredSeatFamily
    // reads model_family FIRST — so it walked straight through the Fable-exclusive
    // one-way door that is supposed to fail closed on unknown. This branch introduced
    // that field, so it introduced that hole; the two writers must agree.
    else delete merged.model_family;
    // Auto-observed from Claude Code's own identifier. An externally stamped source
    // (coordinator/chairman) is authoritative and is never overwritten here.
    const priorSource = base.model_source;
    const externallyStamped = priorSource
      && priorSource !== 'worker_self_report' && priorSource !== 'sessionstart_observed';
    if (!externallyStamped) merged.model_source = 'sessionstart_observed';
    // QF-20260710-406: a genuine model CHANGE observed at a real SessionStart event
    // (startup/resume/clear/compact — the only moments this field is populated) must
    // re-derive tier_rank, so a mid-session /model switch self-heals on the next
    // natural session-lifecycle boundary instead of staying stranded on a stale rank
    // until a worker manually re-checks in with --model. No-op on the common case
    // (model unchanged from the prior stamp).
    if (base.model !== model) {
      try { merged.tier_rank = rankForModelEffort(coarseModelAlias(model), base.effort); }
      catch { /* fail-open: keep whatever tier_rank was already stamped */ }
    }
  }
  return merged;
}

async function upsertSessionRow(sessionId, ccPid, source, model) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    // SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001 (FR-7-AC3): observable silent-return.
    // Booleans only — never log the values themselves.
    if (process.env.LEO_TELEMETRY_DEBUG === '1') {
      console.error(`SessionStart:capture-session-id: upsert skipped — supabaseUrl/Key missing in env (URL=${Boolean(supabaseUrl)} KEY=${Boolean(supabaseKey)})`);
    }
    return;
  }

  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/claude_sessions`;
  const now = new Date().toISOString();
  const pidNum = Number(ccPid);

  // QF-20260627-531: this is an UPSERT (Prefer: resolution=merge-duplicates), which REPLACES the
  // whole jsonb `metadata` column on conflict. Writing a fresh { cc_pid, source } object blanked
  // coordinator-stamped fields (callsign, tier_rank) on every SessionStart recapture — the 2nd
  // callsign-churn source (sibling to QF-20260627-108). Read the existing metadata first and MERGE,
  // so the stamped fields persist. Fail-open to {} (new session / GET error -> nothing to preserve).
  let existingMetadata = {};
  try {
    const getCtrl = new AbortController();
    const getTimer = setTimeout(() => getCtrl.abort(), 2000);
    try {
      const getRes = await fetch(`${url}?session_id=eq.${encodeURIComponent(sessionId)}&select=metadata`, {
        method: 'GET',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, Accept: 'application/json' },
        signal: getCtrl.signal,
      });
      if (getRes.ok) {
        const rows = await getRes.json();
        const m = Array.isArray(rows) && rows[0] && rows[0].metadata;
        if (m && typeof m === 'object' && !Array.isArray(m)) existingMetadata = m;
      }
    } finally { clearTimeout(getTimer); }
  } catch { /* fail-open: new session / GET unavailable -> no existing fields to preserve */ }

  const mergedMetadata = { ...buildSessionMetadata(existingMetadata, ccPid, source, model), resume_uuid: sessionId };

  // SD-ALTIFYAI-LEO-FIX-RAW-MODEL-NULL-001: PATCH-first, INSERT-if-zero-rows.
  //
  // The prior single-POST "upsert" (Prefer: resolution=merge-duplicates) omitted the
  // on_conflict=session_id query param, so PostgREST resolved ON CONFLICT against the
  // PRIMARY KEY (id) — which the body never supplies — instead of the actual unique
  // session_id index. Every write to a PRE-EXISTING row raised 23505 (HTTP 409), and
  // that 409 was silently swallowed (see the 4xx-bail branch below). Root cause: RCA
  // agent ad18bd0a3fde5c499, live-verified via .artifacts/rca259-repro.mjs. Confirmed
  // live: metadata.model/cc_pid/source/resume_uuid have NEVER persisted via this hook
  // on any pre-existing row since it shipped (2026-07-01).
  //
  // A naive `?on_conflict=session_id` fix on the single POST was tested and rejected —
  // verified live (.artifacts/rca259-destructive.mjs) that it RESURRECTS a released/idle
  // row: status flips to 'active' while released_at stays set, exactly the hazard
  // SD-LEO-INFRA-FIX-WINDOWS-SESSION-001 FR-3 already guards against (which is why
  // scripts/session-tick.cjs uses ignore-duplicates + a PATCH fallback instead of a
  // single merge-duplicates POST). This PATCH-first design mirrors that proven-safe
  // pattern: PATCH never writes `status`, so an existing row's status/released_at can
  // never be touched by this write path — only a genuine INSERT sets status='active'.
  const patchBody = JSON.stringify({
    heartbeat_at: now,
    pid: Number.isFinite(pidNum) ? pidNum : null,
    hostname: require('os').hostname(),
    metadata: mergedMetadata,
  });
  const insertBody = JSON.stringify({
    session_id: sessionId,
    status: 'active',
    heartbeat_at: now,
    pid: Number.isFinite(pidNum) ? pidNum : null,
    hostname: require('os').hostname(),
    metadata: mergedMetadata,
  });

  const MAX_ATTEMPTS = 3;
  const PER_ATTEMPT_TIMEOUT_MS = 3000;
  // Exponential backoff with 0 base delay for the first attempt so happy-path
  // latency is unchanged (~200ms typical).
  const BACKOFFS_MS = [0, 500, 1500];
  const debug = process.env.LEO_TELEMETRY_DEBUG === '1';

  let lastStatus = null;
  let lastError = null;

  // 4xx (not 408/429) is a client-side error — no point retrying. Bail, but LOUDLY:
  // a 4xx here is a request-shape bug, not a transient condition worth suppressing.
  // This is what silently ate the original defect for 2 months.
  const isNonRetryable4xx = (status) => status >= 400 && status < 500 && status !== 408 && status !== 429;
  const logLoud4xx = (op, status, snippet) => {
    console.error(`SessionStart:capture-session-id: upsert ${op} 4xx status=${status} body=${(snippet || '').slice(0, 300)}`);
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFFS_MS[attempt - 1] > 0) {
      await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt - 1]));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
    try {
      const patchRes = await fetch(`${url}?session_id=eq.${encodeURIComponent(sessionId)}`, {
        method: 'PATCH',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: patchBody,
        signal: controller.signal,
      });

      if (patchRes.ok) {
        const patched = await patchRes.json().catch(() => []);
        if (Array.isArray(patched) && patched.length > 0) {
          clearTimeout(timer);
          if (debug && attempt > 1) {
            console.error(`SessionStart:capture-session-id: upsert PATCH OK on attempt ${attempt}/${MAX_ATTEMPTS}`);
          }
          return;
        }
        // 0 rows matched — row does not exist yet. Fall back to INSERT, same attempt.
        const insertRes = await fetch(url, {
          method: 'POST',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: insertBody,
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (insertRes.ok) {
          if (debug && attempt > 1) {
            console.error(`SessionStart:capture-session-id: upsert INSERT-fallback OK on attempt ${attempt}/${MAX_ATTEMPTS}`);
          }
          return;
        }
        lastStatus = insertRes.status;
        if (insertRes.status === 409) {
          // Race: another writer inserted the row between our PATCH and this INSERT.
          // Retry the loop — the next PATCH will find it. Not a client-error bail.
          if (debug) console.error(`SessionStart:capture-session-id: upsert INSERT-fallback race (409) attempt=${attempt}/${MAX_ATTEMPTS}`);
          continue;
        }
        if (isNonRetryable4xx(insertRes.status)) {
          const insertBodyText = await insertRes.text().catch(() => '');
          logLoud4xx('INSERT-fallback', insertRes.status, insertBodyText);
          return;
        }
        if (debug) console.error(`SessionStart:capture-session-id: upsert INSERT-fallback status=${insertRes.status} attempt=${attempt}/${MAX_ATTEMPTS}`);
        continue;
      }

      lastStatus = patchRes.status;
      if (isNonRetryable4xx(patchRes.status)) {
        const patchBodyText = await patchRes.text().catch(() => '');
        clearTimeout(timer);
        logLoud4xx('PATCH', patchRes.status, patchBodyText);
        return;
      }
      if (debug) {
        console.error(`SessionStart:capture-session-id: upsert PATCH status=${patchRes.status} attempt=${attempt}/${MAX_ATTEMPTS}`);
      }
    } catch (err) {
      lastError = err;
      if (debug) {
        console.error(`SessionStart:capture-session-id: upsert failed attempt=${attempt}/${MAX_ATTEMPTS}: ${err?.message || err}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  // SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001 (FR-2): exhaustion stderr is always-on.
  // Per-attempt logs remain debug-gated to keep happy-path noise low, but exhaustion
  // (3 retries failed) is never silent — operator-trust violation tracked across 5
  // prior reproductions of failure mode F.
  console.error(`SessionStart:capture-session-id: upsert exhausted ${MAX_ATTEMPTS} attempts (last_status=${lastStatus}, last_error=${lastError?.message || 'n/a'})`);
}

function main() {
  return new Promise((resolve) => {
    let input = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', chunk => {
      input += chunk;
    });

    process.stdin.on('end', async () => {
      try {
        const data = JSON.parse(input);
        const sessionId = data.session_id;

        if (!sessionId) {
          resolve();
          return;
        }

        // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-4):
        // When the SOT feature flag is on, the canonical <sid>.json marker MUST be
        // written (and fsync'd) BEFORE CLAUDE_ENV_FILE receives the export. This
        // ordering guarantees that any tool observing the env var can always read
        // the canonical marker back. When the flag is off we preserve the legacy
        // order (env var first) to avoid perturbing sessions that haven't opted in.
        const sotOrdering = sotIsEnabled();

        const ssePort = process.env.CLAUDE_CODE_SSE_PORT;
        const entryPath = data.source || 'unknown';
        const discoveredPid = findClaudeCodePid(entryPath);
        const ccPid = discoveredPid || process.ppid || process.pid;
        if (!discoveredPid) {
          logDiscoveryEvent({ entry_path: entryPath, method_used: 'fallback_ppid', outcome: 'degraded', fallback_ppid: ccPid });
        }
        const markerDir = path.resolve(__dirname, '../../.claude/session-identity');
        const envFile = process.env.CLAUDE_ENV_FILE;

        const writeEnvFile = () => {
          if (envFile) {
            try {
              // Use export syntax per Claude Code docs; append to preserve other hooks' vars
              fs.appendFileSync(envFile, `export CLAUDE_SESSION_ID=${sessionId}\n`);
            } catch (e) {
              console.error(`SessionStart:capture-session-id: CLAUDE_ENV_FILE write failed: ${e.message}`);
            }
          } else {
            // Diagnostic: log which env vars Claude Code provides to hooks
            const claudeVars = Object.keys(process.env)
              .filter(k => k.startsWith('CLAUDE'))
              .join(', ');
            console.error(`SessionStart:capture-session-id: CLAUDE_ENV_FILE not set. Claude vars: [${claudeVars}]`);
          }
        };

        // Strategy 1 (legacy order): write env var first when SOT flag is off.
        if (!sotOrdering) writeEnvFile();

        // Strategy 2: Write session marker files keyed by Claude Code PID.
        // Walk the process tree to find the actual Claude Code node.exe ancestor
        // (process.ppid is often cmd.exe, not Claude Code). This PID matches what
        // getTerminalId() → findClaudeCodePid() discovers at Bash tool runtime.
        try {
          if (!fs.existsSync(markerDir)) {
            fs.mkdirSync(markerDir, { recursive: true });
          }

          const marker = {
            session_id: sessionId,
            sse_port: ssePort || null,
            cc_pid: ccPid,
            source: data.source || 'unknown',
            model: data.model || null,
            captured_at: new Date().toISOString()
          };

          // Write PID-keyed marker (primary lookup for getTerminalId).
          // Use atomic write under SOT ordering so the marker lands crash-safe.
          const pidFile = path.join(markerDir, `pid-${ccPid}.json`);
          if (sotOrdering) {
            sotAtomicWrite(pidFile, JSON.stringify(marker, null, 2));
          } else {
            fs.writeFileSync(pidFile, JSON.stringify(marker, null, 2));
          }

          // Write per-session marker (for audit/debugging — this is the canonical SOT marker).
          const markerFile = path.join(markerDir, `${sessionId}.json`);
          if (sotOrdering) {
            sotAtomicWrite(markerFile, JSON.stringify(marker, null, 2));
          } else {
            fs.writeFileSync(markerFile, JSON.stringify(marker, null, 2));
          }

          // SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-B (FR-1):
          // When SOT is enabled, atomically update the /current pointer to match.
          // This is the third identity source — once it's written, claim-validity-gate
          // sees all three in agreement.
          //
          // SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001 (FR-3): unconditional pointer write.
          // Previously gated on sotOrdering — left /current 8.5+ days stale under SOT-off
          // (the default), pointing at unrelated sessions. claim-validity-gate observers
          // need /current to be a deterministic third source regardless of SOT flag state.
          // Atomic semantics preserved: sotAtomicWrite under SOT-on, plain writeFileSync
          // under SOT-off (writeFileSync is atomic for small payloads on Windows).
          const currentPointer = path.join(markerDir, 'current');
          if (sotOrdering) {
            sotAtomicWrite(currentPointer, sessionId);
          } else {
            fs.writeFileSync(currentPointer, sessionId);
          }

          // Cleanup old markers — preserve markers for alive PIDs, only delete dead ones
          // Fix: previous "keep last 3" logic deleted the current conversation's marker
          // when 4+ concurrent conversations existed, causing terminal identity divergence.
          const cleanup = (prefix) => {
            const files = fs.readdirSync(markerDir)
              .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
              .map(f => {
                const pidMatch = f.match(/^pid-(\d+)\.json$/);
                const pid = pidMatch ? Number(pidMatch[1]) : null;
                let alive = false;
                if (pid) { try { process.kill(pid, 0); alive = true; } catch { /* dead */ } }
                return { name: f, pid, alive, mtime: fs.statSync(path.join(markerDir, f)).mtimeMs };
              })
              .sort((a, b) => b.mtime - a.mtime);
            // SD-LEO-INFRA-SESSION-IDENTITY-RECONCILIATION-001 (FR-4): delete ALL
            // dead pid-*.json markers immediately. Previously this retained the 3
            // most-recent dead markers (`dead.slice(3)` only deleted from index 3
            // onward) as a debug aid; the retained pid-14396.json marker was the
            // artifact that defeated identity-reconciliation in 824a4401 phantom-
            // active-session. Forensics use audit_log + claude_sessions; pid-marker
            // retention is no longer worth the false-active risk.
            const dead = files.filter(f => !f.alive);
            for (const old of dead) {
              try { fs.unlinkSync(path.join(markerDir, old.name)); } catch { /* best effort */ }
            }
          };
          cleanup('pid-');
          // Clean non-prefixed session markers — same alive-PID-aware logic
          const sessionMarkers = fs.readdirSync(markerDir)
            .filter(f => !f.startsWith('pid-') && !f.startsWith('port-') && f.endsWith('.json'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(markerDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime);
          for (const old of sessionMarkers.slice(5)) {
            try { fs.unlinkSync(path.join(markerDir, old.name)); } catch { /* best effort */ }
          }
        } catch {
          // Non-fatal
        }

        // Strategy 1 (SOT order): write env var AFTER marker + pointer.
        // Guarantees FR-4 — env var is never set to a session id whose canonical
        // file doesn't exist yet.
        if (sotOrdering) writeEnvFile();

        // Machine-readable line for downstream parsing (SD-MAN-INFRA-SESSION-IDENTITY-BIRTH-001)
        console.log(`CLAUDE_SESSION_ID=${sessionId}`);
        console.log(`SessionStart:capture-session-id: ${sessionId}`);

        // ── QF-20260424-143: upsert claude_sessions row for captured UUID ──
        // session-tick.cjs uses PATCH (update-only); if no row exists, every tick
        // silently no-ops and the identity chain between env var, markers, and DB
        // breaks. Insert-if-not-exists here so tick has a target. Uses PostgREST
        // directly (no supabase-js dep) to match session-tick.cjs pattern.
        await upsertSessionRow(sessionId, ccPid, data.source, data.model);

        // ── SD-LEO-INFRA-WORKER-SOURCE-SIDE-001: spawn detached session-tick ──
        // Writes process_alive_at every 30s until the parent CC exits.
        // Fire-and-forget — never blocks SessionStart.
        // SD-LEO-INFRA-PROTOCOL-ENFORCEMENT-001: spawn errors are default-on logged
        // to .claude/pids/spawn-errors.log + stderr so silent failures surface.
        try {
          // Two DIFFERENT roots, deliberately: `cwd` pins the daemon PROCESS somewhere that will
          // never need to be `git worktree remove`d (the shared main-repo root) -- this is the
          // actual EPERM fix, and it's purely an OS-level cwd handle, independent of any file
          // path. `worktreeRoot` is where session-tick.cjs (unmodified) actually WRITES its own
          // marker file (__dirname-relative, i.e. wherever THIS worktree's own checkout sits) --
          // used only for the duplicate-tick guard read, so this fix carries zero risk to
          // lib/fleet/claimant-liveness.cjs's own marker-location assumptions (see findLiveTickPid
          // doc comment above for why moving the marker itself was rejected).
          const repoRoot = resolveRepoRoot(process.cwd());
          const worktreeRoot = path.resolve(__dirname, '../..');
          const livePid = findLiveTickPid(worktreeRoot, sessionId);
          if (livePid) {
            // QF-20260906-751: a live daemon for this session already exists (spawned earlier
            // in this same SessionStart-firing worktree) -- reuse it.
            if (process.env.LEO_TELEMETRY_DEBUG === '1') {
              console.error(`SessionStart:session-tick: reusing live tick_pid=${livePid}, skipping spawn`);
            }
          } else {
            const { spawn } = require('child_process');
            const tickScript = path.resolve(__dirname, '../session-tick.cjs');
            if (!fs.existsSync(tickScript)) {
              logSpawnError(sessionId, ccPid, new Error(`tick script not found at ${tickScript}`), 'ENOENT');
            } else {
              const child = spawn(process.execPath, [tickScript], {
                // QF-20260906-751: pin the daemon's cwd to the shared repo root, never the
                // (possibly-temporary) worktree this hook happened to fire from -- this is what
                // let a `git worktree remove` fail with EPERM long after the worktree's own
                // work was done, since the daemon held the directory open for its whole life.
                cwd: repoRoot,
                detached: true,
                stdio: 'ignore',
                env: {
                  ...process.env,
                  CLAUDE_SESSION_ID: sessionId,
                  CC_PARENT_PID: String(ccPid),
                },
                windowsHide: true,
              });
              if (child && typeof child.unref === 'function') child.unref();
              // child.on('error', ...) captures post-spawn errors (ENOENT/EACCES on
              // execPath) that the outer try/catch never sees because spawn is async.
              if (child && typeof child.on === 'function') {
                child.on('error', (err) => {
                  logSpawnError(sessionId, ccPid, err, err.code || 'SPAWN_ERROR');
                });
              }
              if (process.env.LEO_TELEMETRY_DEBUG === '1') {
                console.error(`SessionStart:session-tick: spawned tick_pid=${child.pid} cwd=${repoRoot}`);
              }
            }
          }
        } catch (tickErr) {
          logSpawnError(sessionId, ccPid, tickErr, tickErr.code || 'SYNC_THROW');
        }
      } catch {
        // Invalid JSON or other error — don't block session start
      }

      resolve();
    });

    process.stdin.on('error', () => {
      resolve();
    });

    // Timeout must exceed the internal PowerShell budget (tree_walk + scan = 9s).
    // Registered hook timeout in .claude/settings.json is 15s.
    //
    // SD-FDBK-ENH-SESSIONSTART-HOOK-CAPTURE-001 (FR-5): bumped 12000ms → 13500ms.
    // Belt-and-suspenders after FR-1+FR-4+FR-7 land — gives the upsert + tick spawn
    // path more headroom on slow Windows tree-walks (TREE_WALK_TIMEOUT_MS=6000 +
    // SCAN_TIMEOUT_MS=3000 + 3-attempt upsert ~11s could exceed the 12s budget).
    // Per DESIGN consolidation #2 in metadata.design_plan_recommendations: shipped
    // as separately revertible commit so it can be reverted independently if the
    // structural fixes prove sufficient without the timer extension.
    setTimeout(resolve, 13500);
  });
}

// SD-LEO-INFRA-FIX-CLAUDE-CODE-001 (FR-5): expose pure helpers for unit tests.
module.exports = { selectAncestorFromChain, findClaudeCodePid, upsertSessionRow, buildSessionMetadata, resolveRepoRoot, findLiveTickPid };

if (require.main === module) {
  main().then(() => drainAndExit(0)).catch(() => drainAndExit(0));
}
