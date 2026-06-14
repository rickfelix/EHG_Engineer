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

export default { GUARDRAILS, GUARDRAIL_NAMES, evaluateGuardrails, formatGuardrailReport, persistGuardrailDecisions };
