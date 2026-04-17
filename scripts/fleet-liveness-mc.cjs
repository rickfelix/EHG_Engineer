/**
 * Fleet Liveness Monte Carlo — Probabilistic Worker Activity Detection
 *
 * SD: SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001
 * PRD: PRD-SD-LEO-INFRA-FLEET-LIVENESS-MONTE-001
 *
 * Pure-JS Monte Carlo engine that converts noisy per-signal evidence
 * (heartbeat age, PID liveness, port reachability, git activity, in-flight
 * sub-agents, transition windows) into a posterior probability P(alive) per
 * worker, plus fleet-level ETA distributions.
 *
 * No external stats deps (no jstat, simple-statistics): Box-Muller for normal
 * sampling, regularized incomplete beta approximation for credible intervals,
 * and joint (pid_alive, port_open) confusion matrix instead of independent
 * multiplication (correlation ~99%).
 *
 * CLI:
 *   node scripts/fleet-liveness-mc.cjs [--json | --table] [--workers id1,id2]
 *
 * --json emits machine-readable JSON to stdout (default for piped consumers)
 * --table emits human-readable table to stderr (default on TTY)
 *
 * Env vars:
 *   FLEET_MC_ENABLED    gate dashboard/sweep integration (default true)
 *   FLEET_MC_DRAWS      samples per worker (default 1000)
 *   FLEET_MC_PRIOR_FILE override empirical priors with JSON file
 *   FLEET_MC_SWEEP_GATE gate sweep consumer separately from dashboard
 *
 * Module exports (consumable by tests + subprocess): computeLiveness,
 * runFleetMC, classifyScope, bootstrapPriors, backfillCalibration, probeMcpPort,
 * sampleGapDistribution, betaCredibleInterval.
 */

// Silence dotenvx/dotenv tip-of-the-day lines that would otherwise corrupt
// our stdout JSON contract. Consumers (dashboard, sweep) parse stdout; env
// tool chatter must go to stderr or be suppressed entirely.
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';
process.env.DOTENV_QUIET = process.env.DOTENV_QUIET || 'true';

const fs = require('fs');
const path = require('path');
const net = require('net');
const { execSync } = require('child_process');

// dotenvx/dotenv prints banner lines to stdout unless we intercept first.
// Monkey-patch stdout.write briefly during client init so that any env loader
// output lands in stderr instead. We restore the original writer immediately.
const _origStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = function muted(chunk, ...rest) {
  const s = typeof chunk === 'string' ? chunk : (Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk));
  if (s.includes('injected env') || s.startsWith('\u25c7')) {
    return process.stderr.write(s, ...rest);
  }
  return _origStdoutWrite(chunk, ...rest);
};

const { createSupabaseServiceClient } = require('../lib/supabase-client.cjs');

// Restore stdout for JSON output once dotenv init is done.
process.stdout.write = _origStdoutWrite;

// ── Constants ─────────────────────────────────────────────────────────────
const DEFAULT_DRAWS = parseInt(process.env.FLEET_MC_DRAWS, 10) || 1000;
const PORT_PROBE_TIMEOUT_MS = 50;
const RECENT_COMMIT_WINDOW_SEC = 180; // 3m
const RECENT_COMMIT_SHORT_CIRCUIT_P = 0.99;
// PRD TS-9 regression: workers with hb < 5m are classified ACTIVE by the
// existing sweep without consulting any other signal. Mirror that behavior
// here so MC integration introduces no false-negatives on fresh sessions.
const FRESH_HEARTBEAT_WINDOW_SEC = 300; // 5m
const FRESH_HEARTBEAT_SHORT_CIRCUIT_P = 0.98;
const SUB_AGENT_WINDOW_WIDEN_FACTOR = 1.75;
const TRANSITION_WINDOW_SHIFT_MIN = 2;
const TRANSITION_WINDOW_SEC = 300; // 5m since last handoff
const SPARSE_BUCKET_THRESHOLD = 10;
const PRIOR_LOOKBACK_DAYS = 30;
const DEFAULT_HORIZON_MIN = 120;
const SCOPE_THRESHOLDS = Object.freeze({
  SMALL_WORDS: 120,
  LARGE_WORDS: 280,
  SMALL_CHANGES: 3,
  LARGE_CHANGES: 8,
});
const PHASES = Object.freeze(['LEAD', 'PLAN', 'EXEC']);
const BUCKETS = Object.freeze(['SMALL', 'MEDIUM', 'LARGE']);

// Fallback priors (used when DB bootstrap returns nothing — e.g. fresh install).
// Gap distribution parameters: mean + stddev in minutes.
const FALLBACK_PRIORS = Object.freeze({
  LEAD:  { SMALL: { mean: 3, stddev: 2 }, MEDIUM: { mean: 6, stddev: 3 },  LARGE: { mean: 10, stddev: 5 } },
  PLAN:  { SMALL: { mean: 4, stddev: 2 }, MEDIUM: { mean: 8, stddev: 4 },  LARGE: { mean: 14, stddev: 6 } },
  EXEC:  { SMALL: { mean: 5, stddev: 3 }, MEDIUM: { mean: 10, stddev: 5 }, LARGE: { mean: 18, stddev: 8 } },
});

// Joint (pid_alive, port_open) confusion matrix — correlated ~99% so treating
// them independently double-counts evidence. Rows sum to 1 (conditional on
// state). Cells are P((pid,port) | state).
const JOINT_CONFUSION = Object.freeze({
  alive: Object.freeze({
    'TT': 0.94,  // both signals fire
    'TF': 0.04,  // pid but no port (sse_port unreachable — rare)
    'FT': 0.01,  // port but no pid (never in practice; race)
    'FF': 0.01,  // neither (marker stale, very rare if alive)
  }),
  dead: Object.freeze({
    'TT': 0.02,  // very rare if dead — PID recycling
    'TF': 0.08,  // PID recycled to some other process
    'FT': 0.02,  // orphaned port listener (unlikely)
    'FF': 0.88,  // typical dead-session signature
  }),
});

// ── Math helpers ──────────────────────────────────────────────────────────

/**
 * Box-Muller transform: sample a single normal(mean, stddev).
 * Returns one value; the paired value is discarded (acceptable overhead for
 * our sample sizes; caller can batch by calling multiple times).
 */
function sampleNormal(mean, stddev) {
  let u1 = 0;
  let u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stddev * z;
}

/**
 * Sample a per-draw expected inter-event gap (minutes). Floors at 0 (no
 * negative gaps).
 */
function sampleGapDistribution(params) {
  const g = sampleNormal(params.mean, params.stddev);
  return g < 0 ? 0 : g;
}

/**
 * Lanczos approximation of log-gamma. Used by beta CDF approximation for
 * credible intervals.
 */
function logGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized incomplete beta function via continued fraction (Lentz's
 * method). Adapted from Numerical Recipes. Used to derive CI bounds from
 * Beta(successes+1, failures+1) posterior.
 */
function incompleteBeta(a, b, x) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0 || x === 1) return x;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function betacf(a, b, x) {
  const MAXIT = 200;
  const EPS = 3e-7;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/**
 * Return (ci_low, ci_high) 95% credible interval from Beta(alpha, beta) where
 * alpha = successes + 1, beta = failures + 1. Inverse CDF via bisection on
 * regularized incomplete beta.
 */
function betaCredibleInterval(successes, total, level = 0.95) {
  const alpha = successes + 1;
  const beta = Math.max(total - successes, 0) + 1;
  const lo = (1 - level) / 2;
  const hi = 1 - lo;
  return {
    low: invertBetaCDF(alpha, beta, lo),
    high: invertBetaCDF(alpha, beta, hi),
  };
}

function invertBetaCDF(a, b, p) {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const c = incompleteBeta(a, b, mid);
    if (c < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ── Port probing ──────────────────────────────────────────────────────────

/**
 * Probe MCP port on localhost. Fail-closed: connection error → port_open=false.
 * Returns a Promise<boolean>.
 */
function probeMcpPort(port, timeoutMs = PORT_PROBE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    if (!port || !Number.isFinite(Number(port))) return resolve(false);
    const socket = net.connect({ host: '127.0.0.1', port: Number(port) });
    let settled = false;
    const done = (value) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

// ── Scope classification ──────────────────────────────────────────────────

/**
 * Bucketize an SD into SMALL/MEDIUM/LARGE using description length,
 * key-change count, and type. Used as a hint for gap-distribution selection —
 * larger scope → longer expected gaps between signals.
 */
function classifyScope({ description_words = 0, key_changes_len = 0, sd_type = '', is_child = false } = {}) {
  // Infrastructure + platform SDs skew toward larger gaps; children skew smaller.
  const typeBias = /infra|platform|protocol|architecture/i.test(sd_type) ? 1 : 0;
  const childBias = is_child ? -1 : 0;
  const score =
    (description_words >= SCOPE_THRESHOLDS.LARGE_WORDS ? 2 : description_words >= SCOPE_THRESHOLDS.SMALL_WORDS ? 1 : 0) +
    (key_changes_len >= SCOPE_THRESHOLDS.LARGE_CHANGES ? 2 : key_changes_len >= SCOPE_THRESHOLDS.SMALL_CHANGES ? 1 : 0) +
    typeBias + childBias;
  if (score <= 1) return 'SMALL';
  if (score <= 3) return 'MEDIUM';
  return 'LARGE';
}

// ── Priors bootstrap ──────────────────────────────────────────────────────

/**
 * Load empirical gap-distribution priors from last 30 days of sd_phase_handoffs
 * and sub_agent_execution_results. Falls back to phase-level priors for sparse
 * buckets (<10 samples). Honors FLEET_MC_PRIOR_FILE override.
 *
 * Returns { priors: {phase: {bucket: {mean, stddev}}}, source: 'empirical_30d'|'file_override'|'fallback' }
 */
async function bootstrapPriors(supabase) {
  const overridePath = process.env.FLEET_MC_PRIOR_FILE;
  if (overridePath) {
    try {
      const raw = fs.readFileSync(overridePath, 'utf8');
      const parsed = JSON.parse(raw);
      validatePriorShape(parsed);
      return { priors: parsed, source: 'file_override' };
    } catch (err) {
      process.stderr.write(`[fleet-mc] FLEET_MC_PRIOR_FILE load failed (${err.message}); falling back\n`);
    }
  }

  if (!supabase) {
    return { priors: cloneFallbackPriors(), source: 'fallback' };
  }

  const since = new Date(Date.now() - PRIOR_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

  // Pull handoff gaps (proxy for phase activity cadence): diff between
  // consecutive created_at values per sd.
  const handoffs = await safeSelect(supabase, 'sd_phase_handoffs',
    'sd_key, from_phase, to_phase, created_at',
    { since, column: 'created_at' });

  // Pull sub-agent execution durations (proxy for work cadence within a phase).
  const subAgent = await safeSelect(supabase, 'sub_agent_execution_results',
    'sd_id, sub_agent_code, created_at, updated_at',
    { since, column: 'created_at' });

  // Aggregate inter-event gaps per (phase, bucket). We don't have scope_bucket
  // on historical rows, so we infer it via a join to SDs for description length.
  const sdScope = new Map();
  if (handoffs.length + subAgent.length > 0) {
    const sdKeysOrIds = new Set([
      ...handoffs.map(h => h.sd_key).filter(Boolean),
      ...subAgent.map(s => s.sd_id).filter(Boolean),
    ]);
    if (sdKeysOrIds.size > 0) {
      const keys = Array.from(sdKeysOrIds);
      const sds = await safeSelect(supabase, 'strategic_directives_v2',
        'id, sd_key, description, key_changes, sd_type, parent_sd_id',
        { keys });
      for (const sd of sds) {
        const words = wordCount(sd.description);
        const klen = Array.isArray(sd.key_changes) ? sd.key_changes.length : 0;
        const bucket = classifyScope({
          description_words: words,
          key_changes_len: klen,
          sd_type: sd.sd_type || '',
          is_child: !!sd.parent_sd_id,
        });
        sdScope.set(sd.sd_key, bucket);
        sdScope.set(sd.id, bucket);
      }
    }
  }

  // Build gap samples keyed by (phase, bucket). For handoffs, gap = time
  // between adjacent handoff rows for the same SD (signal: cadence of
  // LEAD/PLAN/EXEC transitions). For sub-agent events, gap = updated_at -
  // created_at (signal: wall-time of a sub-agent call).
  const gapMap = new Map(); // "PHASE|BUCKET" -> number[]
  const pushGap = (phase, bucket, minutes) => {
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const key = `${phase}|${bucket}`;
    if (!gapMap.has(key)) gapMap.set(key, []);
    gapMap.get(key).push(minutes);
  };

  // Handoffs: sort per SD and diff consecutive created_at.
  const byHandoffSd = groupBy(handoffs, 'sd_key');
  for (const [sdKey, rows] of byHandoffSd) {
    const bucket = sdScope.get(sdKey) || 'MEDIUM';
    const sorted = rows.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < sorted.length; i++) {
      const minutes = (new Date(sorted[i].created_at) - new Date(sorted[i - 1].created_at)) / 60000;
      const phase = normalizePhase(sorted[i].from_phase || sorted[i].to_phase || 'EXEC');
      pushGap(phase, bucket, minutes);
    }
  }

  // Sub-agent events: duration of the call itself.
  for (const row of subAgent) {
    const created = row.created_at ? new Date(row.created_at) : null;
    const updated = row.updated_at ? new Date(row.updated_at) : null;
    if (!created || !updated) continue;
    const minutes = (updated - created) / 60000;
    const bucket = sdScope.get(row.sd_id) || 'MEDIUM';
    // Sub-agent events are typically mid-EXEC; use EXEC bucket by default.
    pushGap('EXEC', bucket, minutes);
  }

  // Build priors with sparse-bucket fallback.
  const priors = {};
  const warnings = [];
  for (const phase of PHASES) {
    priors[phase] = {};
    const phaseSamples = [];
    for (const bucket of BUCKETS) {
      const key = `${phase}|${bucket}`;
      const arr = gapMap.get(key) || [];
      if (arr.length >= 1) phaseSamples.push(...arr);
      if (arr.length >= SPARSE_BUCKET_THRESHOLD) {
        priors[phase][bucket] = { mean: mean(arr), stddev: stddev(arr) };
      } else {
        priors[phase][bucket] = null; // placeholder; resolved after phase scan
        if (arr.length > 0) {
          warnings.push(`Sparse bucket (${phase},${bucket}) count=${arr.length} < ${SPARSE_BUCKET_THRESHOLD}, falling back to phase-level prior`);
        }
      }
    }
    // Phase-level fallback distribution.
    const phaseFallback = phaseSamples.length >= SPARSE_BUCKET_THRESHOLD
      ? { mean: mean(phaseSamples), stddev: stddev(phaseSamples) }
      : FALLBACK_PRIORS[phase].MEDIUM;
    for (const bucket of BUCKETS) {
      if (priors[phase][bucket] === null) priors[phase][bucket] = { ...phaseFallback };
    }
  }

  for (const w of warnings) process.stderr.write(`[fleet-mc] ${w}\n`);

  const hasAnyEmpirical = gapMap.size > 0;
  return {
    priors,
    source: hasAnyEmpirical ? 'empirical_30d' : 'fallback',
  };
}

function validatePriorShape(obj) {
  for (const phase of PHASES) {
    if (!obj[phase]) throw new Error(`prior missing phase ${phase}`);
    for (const bucket of BUCKETS) {
      const cell = obj[phase][bucket];
      if (!cell || !Number.isFinite(cell.mean) || !Number.isFinite(cell.stddev)) {
        throw new Error(`prior missing numeric (mean,stddev) for ${phase}/${bucket}`);
      }
    }
  }
}

function cloneFallbackPriors() {
  const out = {};
  for (const phase of PHASES) {
    out[phase] = {};
    for (const bucket of BUCKETS) out[phase][bucket] = { ...FALLBACK_PRIORS[phase][bucket] };
  }
  return out;
}

// ── Core MC engine ────────────────────────────────────────────────────────

/**
 * computeLiveness — primary entry point.
 *
 * Inputs:
 *   session:   { session_id, heartbeat_age_sec, phase, scope_bucket, pid_alive, port_open, worktree_path, sd_id }
 *   history:   { recent_commit_sec?, in_sub_agent_window?, sub_agent_wall_time_p95_min?, in_transition_window?, last_handoff_sec? }
 *   priors:    bootstrapPriors() output (priors map)
 *   options:   { draws?: number, now?: Date }
 *
 * Returns { pAlive, ci_low, ci_high, samples, signals }
 */
function computeLiveness(session, history = {}, priors, options = {}) {
  const draws = options.draws || DEFAULT_DRAWS;
  const phase = normalizePhase(session.phase);
  const bucket = session.scope_bucket || 'MEDIUM';

  const signals = {
    heartbeat_age_sec: session.heartbeat_age_sec,
    pid_alive: !!session.pid_alive,
    port_open: !!session.port_open,
    recent_commit_sec: history.recent_commit_sec ?? null,
    in_sub_agent_window: !!history.in_sub_agent_window,
    in_transition_window: !!history.in_transition_window,
    sub_agent_wall_time_p95_min: history.sub_agent_wall_time_p95_min ?? null,
    scope_bucket: bucket,
    phase,
  };

  // Short-circuit: recent commit (<3m) on worker branch → P(alive) ≥ 0.99.
  // Keeps the dashboard honest when a worker just pushed code but the
  // heartbeat hook hasn't fired yet.
  if (
    Number.isFinite(signals.recent_commit_sec) &&
    signals.recent_commit_sec >= 0 &&
    signals.recent_commit_sec <= RECENT_COMMIT_WINDOW_SEC
  ) {
    return {
      pAlive: RECENT_COMMIT_SHORT_CIRCUIT_P,
      ci_low: 0.95,
      ci_high: 1.0,
      samples: 0,
      signals: { ...signals, short_circuit: 'recent_commit' },
    };
  }

  // Short-circuit: fresh heartbeat (<5m) — treat as ACTIVE regardless of
  // pid/port marker availability. Markers can legitimately be missing (wrong
  // marker dir, session just started, marker capture pending) without the
  // session being dead. The existing sweep classifier uses the same 5m
  // threshold, so this keeps behavior aligned (PRD TS-9).
  if (
    Number.isFinite(signals.heartbeat_age_sec) &&
    signals.heartbeat_age_sec >= 0 &&
    signals.heartbeat_age_sec < FRESH_HEARTBEAT_WINDOW_SEC
  ) {
    return {
      pAlive: FRESH_HEARTBEAT_SHORT_CIRCUIT_P,
      ci_low: 0.93,
      ci_high: 1.0,
      samples: 0,
      signals: { ...signals, short_circuit: 'fresh_heartbeat' },
    };
  }

  // Pull gap distribution params, apply context adjustments.
  let params = priors?.[phase]?.[bucket]
    ? { ...priors[phase][bucket] }
    : { ...FALLBACK_PRIORS[phase][bucket] };

  if (signals.in_sub_agent_window) {
    // Sub-agent in flight → gap distribution widens to cover agent wall-time.
    const widenBy = signals.sub_agent_wall_time_p95_min || params.stddev * SUB_AGENT_WINDOW_WIDEN_FACTOR;
    params = { mean: params.mean + widenBy * 0.25, stddev: params.stddev * SUB_AGENT_WINDOW_WIDEN_FACTOR };
  }
  if (signals.in_transition_window) {
    // Phase transition → handoff.js shell work creates natural gap → shift mean.
    params = { ...params, mean: params.mean + TRANSITION_WINDOW_SHIFT_MIN };
  }

  // Joint (pid,port) likelihood ratio — evidence strength, not probability.
  const key = (signals.pid_alive ? 'T' : 'F') + (signals.port_open ? 'T' : 'F');
  const lrPidPort = (JOINT_CONFUSION.alive[key] || 1e-3) / (JOINT_CONFUSION.dead[key] || 1e-3);

  // Heartbeat age likelihood: if age ≤ sampled gap, session is still alive.
  // Draw 'draws' samples from gap distribution and check how many exceed the
  // observed heartbeat age.
  const hbAgeMin = (signals.heartbeat_age_sec || 0) / 60;
  let hbSuccesses = 0;
  for (let i = 0; i < draws; i++) {
    const gapMin = sampleGapDistribution(params);
    if (hbAgeMin <= gapMin) hbSuccesses++;
  }
  const pHbAlive = hbSuccesses / draws;
  const pHbDead = 1 - pHbAlive;

  // Bayesian combination: prior 0.5 (uninformative at this step) × HB evidence × joint-signal LR.
  // Posterior odds = prior-odds × HB-LR × joint-LR.
  const lrHb = pHbAlive > 0 && pHbDead > 0 ? pHbAlive / pHbDead : (pHbAlive > 0 ? 1e6 : 1e-6);
  const posteriorOdds = 1.0 * lrHb * lrPidPort;
  const pAlive = posteriorOdds / (1 + posteriorOdds);

  // Credible interval — treat successes out of draws as Binomial(draws, p_hb),
  // then widen by |pAlive - pHbAlive| to propagate the Bayes-combined shift.
  const ci = betaCredibleInterval(hbSuccesses, draws);
  const shift = pAlive - pHbAlive;
  const ci_low = clamp01(ci.low + shift * 0.5);
  const ci_high = clamp01(ci.high + shift * 0.5);
  // Enforce monotonicity: ci_low <= p <= ci_high.
  const ci_low_final = Math.min(ci_low, pAlive);
  const ci_high_final = Math.max(ci_high, pAlive);

  return {
    pAlive: round4(pAlive),
    ci_low: round4(ci_low_final),
    ci_high: round4(ci_high_final),
    samples: draws,
    signals,
  };
}

/**
 * runFleetMC — fleet-level orchestration.
 *
 * Inputs:
 *   sessions: array of session rows (from v_active_sessions or equivalent)
 *   options:
 *     cycles, horizonMin, supabase, priors
 *
 * Returns { workers: [{session_id, p_alive, ci_low, ci_high, samples, signals}],
 *           etaDistribution: { p50, p80, p95, probability_table } }
 */
async function runFleetMC({ sessions = [], cycles = DEFAULT_DRAWS, horizonMin = DEFAULT_HORIZON_MIN, supabase, priors, historyByWorker } = {}) {
  if (!priors) {
    const result = await bootstrapPriors(supabase);
    priors = result.priors;
  }
  const workers = [];
  for (const s of sessions) {
    const history = (historyByWorker && historyByWorker[s.session_id]) || {};
    const out = computeLiveness(s, history, priors, { draws: cycles });
    workers.push({
      session_id: s.session_id,
      p_alive: out.pAlive,
      ci_low: out.ci_low,
      ci_high: out.ci_high,
      samples: out.samples,
      signals: out.signals,
    });
  }

  const etaDistribution = computeEtaDistribution(workers, horizonMin);
  return { workers, etaDistribution };
}

/**
 * Compute fleet-level ETA distribution. Heuristic: given each worker's
 * P(alive), the probability that work is "done by time T" scales with both
 * mean P(alive) across active workers and the fraction of work remaining.
 * This module does not know the queue shape, so callers can provide it via
 * `options.remainingCount` later. For now we model P(done by H) via a
 * geometric approximation: P(done by T) = 1 - (1 - mean(p_alive))^(T/mean_gap).
 */
function computeEtaDistribution(workers, horizonMin) {
  const probabilityTable = [];
  const horizons = [30, 60, 90, 120].filter(h => h <= horizonMin);
  if (horizons.length === 0) horizons.push(horizonMin);
  const meanPAlive = workers.length > 0
    ? workers.reduce((sum, w) => sum + w.p_alive, 0) / workers.length
    : 0;
  // Reference gap: assume median EXEC/MEDIUM gap ≈ 10m (covered by priors).
  const referenceGapMin = 10;
  for (const h of horizons) {
    const cycles = h / referenceGapMin;
    const pDone = 1 - Math.pow(Math.max(1 - meanPAlive, 0), cycles);
    probabilityTable.push({ horizon_min: h, p_done: round4(pDone) });
  }
  // ETA quantiles from probabilityTable: invert P(done by T) for p50/p80/p95.
  const now = Date.now();
  const invert = (target) => {
    if (meanPAlive <= 0) return new Date(now + horizonMin * 60 * 1000).toISOString();
    const cycles = Math.log(Math.max(1 - target, 1e-6)) / Math.log(Math.max(1 - meanPAlive, 1e-6));
    const minutes = cycles * referenceGapMin;
    return new Date(now + Math.min(Math.max(minutes, 0), horizonMin * 6) * 60 * 1000).toISOString();
  };
  return {
    p50: invert(0.5),
    p80: invert(0.8),
    p95: invert(0.95),
    probability_table: probabilityTable,
  };
}

// ── Calibration back-fill ─────────────────────────────────────────────────

/**
 * backfillCalibration — close the loop.
 *
 * For each row in fleet_liveness_estimates with actual_liveness_t5 IS NULL
 * and observed_at older than 5m, determine ground truth:
 *   actual_liveness_t5 = TRUE iff the worker emitted a heartbeat OR a commit
 *   within 5m of observed_at.
 *
 * Idempotent by construction (only updates NULL rows).
 */
async function backfillCalibration(supabase, options = {}) {
  if (!supabase) return { updated: 0, pending: 0 };
  const now = Date.now();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
  const { data: rows, error } = await supabase
    .from('fleet_liveness_estimates')
    .select('id, session_id, observed_at')
    .is('actual_liveness_t5', null)
    .lte('observed_at', fiveMinAgo)
    .order('observed_at', { ascending: true })
    .limit(options.batchSize || 500);
  if (error) {
    process.stderr.write(`[fleet-mc] calibration query failed: ${error.message}\n`);
    return { updated: 0, pending: 0 };
  }
  if (!rows || rows.length === 0) return { updated: 0, pending: 0 };

  // Group by session_id and fetch heartbeat history per session in one shot.
  const bySession = groupBy(rows, 'session_id');
  let updated = 0;
  for (const [sessionId, sessionRows] of bySession) {
    const { data: sess } = await supabase
      .from('claude_sessions')
      .select('session_id, heartbeat_at, worktree_path')
      .eq('session_id', sessionId)
      .maybeSingle();
    for (const row of sessionRows) {
      const observed = new Date(row.observed_at).getTime();
      const tolerance = 5 * 60 * 1000;
      let alive = false;
      if (sess?.heartbeat_at) {
        const hb = new Date(sess.heartbeat_at).getTime();
        if (Math.abs(hb - observed) <= tolerance || hb > observed) alive = true;
      }
      if (!alive && sess?.worktree_path) {
        alive = hasRecentCommit(sess.worktree_path, observed, tolerance);
      }
      const { error: upErr } = await supabase
        .from('fleet_liveness_estimates')
        .update({ actual_liveness_t5: alive })
        .eq('id', row.id)
        .is('actual_liveness_t5', null);
      if (!upErr) updated++;
    }
  }
  return { updated, pending: rows.length - updated };
}

function hasRecentCommit(worktreePath, observedMs, toleranceMs) {
  try {
    const stdout = execSync('git log -1 --format=%ct', {
      cwd: worktreePath,
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim();
    const commitEpochSec = parseInt(stdout, 10);
    if (!Number.isFinite(commitEpochSec)) return false;
    const commitMs = commitEpochSec * 1000;
    return commitMs >= observedMs - toleranceMs && commitMs <= observedMs + toleranceMs;
  } catch {
    return false;
  }
}

// ── Persistence ───────────────────────────────────────────────────────────

/**
 * persistEstimate — write one fleet_liveness_estimates row per worker per cycle.
 * Best-effort: errors are logged but do not throw (dashboard rendering must
 * not break on persist failures).
 */
async function persistEstimate(supabase, session, estimate) {
  if (!supabase) return { ok: false, error: 'no supabase client' };
  const row = {
    session_id: session.session_id,
    heartbeat_age_sec: Math.max(Math.round(session.heartbeat_age_sec || 0), 0),
    pid_alive: !!session.pid_alive,
    port_open: !!session.port_open,
    phase: normalizePhase(session.phase),
    scope_bucket: session.scope_bucket || 'MEDIUM',
    p_alive: estimate.pAlive,
    p_alive_ci_low: estimate.ci_low,
    p_alive_ci_high: estimate.ci_high,
    mc_samples: estimate.samples,
  };
  const { error } = await supabase.from('fleet_liveness_estimates').insert(row);
  if (error) {
    process.stderr.write(`[fleet-mc] persist failed for ${session.session_id}: ${error.message}\n`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ── Data gathering (CLI entry point) ──────────────────────────────────────

/**
 * gatherWorkerContext — fetch session rows + per-worker history signals.
 * Returns { sessions, historyByWorker }.
 */
async function gatherWorkerContext(supabase, filterSessionIds) {
  // v_active_sessions exposes: session_id, sd_id, sd_key, heartbeat_age_seconds,
  // tty, pid, current_branch, terminal_id, etc.  It does NOT expose
  // current_phase or worktree_path — those live on the base claude_sessions
  // row. Query the base table for those two columns and join in memory.
  //
  // NOTE: `v_active_sessions` is historical-inclusive despite the name — it
  // does not filter by status. Limit to rows that currently hold a claim:
  // sd_key IS NOT NULL AND status='active'. This mirrors fleet-dashboard.cjs.
  let q = supabase
    .from('v_active_sessions')
    .select('session_id, sd_key, sd_id, heartbeat_age_seconds, hostname, tty, pid, current_branch, terminal_id, status')
    .not('sd_key', 'is', null)
    .eq('status', 'active');
  if (filterSessionIds && filterSessionIds.length > 0) {
    q = q.in('session_id', filterSessionIds);
  }
  const { data: rows, error } = await q;
  if (error) {
    process.stderr.write(`[fleet-mc] v_active_sessions query failed: ${error.message}\n`);
    return { sessions: [], historyByWorker: {} };
  }
  // Enrich with current_phase + worktree_path from claude_sessions (single
  // query, then index by session_id).
  const phaseMap = new Map();
  if ((rows || []).length > 0) {
    const ids = rows.map(r => r.session_id);
    const { data: extra } = await supabase
      .from('claude_sessions')
      .select('session_id, current_phase, worktree_path')
      .in('session_id', ids);
    for (const row of extra || []) phaseMap.set(row.session_id, row);
  }

  const markers = loadPidMarkers();
  const sessions = [];
  const historyByWorker = {};
  for (const row of rows || []) {
    const marker = markers.byClaudeSession[row.session_id];
    const pid_alive = marker ? isProcessRunning(marker.pid) : false;
    let port_open = false;
    if (marker && marker.sse_port) {
      port_open = await probeMcpPort(marker.sse_port);
    }
    const sdMeta = await fetchSdScope(supabase, row.sd_key || row.sd_id);
    const enrich = phaseMap.get(row.session_id) || {};
    const session = {
      session_id: row.session_id,
      heartbeat_age_sec: Math.max(row.heartbeat_age_seconds || 0, 0),
      phase: enrich.current_phase || 'EXEC',
      scope_bucket: sdMeta.bucket,
      pid_alive,
      port_open,
      worktree_path: enrich.worktree_path || null,
      sd_id: row.sd_id,
      sd_key: row.sd_key,
    };
    sessions.push(session);
    historyByWorker[row.session_id] = await buildHistory(
      supabase,
      { ...row, worktree_path: enrich.worktree_path || null },
      sdMeta
    );
  }
  return { sessions, historyByWorker };
}

async function buildHistory(supabase, row, sdMeta) {
  const history = {
    recent_commit_sec: null,
    in_sub_agent_window: false,
    sub_agent_wall_time_p95_min: null,
    in_transition_window: false,
    last_handoff_sec: null,
  };
  // Recent commit on worker branch.
  if (row.worktree_path) {
    try {
      const out = execSync('git log -1 --format=%ct', {
        cwd: row.worktree_path,
        timeout: 1500,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().trim();
      const ts = parseInt(out, 10);
      if (Number.isFinite(ts)) {
        history.recent_commit_sec = Math.max(Math.floor(Date.now() / 1000) - ts, 0);
      }
    } catch { /* ignore — branch may be absent or git not on path */ }
  }
  // Sub-agent in flight for this SD.
  if (row.sd_id) {
    const { data: subAgent } = await supabase
      .from('sub_agent_execution_results')
      .select('created_at, updated_at')
      .eq('sd_id', row.sd_id)
      .order('created_at', { ascending: false })
      .limit(5);
    if (subAgent && subAgent.length > 0) {
      const latest = subAgent[0];
      const createdMs = new Date(latest.created_at).getTime();
      const updatedMs = latest.updated_at ? new Date(latest.updated_at).getTime() : null;
      // In-flight if the latest row was created < 15m ago and updated_at
      // equals created_at (no end recorded).
      if (createdMs && Date.now() - createdMs < 15 * 60 * 1000 && (!updatedMs || Math.abs(updatedMs - createdMs) < 1000)) {
        history.in_sub_agent_window = true;
      }
      // p95 wall time — approximate via max over the recent 5 rows.
      const walls = subAgent
        .map(r => (r.updated_at && r.created_at) ? (new Date(r.updated_at) - new Date(r.created_at)) / 60000 : 0)
        .filter(m => m > 0)
        .sort((a, b) => a - b);
      if (walls.length > 0) history.sub_agent_wall_time_p95_min = walls[Math.floor(walls.length * 0.95)] || walls[walls.length - 1];
    }
  }
  // Transition window: last handoff < 5m ago.
  if (row.sd_id) {
    const { data: ho } = await supabase
      .from('sd_phase_handoffs')
      .select('created_at')
      .eq('sd_id', row.sd_id)
      .order('created_at', { ascending: false })
      .limit(1);
    if (ho && ho.length > 0) {
      const age = (Date.now() - new Date(ho[0].created_at).getTime()) / 1000;
      history.last_handoff_sec = age;
      history.in_transition_window = age <= TRANSITION_WINDOW_SEC;
    }
  }
  return history;
}

async function fetchSdScope(supabase, sdKeyOrId) {
  if (!sdKeyOrId) return { bucket: 'MEDIUM' };
  const { data } = await supabase
    .from('strategic_directives_v2')
    .select('description, key_changes, sd_type, parent_sd_id')
    .or(`sd_key.eq.${sdKeyOrId},id.eq.${sdKeyOrId}`)
    .maybeSingle();
  if (!data) return { bucket: 'MEDIUM' };
  const bucket = classifyScope({
    description_words: wordCount(data.description),
    key_changes_len: Array.isArray(data.key_changes) ? data.key_changes.length : 0,
    sd_type: data.sd_type || '',
    is_child: !!data.parent_sd_id,
  });
  return { bucket };
}

function resolveMarkerDir() {
  // Allow explicit override — useful for worktree runs or test fixtures.
  if (process.env.FLEET_MC_MARKER_DIR) return process.env.FLEET_MC_MARKER_DIR;
  // Primary: sibling .claude/ in the repo this script lives in.
  const local = path.resolve(__dirname, '../.claude/session-identity');
  if (fs.existsSync(local)) return local;
  // Fallback: walk up until we find a directory that contains both a
  // .git/worktrees/ folder AND .claude/session-identity — that's the canonical
  // main-repo marker dir when we're executing from a worktree.
  let cur = path.resolve(__dirname, '..');
  for (let i = 0; i < 6; i++) {
    const parent = path.resolve(cur, '..');
    if (parent === cur) break;
    const candidate = path.resolve(parent, '.claude/session-identity');
    if (fs.existsSync(candidate)) return candidate;
    cur = parent;
  }
  return local; // non-existent, but keeps downstream code simple
}

function loadPidMarkers() {
  const markerDir = resolveMarkerDir();
  const byClaudeSession = {};
  if (!fs.existsSync(markerDir)) return { byClaudeSession };
  for (const f of fs.readdirSync(markerDir)) {
    if (!f.endsWith('.json') || f === 'current') continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(markerDir, f), 'utf8'));
      if (raw.session_id) {
        byClaudeSession[raw.session_id] = {
          pid: Number(raw.cc_pid),
          sse_port: raw.sse_port,
          captured_at: raw.captured_at,
        };
      }
    } catch { /* skip bad markers */ }
  }
  return { byClaudeSession };
}

function isProcessRunning(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try { process.kill(pid, 0); return true; }
  catch (err) { return err.code === 'EPERM'; }
}

// ── Utils ─────────────────────────────────────────────────────────────────

function wordCount(s) {
  return (s || '').trim().split(/\s+/).filter(Boolean).length;
}

function normalizePhase(p) {
  if (!p) return 'EXEC';
  const upper = String(p).toUpperCase();
  if (upper.startsWith('LEAD')) return 'LEAD';
  if (upper.startsWith('PLAN')) return 'PLAN';
  return 'EXEC';
}

function groupBy(arr, key) {
  const m = new Map();
  for (const row of arr) {
    const k = row[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(row);
  }
  return m;
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function stddev(arr) {
  const m = mean(arr);
  const variance = arr.reduce((acc, x) => acc + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(Math.max(variance, 1e-6));
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function round4(x) { return Math.round(x * 10000) / 10000; }

async function safeSelect(supabase, table, cols, opts = {}) {
  let q = supabase.from(table).select(cols);
  if (opts.since && opts.column) q = q.gte(opts.column, opts.since);
  if (opts.keys && opts.keys.length > 0) {
    // Try matching either sd_key or id (common for v2 tables).
    const ors = opts.keys.slice(0, 200).map(k => `sd_key.eq.${k},id.eq.${k}`).join(',');
    q = q.or(ors);
  }
  q = q.limit(opts.limit || 5000);
  const { data, error } = await q;
  if (error) {
    process.stderr.write(`[fleet-mc] ${table} query failed: ${error.message}\n`);
    return [];
  }
  return data || [];
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function cliMain(argv) {
  const args = parseArgs(argv);
  const enabled = (process.env.FLEET_MC_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!enabled) {
    const out = { workers: [], etaDistribution: { p50: null, p80: null, p95: null, probability_table: [] }, generated_at: new Date().toISOString(), prior_source: 'disabled' };
    writeOutput(out, args);
    return 0;
  }

  let supabase;
  try { supabase = createSupabaseServiceClient(); }
  catch (err) {
    process.stderr.write(`[fleet-mc] supabase client init failed: ${err.message}\n`);
    writeOutput({ workers: [], etaDistribution: emptyEta(), generated_at: new Date().toISOString(), prior_source: 'error' }, args);
    return 0;
  }

  const priorBootstrap = await bootstrapPriors(supabase);
  const { sessions, historyByWorker } = await gatherWorkerContext(supabase, args.workers);
  const fleet = await runFleetMC({
    sessions,
    cycles: args.draws || DEFAULT_DRAWS,
    supabase,
    priors: priorBootstrap.priors,
    historyByWorker,
  });

  // Persist each estimate (best-effort).
  for (const w of fleet.workers) {
    const session = sessions.find(s => s.session_id === w.session_id);
    if (!session) continue;
    await persistEstimate(supabase, session, { pAlive: w.p_alive, ci_low: w.ci_low, ci_high: w.ci_high, samples: w.samples });
  }

  // Calibration back-fill runs once per invocation (idempotent).
  await backfillCalibration(supabase);

  const out = {
    workers: fleet.workers,
    etaDistribution: fleet.etaDistribution,
    generated_at: new Date().toISOString(),
    prior_source: priorBootstrap.source,
  };
  writeOutput(out, args);
  return 0;
}

function emptyEta() { return { p50: null, p80: null, p95: null, probability_table: [] }; }

function parseArgs(argv) {
  const args = { json: true, table: false, workers: null, draws: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') { args.json = true; args.table = false; }
    else if (a === '--table') { args.json = false; args.table = true; }
    else if (a === '--workers') { args.workers = (argv[++i] || '').split(',').filter(Boolean); }
    else if (a === '--draws') { args.draws = parseInt(argv[++i], 10) || null; }
  }
  return args;
}

function writeOutput(out, args) {
  if (args.table) {
    writeTable(out);
    return;
  }
  process.stdout.write(JSON.stringify(out));
}

function writeTable(out) {
  const rows = out.workers || [];
  const lines = [];
  lines.push('SESSION                              P(ALIVE)  CI-LOW  CI-HIGH  PHASE  BUCKET  HB-AGE  SIGNALS');
  lines.push('─'.repeat(110));
  for (const w of rows) {
    const sig = w.signals || {};
    const bar = pbar(w.p_alive, 10);
    lines.push(
      `${w.session_id.padEnd(36)} ${bar} ${w.p_alive.toFixed(4)}  ${w.ci_low.toFixed(4)}  ${w.ci_high.toFixed(4)}  ${String(sig.phase || '-').padEnd(5)}  ${String(sig.scope_bucket || '-').padEnd(6)}  ${String(sig.heartbeat_age_sec || 0).padEnd(6)}  pid=${sig.pid_alive ? 'Y' : 'N'} port=${sig.port_open ? 'Y' : 'N'} agent=${sig.in_sub_agent_window ? 'Y' : 'N'} transit=${sig.in_transition_window ? 'Y' : 'N'}`
    );
  }
  lines.push('');
  lines.push(`ETA p50=${out.etaDistribution.p50 || '-'} p80=${out.etaDistribution.p80 || '-'} p95=${out.etaDistribution.p95 || '-'}`);
  lines.push(`prior_source=${out.prior_source}`);
  process.stderr.write(lines.join('\n') + '\n');
}

function pbar(p, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((p || 0) * width)));
  return '\u2593'.repeat(filled) + '\u2591'.repeat(width - filled);
}

// ── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  computeLiveness,
  runFleetMC,
  classifyScope,
  bootstrapPriors,
  backfillCalibration,
  probeMcpPort,
  sampleGapDistribution,
  sampleNormal,
  betaCredibleInterval,
  incompleteBeta,
  persistEstimate,
  gatherWorkerContext,
  computeEtaDistribution,
  JOINT_CONFUSION,
  FALLBACK_PRIORS,
  DEFAULT_DRAWS,
  TRANSITION_WINDOW_SEC,
  RECENT_COMMIT_WINDOW_SEC,
  cliMain,
};

if (require.main === module) {
  cliMain(process.argv.slice(2)).then(code => process.exit(code || 0));
}
