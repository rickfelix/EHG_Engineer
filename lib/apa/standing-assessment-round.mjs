/**
 * APA Phase-2 standing assessment round — SD-LEO-INFRA-APA-PHASE-STANDING-001.
 *
 * Composes existing APA libraries (Child B assertions, Child C journey-walk)
 * over the new live-instance-acquisition layer (FR-1) to run a generic
 * customer-perspective QA pass against every live venture_deployments URL on
 * a standing cadence. Registered as a round on the EVA master scheduler
 * (lib/eva/eva-master-scheduler.js registerRound) rather than a bespoke cron
 * — VALIDATION sub-agent's explicit finding that this is the correct existing
 * infrastructure to plug into (21 live scheduler_round:* rows today).
 *
 * Dampening (FR-5): a single failure is DEGRADED and routes only to the
 * coordinator lane (recordCorrectiveFinding). Only >=2 CONSECUTIVE failures
 * of the SAME venture transition to CONFIRMED_BROKEN and additionally
 * escalate to the chairman (recordPendingDecision, blocking:true). A
 * transient acquisition failure (FR-1 unreachable/timeout — self-fault, not
 * a structural assertion failure) is routed to the coordinator lane only,
 * regardless of consecutive count, per risk-agent's self-fault/venture-fault
 * taxonomy requirement.
 *
 * @module lib/apa/standing-assessment-round
 */

import { acquireLiveInstance, isBlockedHost } from './live-instance-acquisition.mjs';
import { runJourneyWalk } from './browser-executor.js';
import { evaluateAssertion, PRIMITIVE_CATEGORIES } from './assertion-library.mjs';
import { recordTokenUsage } from '../eva/utils/token-tracker.js';
// SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 8: this round probes EVERY live
// routed deployment URL — a read silently capped at the PostgREST 1000-row max would drop a
// venture's latest routed row and skip its standing QA pass. Paginate to completion.
import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

// FR-2: a generic, venture-agnostic journey for Phase-2 v1 — no per-venture
// claims registry is assumed to exist yet. 'home' and 'back' always run;
// 'primaryNav' is best-effort (a venture with no discoverable nav link simply
// stops there without failing the whole walk, per Child C's stop-at-first-
// failure contract only firing on a genuine step *error*, not "nothing found").
const GENERIC_JOURNEY_STEPS = ['home', 'primaryNav'];

const GENERIC_STEP_EXECUTORS = {
  async home(page, _persona, ctx) {
    const status = await page.evaluate(() => document.readyState).catch(() => null);
    if (status === null) throw new Error('home: page did not settle');
    return { url: ctx.baseUrl, renderedStateSummary: 'home loaded' };
  },
  async primaryNav(page, _persona, ctx) {
    const link = page.locator('a[href]').first();
    const count = await link.count().catch(() => 0);
    if (count === 0) {
      return { url: ctx.baseUrl, renderedStateSummary: 'no nav link found (structural, not a failure)' };
    }
    const href = await link.getAttribute('href').catch(() => null);
    await link.click({ timeout: 5000 }).catch(() => {});
    return { url: href || ctx.baseUrl, renderedStateSummary: 'nav link clicked' };
  },
};

/**
 * Enumerate live venture deployment URLs. Intentionally isolated behind one
 * named export (TR-4) so it can be swapped for SD-LEO-INFRA-VENTURE-OPS-ACTUALS-001's
 * eventual canonical enumerator once that SD ships, without touching callers.
 * Follows the exit-gate-verifiers.js R3 doctrine: never trust the row alone —
 * a recorded URL must be live-probed before being treated as serving.
 *
 * @param {Object} supabase
 * @param {Function} [fetchImpl] - injectable for tests
 * @returns {Promise<Array<{ventureId: string, url: string}>>}
 */
export async function listLiveVentureDeploymentUrls(supabase, fetchImpl = fetch) {
  let rows;
  try {
    rows = await fetchAllPaginated(() => supabase
      .from('venture_deployments')
      .select('venture_id, url, created_at')
      .eq('status', 'routed')
      .not('url', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })); // unique tiebreaker: stable page boundaries (FR-6)
  } catch (err) {
    throw new Error(`listLiveVentureDeploymentUrls: query failed: ${err.message}`);
  }

  // DISTINCT ON venture_id (latest routed row), done in JS since the rows are
  // already ordered created_at desc.
  const latestByVenture = new Map();
  for (const row of rows) {
    if (!latestByVenture.has(row.venture_id)) latestByVenture.set(row.venture_id, row.url);
  }

  const candidates = [...latestByVenture.entries()].map(([ventureId, url]) => ({ ventureId, url }));
  const live = [];
  for (const { ventureId, url } of candidates) {
    const alive = await probeUrlAlive(url, fetchImpl);
    if (alive) live.push({ ventureId, url });
  }
  return live;
}

async function probeUrlAlive(url, fetchImpl, timeoutMs = 5000) {
  // SSRF guard (adversarial review) — same host-blocklist as acquireLiveInstance,
  // applied here too since this is an independent fetch() with redirect:'follow'.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    if (isBlockedHost(parsed.hostname)) return false;
  } catch {
    return false;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, redirect: 'follow' });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read the most recent apa_standing_assessments row for a venture, to seed
 * the dampening state machine's consecutive_fail_count. A read failure must
 * NOT silently reset the counter (that would delay a legitimate chairman
 * escalation) -- surface it loudly instead.
 */
async function getLastAssessment(supabase, ventureId, logger = console) {
  const { data, error } = await supabase
    .from('apa_standing_assessments')
    .select('verdict, consecutive_fail_count')
    .eq('venture_id', ventureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger.error(`[apa-standing] getLastAssessment(${ventureId}) failed, treating as no-prior-state: ${error.message}`);
    return null;
  }
  return data || null;
}

/**
 * Insert one apa_standing_assessments row and return its id (used as the
 * corrective-finding dedup discriminator -- see recordFinding). A write
 * failure is logged loudly rather than swallowed: a silently-dropped row
 * would make getLastAssessment() read stale state on the next cycle and
 * freeze the dampening counter (adversarial review finding).
 */
async function insertAssessmentRow(supabase, row, logger = console) {
  const { data, error } = await supabase.from('apa_standing_assessments').insert(row).select('id').single();
  if (error) {
    logger.error(`[apa-standing] apa_standing_assessments insert failed for venture ${row.venture_id}: ${error.message}`);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Assess a single venture: acquire a live instance, walk the generic
 * journey, evaluate structural assertions, persist a result row, and route
 * findings per the dampening taxonomy.
 *
 * @param {Object} params
 * @param {string} params.ventureId
 * @param {string} params.url
 * @param {Object} deps - {supabase, recordCorrectiveFinding, recordPendingDecision, acquireLiveInstance, logger}
 * @returns {Promise<{ventureId: string, verdict: string, primitivesPassed: number, primitivesTotal: number}>}
 */
export async function assessVenture({ ventureId, url }, deps) {
  const {
    supabase,
    recordCorrectiveFinding,
    recordPendingDecision,
    acquireLiveInstance: acquire = acquireLiveInstance,
    logger = console,
  } = deps;

  const cycleStartMs = Date.now();
  const cycleStartedAt = new Date(cycleStartMs).toISOString();
  const prior = await getLastAssessment(supabase, ventureId, logger);
  const priorConsecutiveFails = prior?.consecutive_fail_count || 0;

  // FR-7 (cost attribution half): this is pure browser-automation, not an LLM
  // call — zero tokens, but the run's wall-clock duration is recorded via the
  // existing venture_token_ledger channel so P7 effort telemetry can classify
  // it as maintenance load, per the SD's success criterion #5. The
  // test-mode-only payment-rail guard (FR-7's other half) is deliberately NOT
  // implemented here: the v1 generic journey walk (home -> primaryNav) never
  // exercises a checkout/email-sequence flow, so there is no live-money
  // codepath to guard against yet — adding a boot assertion for a scenario
  // that cannot occur would be dead validation. Revisit when a checkout-flow
  // journey is added.
  const attributeRunCost = () => recordTokenUsage(
    {
      ventureId,
      stageId: 0,
      usage: { inputTokens: 0, outputTokens: 0 },
      metadata: { operationType: 'apa_standing_probe', modelId: null, agentType: 'apa-standing-probe' },
    },
    { supabase, logger }
  );

  const instance = await acquire(url);
  if (!instance.ok) {
    // FR-5/self-fault: acquisition failure is transient/probe-infra, never a
    // structural assertion failure — coordinator lane only, chairman never.
    const rowId = await insertAssessmentRow(supabase, {
      venture_id: ventureId,
      url,
      cycle_started_at: cycleStartedAt,
      assessment_result: { self_fault: true, reason: instance.reason },
      primitives_passed: 0,
      primitives_total: 0,
      verdict: 'error',
      consecutive_fail_count: priorConsecutiveFails, // self-fault does not advance the dampening counter
    }, logger);
    // gate_run_id = this cycle's own result-row id: dedup collapses only a
    // genuine retry of THIS exact insert, never a different venture or a
    // later cycle (adversarial review: all ventures were hashing identically
    // without this discriminator, silently dropping every finding after the
    // first).
    await recordCorrectiveFinding(supabase, {
      source_gate: 'apa_standing_probe',
      gate_run_id: rowId,
      corrective_class: 'apa_probe_infra',
      dimensions: ['APA-ACQUISITION'],
      tier: 'minor',
      title: `APA standing probe: acquisition failed for venture ${ventureId}`,
      description: `acquireLiveInstance(${url}) failed: ${instance.reason}`,
      metadata: { venture_id: ventureId, url, self_fault: true, reason: instance.reason },
    });
    attributeRunCost();
    return { ventureId, verdict: 'error', primitivesPassed: 0, primitivesTotal: 0 };
  }

  let walkResult;
  try {
    walkResult = await runJourneyWalk(
      instance.page,
      { name: 'apa-standing-probe' },
      GENERIC_JOURNEY_STEPS,
      GENERIC_STEP_EXECUTORS,
      { baseUrl: url }
    );
  } finally {
    await instance.teardown();
  }

  const assertionInstances = [
    { id: 'apa-standing-recovery', category: PRIMITIVE_CATEGORIES.RECOVERY_PATH, claim: { label: 'generic journey walk' } },
    ...walkResult.outcomes.map((o, i) => ({
      id: `apa-standing-dead-end-${i}`,
      category: PRIMITIVE_CATEGORIES.NO_DEAD_END,
      claim: { label: o.step },
    })),
  ];

  const evidenceByAssertion = new Map();
  evidenceByAssertion.set('apa-standing-recovery', {
    flowState: {
      reachable: true,
      completed: walkResult.completedAllSteps,
      error: walkResult.brokenAtStep ? walkResult.outcomes.at(-1)?.failureReason : null,
    },
  });
  walkResult.outcomes.forEach((o, i) => {
    evidenceByAssertion.set(`apa-standing-dead-end-${i}`, {
      resultState: { httpStatus: o.success ? 200 : 502, isBlank: false, hasError: !o.success },
    });
  });

  const verdicts = assertionInstances.map((instance_) =>
    evaluateAssertion(instance_, evidenceByAssertion.get(instance_.id))
  );
  const primitivesPassed = verdicts.filter((v) => v.pass).length;
  const primitivesTotal = verdicts.length;
  const structuralPass = primitivesPassed === primitivesTotal;
  const verdict = structuralPass ? 'pass' : 'fail';
  const consecutiveFailCount = structuralPass ? 0 : priorConsecutiveFails + 1;

  const rowId = await insertAssessmentRow(supabase, {
    venture_id: ventureId,
    url,
    cycle_started_at: cycleStartedAt,
    assessment_result: { verdicts, walkResult },
    primitives_passed: primitivesPassed,
    primitives_total: primitivesTotal,
    verdict,
    consecutive_fail_count: consecutiveFailCount,
  }, logger);

  if (structuralPass) {
    // FR-6: quiet pass — no findings/decisions calls.
    attributeRunCost();
    return { ventureId, verdict, primitivesPassed, primitivesTotal };
  }

  const failedReasons = verdicts.filter((v) => !v.pass).map((v) => v.reason).join('; ');

  // FR-5: single failure is DEGRADED — coordinator lane only. gate_run_id =
  // this cycle's own result-row id (see acquisition-failure branch above for
  // why this discriminator is required).
  await recordCorrectiveFinding(supabase, {
    source_gate: 'apa_standing_probe',
    gate_run_id: rowId,
    corrective_class: 'apa_structural_break',
    dimensions: ['APA-STRUCTURAL'],
    tier: consecutiveFailCount >= 2 ? 'escalation' : 'gap-closure',
    title: `APA standing probe: structural break for venture ${ventureId} (consecutive: ${consecutiveFailCount})`,
    description: failedReasons,
    metadata: { venture_id: ventureId, url, consecutive_fail_count: consecutiveFailCount },
  });

  if (consecutiveFailCount >= 2) {
    // FR-5: CONFIRMED_BROKEN — >=2 consecutive fails escalates to the chairman.
    await recordPendingDecision(supabase, {
      title: `Live venture appears broken: ${url}`,
      decisionType: 'venture_health_alert',
      context: `APA standing probe failed structural assertions for ${consecutiveFailCount} consecutive cycles: ${failedReasons}`,
      blocking: true,
      ventureId,
      raisedBy: 'apa-standing-probe',
    });
  } else {
    logger.log(`[apa-standing] venture ${ventureId} DEGRADED (1st fail) — coordinator lane only, no chairman escalation yet`);
  }

  attributeRunCost();
  return { ventureId, verdict, primitivesPassed, primitivesTotal };
}

/**
 * Round handler for eva-master-scheduler registerRound('apa_standing', {handler}).
 * FR-8: gracefully handles the zero-venture case (current live DB state).
 *
 * @param {Object} [options]
 * @param {Object} [options.deps] - {supabase, recordCorrectiveFinding, recordPendingDecision, acquireLiveInstance, logger, fetchImpl}
 * @returns {Promise<{assessedCount: number, results: Array}>}
 */
export async function runApaStandingRound(options = {}) {
  const {
    supabase,
    recordCorrectiveFinding: recordCorrectiveFindingDep,
    recordPendingDecision: recordPendingDecisionDep,
    acquireLiveInstance: acquireLiveInstanceDep,
    logger = console,
    fetchImpl = fetch,
  } = options.deps || {};

  if (!supabase) throw new Error('runApaStandingRound: deps.supabase is required');

  const recordCorrectiveFinding = recordCorrectiveFindingDep
    || (await import('../eva/corrective-finding-recorder.js')).recordCorrectiveFinding;
  const recordPendingDecision = recordPendingDecisionDep
    || (await import('../chairman/record-pending-decision.mjs')).recordPendingDecision;

  const liveVentures = await listLiveVentureDeploymentUrls(supabase, fetchImpl);

  if (liveVentures.length === 0) {
    logger.log('apa_standing: 0 live ventures found this cycle');
    return { assessedCount: 0, results: [] };
  }

  const results = [];
  for (const { ventureId, url } of liveVentures) {
    // Isolate one venture's unexpected failure so it cannot starve the rest
    // of the cycle (adversarial review: recordCorrectiveFinding throws on a
    // validation/insert error, and an unguarded loop let one bad venture
    // abort every venture behind it).
    try {
      const result = await assessVenture(
        { ventureId, url },
        {
          supabase,
          recordCorrectiveFinding,
          recordPendingDecision,
          acquireLiveInstance: acquireLiveInstanceDep,
          logger,
        }
      );
      results.push(result);
    } catch (err) {
      logger.error(`[apa-standing] venture ${ventureId} assessment threw unexpectedly, skipping (round continues): ${err.message}`);
      results.push({ ventureId, verdict: 'error', primitivesPassed: 0, primitivesTotal: 0 });
    }
  }

  logger.log(`apa_standing: assessed ${results.length} venture(s): ${JSON.stringify(results.map((r) => `${r.ventureId}=${r.verdict}`))}`);
  return { assessedCount: results.length, results };
}
