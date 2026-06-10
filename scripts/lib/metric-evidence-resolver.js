/**
 * Metric Evidence Resolver — grounds SUCCESS_METRICS achievement in machine-checkable
 * evidence instead of self-reported free text. SD-LEO-INFRA-GROUND-SUCCESS-METRICS-001.
 *
 * Each success_metrics entry may carry an OPT-IN binding:
 *   { evidence: { kind: 'test'|'git'|'db_probe'|'gate_score', ref } }
 *
 * Kinds:
 *   test       ref = test file path. VERIFIED iff the file exists AND a single bounded
 *              vitest run on that file exits 0. Spawn failure / timeout = UNRESOLVABLE
 *              (never a contradiction — infrastructure flake must not fabricate failure).
 *   git        ref = 'PR#123' | '#123' | {pr:123} | <40-hex sha> | {commit:sha}.
 *              PR: VERIFIED iff `gh pr view` reports state MERGED.
 *              Commit: VERIFIED iff `git merge-base --is-ancestor <sha> origin/main` exits 0.
 *   db_probe   ref = { table, match: {col: val, ...}, expect: '<op><num>' } — DECLARATIVE
 *              ONLY (no raw SQL, ever). Resolved as a supabase head-count with eq filters,
 *              compared against expect.
 *   gate_score ref = { handoff: 'EXEC-TO-PLAN', expect: '>=85' }. VERIFIED iff the latest
 *              ACCEPTED sd_phase_handoffs row of that type for this SD has a
 *              validation_score meeting expect. A missing accepted row is UNRESOLVABLE
 *              (the SD's own in-flight handoff is never self-referenced).
 *
 * Outcomes (the resolver NEVER throws into the gate):
 *   { bound: true, resolved: true,  verified: boolean, detail: string }
 *   { bound: true, resolved: false, reason: string }            // fail-open → advisory
 *   { bound: false }                                            // no binding on the metric
 *
 * Dependency-injected for hermetic tests: ctx = { supabase, sdUuid, repoRoot, exec }.
 * `exec(file, args, opts)` defaults to child_process.execFileSync with stdio:'pipe' and a
 * hard timeout — unit tests inject a fake and never spawn real processes.
 */

import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

/** Hard timeout for the in-gate vitest run (test kind). Bindings are opt-in and rare. */
export const TEST_RUN_TIMEOUT_MS = 180_000;
/** Hard timeout for git/gh executions. */
const VCS_TIMEOUT_MS = 15_000;

const SHA_RE = /^[0-9a-f]{7,40}$/i;
const PR_RE = /^(?:PR)?#?(\d+)$/i;
const EXPECT_RE = /^\s*(>=|<=|>|<|==?|≥|≤)?\s*([\d.]+)\s*$/;

/** Compare a number against an '<op><num>' expectation string (default op >=). */
export function compareExpect(value, expect) {
  if (value == null || expect == null) return null;
  const m = String(expect).match(EXPECT_RE);
  if (!m) return null;
  const op = m[1] === '≥' ? '>=' : m[1] === '≤' ? '<=' : (m[1] || '>=');
  const num = parseFloat(m[2]);
  if (Number.isNaN(num)) return null;
  switch (op) {
    case '>=': return value >= num;
    case '>':  return value > num;
    case '<=': return value <= num;
    case '<':  return value < num;
    case '=':
    case '==': return value === num;
    default:   return value >= num;
  }
}

/** Normalize a git ref into {pr} | {commit} | null. Exported for tests. */
export function parseGitRef(ref) {
  if (ref == null) return null;
  if (typeof ref === 'object') {
    if (ref.pr != null && /^\d+$/.test(String(ref.pr))) return { pr: Number(ref.pr) };
    if (typeof ref.commit === 'string' && SHA_RE.test(ref.commit.trim())) return { commit: ref.commit.trim() };
    return null;
  }
  const s = String(ref).trim();
  const pr = s.match(PR_RE);
  if (pr) return { pr: Number(pr[1]) };
  if (SHA_RE.test(s)) return { commit: s };
  return null;
}

function defaultExec(file, args, opts = {}) {
  return execFileSync(file, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: opts.timeout ?? VCS_TIMEOUT_MS,
    cwd: opts.cwd,
    windowsHide: true,
  });
}

const unresolvable = (reason) => ({ bound: true, resolved: false, reason });
const resolvedAs = (verified, detail) => ({ bound: true, resolved: true, verified, detail });

async function resolveTest(ref, ctx) {
  if (typeof ref !== 'string' || !ref.trim()) return unresolvable('test ref must be a file path string');
  const rel = ref.trim();
  const abs = join(ctx.repoRoot, rel);
  if (!existsSync(abs)) return unresolvable(`test file not found: ${rel}`);
  try {
    ctx.exec('npx', ['vitest', 'run', rel], { cwd: ctx.repoRoot, timeout: TEST_RUN_TIMEOUT_MS });
    return resolvedAs(true, `test green: ${rel}`);
  } catch (err) {
    // Distinguish "ran and failed" (a real contradiction) from "could not run" (fail-open).
    // execFileSync sets err.status for a non-zero exit; timeouts/spawn errors carry
    // err.signal / ENOENT-style codes with status null/undefined.
    if (err && typeof err.status === 'number' && err.status > 0 && !err.signal) {
      return resolvedAs(false, `test FAILED (exit ${err.status}): ${rel}`);
    }
    return unresolvable(`test runner unavailable (${err?.signal || err?.code || err?.message || 'unknown'}): ${rel}`);
  }
}

async function resolveGit(ref, ctx) {
  const parsed = parseGitRef(ref);
  if (!parsed) return unresolvable(`unrecognized git ref: ${JSON.stringify(ref)}`);
  if (parsed.pr != null) {
    try {
      const out = ctx.exec('gh', ['pr', 'view', String(parsed.pr), '--json', 'state'], { cwd: ctx.repoRoot });
      const state = JSON.parse(out || '{}').state;
      if (state === 'MERGED') return resolvedAs(true, `PR #${parsed.pr} MERGED`);
      return resolvedAs(false, `PR #${parsed.pr} state=${state || 'unknown'} (not MERGED)`);
    } catch (err) {
      return unresolvable(`gh unavailable for PR #${parsed.pr} (${err?.code || err?.message || 'error'})`);
    }
  }
  try {
    ctx.exec('git', ['merge-base', '--is-ancestor', parsed.commit, 'origin/main'], { cwd: ctx.repoRoot });
    return resolvedAs(true, `commit ${parsed.commit.slice(0, 10)} is on origin/main`);
  } catch (err) {
    // exit 1 = definitively NOT an ancestor (a contradiction); anything else = can't tell.
    if (err && err.status === 1 && !err.signal) {
      return resolvedAs(false, `commit ${parsed.commit.slice(0, 10)} is NOT on origin/main`);
    }
    return unresolvable(`git unavailable for commit check (${err?.code || err?.message || 'error'})`);
  }
}

async function resolveDbProbe(ref, ctx) {
  if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return unresolvable('db_probe ref must be {table, match, expect}');
  const { table, match, expect } = ref;
  if (typeof table !== 'string' || !table) return unresolvable('db_probe: table required');
  if (typeof expect !== 'string' || !EXPECT_RE.test(expect)) return unresolvable('db_probe: expect must be "<op><num>"');
  if (match != null && (typeof match !== 'object' || Array.isArray(match))) return unresolvable('db_probe: match must be a {col: val} map');
  if (!ctx.supabase) return unresolvable('db_probe: no supabase client in ctx');
  try {
    let q = ctx.supabase.from(table).select('*', { count: 'exact', head: true });
    for (const [col, val] of Object.entries(match || {})) q = q.eq(col, val);
    const { count, error } = await q;
    if (error) return unresolvable(`db_probe query error: ${error.message}`);
    const met = compareExpect(count ?? 0, expect);
    if (met == null) return unresolvable(`db_probe: cannot compare count ${count} vs "${expect}"`);
    return resolvedAs(met, `db_probe ${table} count=${count ?? 0} vs ${expect}`);
  } catch (err) {
    return unresolvable(`db_probe failed: ${err?.message || 'error'}`);
  }
}

async function resolveGateScore(ref, ctx) {
  if (!ref || typeof ref !== 'object' || typeof ref.handoff !== 'string' || !ref.handoff) {
    return unresolvable('gate_score ref must be {handoff, expect}');
  }
  if (typeof ref.expect !== 'string' || !EXPECT_RE.test(ref.expect)) return unresolvable('gate_score: expect must be "<op><num>"');
  if (!ctx.supabase || !ctx.sdUuid) return unresolvable('gate_score: supabase + sdUuid required in ctx');
  try {
    const { data, error } = await ctx.supabase
      .from('sd_phase_handoffs')
      .select('validation_score, accepted_at')
      .eq('sd_id', ctx.sdUuid)
      .eq('handoff_type', ref.handoff)
      .eq('status', 'accepted')          // ACCEPTED only — never the SD's own in-flight row
      .order('accepted_at', { ascending: false })
      .limit(1);
    if (error) return unresolvable(`gate_score query error: ${error.message}`);
    const row = data && data[0];
    if (!row || row.validation_score == null) return unresolvable(`gate_score: no accepted ${ref.handoff} handoff with a score`);
    const met = compareExpect(Number(row.validation_score), ref.expect);
    if (met == null) return unresolvable(`gate_score: cannot compare ${row.validation_score} vs "${ref.expect}"`);
    return resolvedAs(met, `gate_score ${ref.handoff}=${row.validation_score} vs ${ref.expect}`);
  } catch (err) {
    return unresolvable(`gate_score failed: ${err?.message || 'error'}`);
  }
}

const KIND_RESOLVERS = {
  test: resolveTest,
  git: resolveGit,
  db_probe: resolveDbProbe,
  gate_score: resolveGateScore,
};

/**
 * Resolve one evidence binding. Never throws.
 * @param {{kind: string, ref: any}|null|undefined} evidence
 * @param {{supabase?: object, sdUuid?: string, repoRoot: string, exec?: Function}} ctx
 */
export async function resolveEvidenceBinding(evidence, ctx) {
  if (evidence == null) return { bound: false };
  if (typeof evidence !== 'object' || Array.isArray(evidence)) return unresolvable('evidence must be {kind, ref}');
  const resolver = KIND_RESOLVERS[evidence.kind];
  if (!resolver) return unresolvable(`unknown evidence kind: ${JSON.stringify(evidence.kind)}`);
  const fullCtx = { exec: defaultExec, ...ctx };
  try {
    return await resolver(evidence.ref, fullCtx);
  } catch (err) {
    return unresolvable(`resolver error (${evidence.kind}): ${err?.message || 'unknown'}`);
  }
}

/**
 * Resolve bindings for a metrics array. Returns a Map of metric index → outcome for
 * BOUND metrics only (unbound metrics are absent, keeping their path untouched).
 * @param {Array} metrics - normalized success_metrics entries
 * @param {object} ctx
 * @returns {Promise<Map<number, object>>}
 */
export async function resolveAllBindings(metrics, ctx) {
  const out = new Map();
  if (!Array.isArray(metrics)) return out;
  for (let i = 0; i < metrics.length; i++) {
    const evidence = metrics[i] && metrics[i].evidence;
    if (evidence == null) continue;
    out.set(i, await resolveEvidenceBinding(evidence, ctx));
  }
  return out;
}

/** One concrete example per kind — printed by the gate's self-documenting advisory. */
export const BINDING_EXAMPLES = Object.freeze([
  '{"evidence":{"kind":"git","ref":"PR#4553"}}                                — verified iff the PR is MERGED',
  '{"evidence":{"kind":"test","ref":"tests/unit/foo.test.js"}}                — verified iff that test file runs green',
  '{"evidence":{"kind":"db_probe","ref":{"table":"t","match":{"col":"v"},"expect":">=1"}}} — verified iff the row count meets expect',
  '{"evidence":{"kind":"gate_score","ref":{"handoff":"EXEC-TO-PLAN","expect":">=85"}}}     — verified iff the accepted handoff score meets expect',
]);
