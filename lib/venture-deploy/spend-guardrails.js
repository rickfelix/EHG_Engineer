/**
 * Engineered spend-guardrails: an 8-point policy module for automated venture deploys.
 *
 * SD-EHG-FEAT-AUTOMATED-RESILIENT-VENTURE-001-C (FR-1, FR-5).
 *
 * Each guardrail is a pure object {name, check, enforce, alert}:
 *   - check(ctx)   → { ok, detail }            pure; reads ONLY injected ctx fields
 *   - enforce(ctx) → { guardrail, decision, reason, measured }   'allow' | 'block'
 *   - alert(ctx)   → { level, guardrail, message } | null        operator-facing alert when blocked
 *
 * FAIL-LOUD / FAIL-CLOSED contract: a guardrail whose required input is missing
 * (undefined / non-finite) is treated as UNMET (decision 'block'), never as a
 * silent pass. There is no "assume ok" branch.
 *
 * Per-venture isolation (FR-5): every check is scoped to ctx.ventureId; the
 * isolation guardrail itself fails unless the supplied state is scoped to this
 * exact venture, and persistGuardrailDecisions() upserts keyed by (venture_id,
 * guardrail) so one venture's state can never overwrite another's.
 *
 * @module lib/venture-deploy/spend-guardrails
 */

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * Build a guardrail from a pure evaluator.
 * @param {string} name
 * @param {(ctx: object) => {ok: boolean, detail: string}} evaluate
 */
function makeGuardrail(name, evaluate) {
  return {
    name,
    check(ctx) {
      try {
        return evaluate(ctx || {});
      } catch (e) {
        // A throwing evaluator is missing data → fail-closed, never silent pass.
        return { ok: false, detail: `check error → fail-closed: ${e.message}` };
      }
    },
    enforce(ctx) {
      const r = this.check(ctx);
      return { guardrail: name, decision: r.ok ? 'allow' : 'block', reason: r.detail, ok: r.ok };
    },
    alert(ctx) {
      const r = this.check(ctx);
      if (r.ok) return null;
      return { level: 'critical', guardrail: name, message: `BLOCKED: ${name} — ${r.detail}` };
    },
  };
}

/** The 8 engineered spend-guardrails, in stable order. */
export const GUARDRAILS = Object.freeze([
  makeGuardrail('agent-token-ceiling', (ctx) => {
    const used = ctx.usage?.agentTokens;
    const ceiling = ctx.limits?.agentTokenCeiling;
    if (!isNum(used) || !isNum(ceiling)) return { ok: false, detail: 'agent-token usage/ceiling not measured → fail-closed' };
    return { ok: used <= ceiling, detail: `agent tokens ${used} / ceiling ${ceiling}` };
  }),
  makeGuardrail('human-gate', (ctx) => {
    const approved = ctx.state?.humanGateApproved;
    if (approved === undefined) return { ok: false, detail: 'human-gate approval unknown → fail-closed' };
    return { ok: approved === true, detail: approved === true ? 'human gate approved' : 'human gate NOT approved' };
  }),
  makeGuardrail('deterministic-ci-migration', (ctx) => {
    const ci = ctx.state?.ciDeterministic;
    const mig = ctx.state?.migrationDeterministic;
    if (ci === undefined || mig === undefined) return { ok: false, detail: 'CI/migration determinism unknown → fail-closed' };
    return { ok: ci === true && mig === true, detail: `ci=${ci} migration=${mig} (both must be deterministic)` };
  }),
  makeGuardrail('d1-write-ceiling', (ctx) => {
    const writes = ctx.usage?.d1Writes;
    const ceiling = ctx.limits?.d1WriteCeiling;
    if (!isNum(writes) || !isNum(ceiling)) return { ok: false, detail: 'D1 writes/ceiling not measured → fail-closed' };
    return { ok: writes <= ceiling, detail: `D1 writes ${writes} / ceiling ${ceiling}` };
  }),
  makeGuardrail('operator-export', (ctx) => {
    const enabled = ctx.state?.operatorExportEnabled;
    if (enabled === undefined) return { ok: false, detail: 'operator-export capability unknown → fail-closed' };
    return { ok: enabled === true, detail: enabled === true ? 'operator export enabled' : 'operator export NOT enabled' };
  }),
  makeGuardrail('neon-paid-plan', (ctx) => {
    const plan = ctx.state?.neonPlan;
    if (plan === undefined) return { ok: false, detail: 'Neon plan unknown → fail-closed' };
    return { ok: plan === 'paid', detail: `Neon plan '${plan}' (must be 'paid' to avoid free-tier suspension)` };
  }),
  makeGuardrail('cloud-run-max-instances', (ctx) => {
    const max = ctx.config?.cloudRunMaxInstances;
    const ceiling = ctx.limits?.cloudRunMaxInstancesCeiling;
    if (!isNum(max) || !isNum(ceiling)) return { ok: false, detail: 'Cloud Run max-instances/ceiling not configured → fail-closed' };
    return { ok: max <= ceiling, detail: `Cloud Run max-instances ${max} / ceiling ${ceiling}` };
  }),
  makeGuardrail('per-venture-isolation', (ctx) => {
    if (!ctx.ventureId) return { ok: false, detail: 'no ventureId in context → fail-closed' };
    const scope = ctx.state?.isolationScope;
    if (scope === undefined) return { ok: false, detail: 'isolation scope unknown → fail-closed' };
    return { ok: scope === ctx.ventureId, detail: `isolation scope '${scope}' vs venture '${ctx.ventureId}'` };
  }),
]);

/** Canonical guardrail names, in order — the gate verifier asserts a row exists per name. */
export const GUARDRAIL_NAMES = Object.freeze(GUARDRAILS.map((g) => g.name));

/**
 * Registrar price-ceiling guardrail (SD-LEO-FEAT-VENTURE-DOMAIN-ACQUISITION-001
 * FR-5). Same fail-closed shape as the deploy set, but deliberately NOT
 * appended to GUARDRAILS — the deploy gate verifier asserts exactly the 8
 * names above, and this guardrail is invoked by the acquisition executor
 * (lib/venture-acquisition/acquire.js) with its own ctx:
 *   { quote: { priceUsd }, limits: { registrarPriceCeilingUsd } }
 * Missing / non-finite quote or ceiling => BLOCK — an unpriced domain purchase
 * never proceeds, even with chairman approval.
 */
export const REGISTRAR_PRICE_CEILING = makeGuardrail('registrar-price-ceiling', (ctx) => {
  const quote = ctx.quote?.priceUsd;
  const ceiling = ctx.limits?.registrarPriceCeilingUsd;
  if (!isNum(quote) || !isNum(ceiling)) return { ok: false, detail: 'registrar quote/ceiling not measured → fail-closed' };
  return { ok: quote <= ceiling, detail: `registrar quote $${quote} / ceiling $${ceiling}/yr` };
});

/**
 * Evaluate ALL 8 guardrails for a venture context.
 * @param {object} ctx — { ventureId, usage, limits, config, state }
 * @returns {{ satisfied: boolean, decisions: object[], blocked: object[], alerts: object[] }}
 */
export function evaluateGuardrails(ctx) {
  const decisions = GUARDRAILS.map((g) => g.enforce(ctx));
  const blocked = decisions.filter((d) => d.decision === 'block');
  const alerts = GUARDRAILS.map((g) => g.alert(ctx)).filter(Boolean);
  return { satisfied: blocked.length === 0, decisions, blocked, alerts };
}

/**
 * Operator-observable report (the surface AC-1 checks): a human reading the
 * deploy output sees a clear ALLOW/BLOCKED line per guardrail.
 * @param {ReturnType<typeof evaluateGuardrails>} result
 * @returns {string}
 */
export function formatGuardrailReport(result) {
  const header = result.satisfied
    ? '✅ ALL 8 SPEND GUARDRAILS SATISFIED — deploy allowed'
    : `❌ DEPLOY BLOCKED — ${result.blocked.length}/8 spend guardrail(s) failed`;
  const lines = result.decisions.map(
    (d) => `  ${d.decision === 'allow' ? 'ALLOW ' : 'BLOCKED'}: ${d.guardrail} — ${d.reason}`,
  );
  return [header, ...lines].join('\n');
}

/**
 * Persist each guardrail decision to venture_guardrail_state, scoped by
 * venture_id (FR-4 / FR-5). FAIL-SOFT: a missing table or write error never
 * crashes the deploy flow — the gate's own read path is the fail-closed
 * authority. Returns {persisted, error}.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {object} ctx
 * @param {{ killswitchOpen?: boolean }} [opts]
 */
export async function persistGuardrailDecisions(supabase, ventureId, ctx, opts = {}) {
  if (!supabase || !ventureId) return { persisted: false, error: 'missing supabase/ventureId' };
  const { decisions } = evaluateGuardrails({ ...ctx, ventureId });
  const killswitchOpen = opts.killswitchOpen === true;
  const rows = decisions.map((d) => ({
    venture_id: ventureId, // FR-5: every row scoped to this venture only
    guardrail: d.guardrail,
    decision: d.decision,
    reason: d.reason,
    killswitch_open: d.guardrail === 'd1-write-ceiling' ? killswitchOpen : false,
    updated_at: new Date().toISOString(),
  }));
  try {
    const { error } = await supabase
      .from('venture_guardrail_state')
      .upsert(rows, { onConflict: 'venture_id,guardrail' });
    if (error) return { persisted: false, error: error.message };
    return { persisted: true, error: null };
  } catch (e) {
    return { persisted: false, error: e.message };
  }
}

/**
 * Reads the ALREADY-PERSISTED guardrail state for a venture (written by
 * persistGuardrailDecisions during a deploy flow) and returns whether all 8 are
 * currently satisfied — the same check the S19 exit gate and venture-deploy/publish.js
 * rely on. FAIL-CLOSED: a query error, a missing guardrail row, any non-'allow'
 * decision, or an open kill-switch all resolve to active=false.
 *
 * This does NOT call evaluateGuardrails() with a synthetic ctx — the 8 guardrails
 * require deploy-specific measurements (agent tokens, D1 writes, CI determinism, etc.)
 * that a non-deploy caller (e.g. the marketing rail, SD-LEO-INFRA-VENTURE-DEMAND-
 * DISTRIBUTION-001-C FR-6) has no way to supply, and re-evaluating from empty context
 * would fail-closed on every field. Callers outside the deploy flow read the
 * already-recorded decisions instead, exactly mirroring the S19 gate's own read path.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<{active: boolean, reason: string}>}
 */
export async function isGuardrailsActive(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_guardrail_state')
    .select('guardrail, decision, killswitch_open')
    .eq('venture_id', ventureId);
  if (error) return { active: false, reason: `guardrail-state query failed (fail-closed): ${error.message}` };
  const rows = data || [];
  const recorded = new Set(rows.map((r) => r.guardrail));
  const missing = GUARDRAIL_NAMES.filter((n) => !recorded.has(n));
  if (missing.length > 0) return { active: false, reason: `guardrails not recorded (fail-closed): ${missing.join(', ')}` };
  const bad = rows.filter((r) => r.decision !== 'allow' || r.killswitch_open === true);
  if (bad.length > 0) return { active: false, reason: `guardrails unmet/halted: ${bad.map((r) => r.guardrail).join(', ')}` };
  return { active: true, reason: '' };
}

/**
 * Narrow kill-switch check for non-deploy callers (e.g. the marketing/publisher rail,
 * SD-LEO-INFRA-VENTURE-DEMAND-DISTRIBUTION-001-C FR-6) that should honor the chairman's
 * kill-switch and human-approval posture WITHOUT requiring the 6 other deploy-specific
 * guardrails (agent-token-ceiling, CI/migration determinism, operator-export,
 * neon-paid-plan, cloud-run-max-instances, per-venture-isolation) — none of which apply
 * to an outbound social post. FAIL-CLOSED: missing rows, a non-'allow' decision on
 * either guardrail, or an open kill-switch all resolve to clear=false.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @returns {Promise<{clear: boolean, reason: string}>}
 */
export async function isKillswitchClear(supabase, ventureId) {
  const { data, error } = await supabase
    .from('venture_guardrail_state')
    .select('guardrail, decision, killswitch_open')
    .eq('venture_id', ventureId)
    .in('guardrail', ['human-gate', 'd1-write-ceiling']);
  if (error) return { clear: false, reason: `guardrail-state query failed (fail-closed): ${error.message}` };
  const rows = data || [];
  const recorded = new Set(rows.map((r) => r.guardrail));
  const missing = ['human-gate', 'd1-write-ceiling'].filter((n) => !recorded.has(n));
  if (missing.length > 0) return { clear: false, reason: `guardrail(s) not recorded (fail-closed): ${missing.join(', ')}` };
  const bad = rows.filter((r) => r.decision !== 'allow' || r.killswitch_open === true);
  if (bad.length > 0) return { clear: false, reason: `blocked by: ${bad.map((r) => r.guardrail).join(', ')}` };
  return { clear: true, reason: '' };
}

export default { GUARDRAILS, GUARDRAIL_NAMES, evaluateGuardrails, formatGuardrailReport, persistGuardrailDecisions, isGuardrailsActive, isKillswitchClear };
