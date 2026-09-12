/**
 * Adam venture-deploy watcher — QF-20260912-924.
 *
 * MEASURED 2026-09-12 10:29-10:36Z by Adam 49eabb23: rickfelix/altifyai's deploy.yml had been
 * red on every run since 09-06 (5/5, gh run list -R rickfelix/altifyai --workflow deploy.yml),
 * unseen for six days because scripts/adam-github-assessment.mjs is hard-scoped to ONE repo
 * (process.env.ADAM_GH_REPO || 'rickfelix/EHG_Engineer') and flag-gated off by default, and
 * lib/eva/synthetic-actor-guard.js only reads the named UAT step at stage-advance time (a red
 * step between advances is invisible). This watcher closes the gap generically: for EVERY
 * venture repo (applications.repo_url), read the latest completed deploy-workflow run every
 * Adam quiet tick. A red step whose ::error:: text names a secret or permission (the two
 * MEASURED fail-loud shapes: a Cloudflare token-scope check, "Workers AI Read missing" HTTP 401;
 * and post-deploy-signed-in-uat, "CHAIRMAN_UAT_SESSION_TOKEN is not configured") becomes ONE
 * durable chairman keystroke via lib/chairman/record-pending-decision.mjs, deduped so it never
 * re-fires while a matching row is still pending. Any OTHER red step is returned for the tick's
 * own QUIET_TICK_VENTURE_DEPLOY_RED line, so the seat sources a venture QF from it.
 *
 * NOT IN SCOPE (explicit per the QF): turning on the flag-gated single-repo assessment, or
 * changing any venture's deploy.yml.
 */
import { execFileSync } from 'node:child_process';
import { recordPendingDecision } from '../chairman/record-pending-decision.mjs';

const DEPLOY_WORKFLOW = 'deploy.yml';
export const DECISION_TYPE = 'venture_deploy_credential';

/**
 * Fixed regex over the fail-loud message shapes already used in deploy.yml (per the fix-shape's
 * own wording) — deliberately NARROW rather than a broad heuristic over any error text. A
 * false-positive here mints an unnecessary chairman keystroke, the more expensive failure mode
 * than under-detecting (which still surfaces via QUIET_TICK_VENTURE_DEPLOY_RED for a human to
 * triage). Matches "<noun> missing/not configured/not set" phrasing (Workers AI Read missing;
 * CHAIRMAN_UAT_SESSION_TOKEN is not configured) alongside a secret/permission-shaped noun, or an
 * HTTP 401/403 auth-failure code.
 */
export const CREDENTIAL_ERROR_RE =
  /::error::[^\r\n]*\b(?:missing|not configured|not set)\b[^\r\n]*|::error::[^\r\n]*\b(?:401|403|unauthorized|forbidden|permission denied)\b/i;

/** Pure: does this one step's raw log text name a credential/permission gap (vs. a code bug)? */
export function isCredentialClassError(logText) {
  return typeof logText === 'string' && CREDENTIAL_ERROR_RE.test(logText);
}

/** Pure: the first `::error::...` line in a step's raw log text, or ''. */
export function extractErrorMessage(logText) {
  const m = typeof logText === 'string' ? logText.match(/::error::[^\r\n]*/) : null;
  return m ? m[0] : '';
}

/** Pure: deterministic dedupe key for one repo+step+message (bounded length for a jsonb column). */
export function buildDedupeKey(repo, step, message) {
  return `${repo}::${step}::${message}`.slice(0, 500);
}

/** Pure: "owner/repo" from a full GitHub URL (https://github.com/owner/repo[.git][/]) or an
 *  already-bare "owner/repo" slug; null when neither shape matches. */
export function parseRepoSlug(repoUrl) {
  if (typeof repoUrl !== 'string' || !repoUrl.trim()) return null;
  const trimmed = repoUrl.trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = trimmed.match(/github\.com[:/]+([^/]+\/[^/]+)$/i);
  if (m) return m[1];
  return /^[\w.-]+\/[\w.-]+$/.test(trimmed) ? trimmed : null;
}

/**
 * Pure: classify one run's failed steps into credential-class keystroke candidates vs.
 * code-class (tick-only) rows.
 * @param {{repo:string, runId:number|string, steps:Array<{step:string,conclusion:string}>, failedLogsByStep:Map<string,string>}} args
 */
export function classifyDeployRun({ repo, runId, steps, failedLogsByStep }) {
  const keystrokes = [];
  const codeClass = [];
  for (const s of steps || []) {
    if (s.conclusion !== 'failure') continue;
    const logText = (failedLogsByStep && failedLogsByStep.get(s.step)) || '';
    const message = extractErrorMessage(logText);
    if (isCredentialClassError(logText)) {
      keystrokes.push({ repo, runId, step: s.step, message, dedupeKey: buildDedupeKey(repo, s.step, message) });
    } else {
      codeClass.push({ repo, runId, step: s.step });
    }
  }
  return { keystrokes, codeClass };
}

function ghJson(args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 }));
  } catch { return null; }
}
function ghRaw(args) {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120_000 });
  } catch { return null; }
}

/** Default: the latest COMPLETED run of deploy.yml for `repo`, or null (fail-soft on any gh error). */
function defaultLatestRun(repo) {
  const runs = ghJson(['run', 'list', '-R', repo, '--workflow', DEPLOY_WORKFLOW, '--limit', '5', '--json', 'databaseId,status,conclusion']);
  return Array.isArray(runs) ? (runs.find((r) => r.status === 'completed') || null) : null;
}

/** Default: [{step, conclusion}] flattened across every job in the run. */
function defaultRunSteps(repo, runId) {
  const jobs = ghJson(['run', 'view', String(runId), '-R', repo, '--json', 'jobs'])?.jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((j) => (j.steps || []).map((s) => ({ step: s.name, conclusion: s.conclusion })));
}

/**
 * Default: raw failed-step log text grouped by step name. `gh run view --log-failed` prefixes
 * each line "<job>\t<step>\t<content>"; grouped on that step-name column. A parse miss simply
 * leaves that step's Map entry absent — classifyDeployRun then treats it as code-class, the SAFE
 * direction (never mints a keystroke off content it could not confidently attribute to a step).
 */
function defaultFailedLogs(repo, runId) {
  const raw = ghRaw(['run', 'view', String(runId), '-R', repo, '--log-failed']);
  const byStep = new Map();
  if (typeof raw !== 'string') return byStep;
  for (const line of raw.split('\n')) {
    const tab1 = line.indexOf('\t');
    const tab2 = tab1 === -1 ? -1 : line.indexOf('\t', tab1 + 1);
    if (tab2 === -1) continue;
    const step = line.slice(tab1 + 1, tab2);
    byStep.set(step, `${byStep.get(step) || ''}\n${line.slice(tab2 + 1)}`);
  }
  return byStep;
}

/** One venture's applications row -> repo slug -> latest completed run -> classify. Fail-soft:
 *  any read failure for one venture never blocks the others or throws. */
async function watchOneVenture(app, deps) {
  const repo = parseRepoSlug(app.repo_url);
  if (!repo) return { repo: app.repo_url, keystrokes: [], codeClass: [], error: 'unparseable_repo_url' };
  try {
    const run = await deps.latestRun(repo);
    if (!run || run.conclusion !== 'failure') return { repo, keystrokes: [], codeClass: [] };
    const steps = await deps.runSteps(repo, run.databaseId);
    const failedLogsByStep = await deps.failedLogs(repo, run.databaseId);
    return { repo, ...classifyDeployRun({ repo, runId: run.databaseId, steps, failedLogsByStep }) };
  } catch (e) {
    return { repo, keystrokes: [], codeClass: [], error: e?.message || String(e) };
  }
}

/**
 * Orchestration: every applications row with a repo_url -> latest completed deploy.yml run ->
 * credential-class red steps become a durable, deduped chairman keystroke; every other red step
 * is returned for the tick's own QUIET_TICK_VENTURE_DEPLOY_RED line.
 *
 * Dedup reads the small, bounded set of already-PENDING venture_deploy_credential decisions and
 * compares dedupeKey client-side (never a hand-rolled nested-JSON PostgREST filter) — the
 * chairman personally clears pending decisions, so this set stays small.
 */
export async function runVentureDeployWatcher(supabase, deps = {}) {
  const {
    latestRun = defaultLatestRun,
    runSteps = defaultRunSteps,
    failedLogs = defaultFailedLogs,
    recordDecision = recordPendingDecision,
  } = deps;

  const result = { recorded: [], skippedDuplicate: [], codeClassRed: [], errors: [] };
  // Explicitly bounded (count-truncation-diff-lint): the applications registry is a small,
  // deliberately-curated venture set, never a growth-unbounded table -- 500 is generous headroom.
  const { data: apps, error: appsErr } = await supabase
    .from('applications').select('id, name, repo_url').not('repo_url', 'is', null).limit(500);
  if (appsErr) { result.errors.push(appsErr.message); return result; }

  // Explicitly bounded: pending decisions of this one narrow type stay small by construction
  // (the chairman personally clears them); 200 mirrors migration-audit-reader.js's listApplied()
  // default limit for the same reason.
  const { data: pending } = await supabase
    .from('chairman_decisions').select('brief_data').eq('status', 'pending').eq('decision_type', DECISION_TYPE).limit(200);
  const pendingDedupeKeys = new Set(
    (pending || []).map((r) => r?.brief_data?.context?.dedupe_key).filter(Boolean)
  );

  for (const app of apps || []) {
    const one = await watchOneVenture(app, { latestRun, runSteps, failedLogs });
    if (one.error) result.errors.push(`${one.repo}: ${one.error}`);
    result.codeClassRed.push(...one.codeClass.map((c) => ({ ...c, ventureName: app.name })));
    for (const k of one.keystrokes) {
      if (pendingDedupeKeys.has(k.dedupeKey)) { result.skippedDuplicate.push(k); continue; }
      const res = await recordDecision(supabase, {
        title: `${app.name} deploy (${k.repo}) — ${k.step} needs a chairman grant`,
        decisionType: DECISION_TYPE,
        context: { repo: k.repo, runId: k.runId, step: k.step, message: k.message, dedupe_key: k.dedupeKey },
        blocking: true,
        raisedBy: 'venture-deploy-watcher',
      });
      result.recorded.push({ ...k, ventureName: app.name, decisionId: res.id, recorded: res.recorded });
      if (res.recorded) pendingDedupeKeys.add(k.dedupeKey); // guards a same-tick duplicate across ventures
    }
  }
  return result;
}
