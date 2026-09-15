/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-015 (PAT-LES-5b719daf1d9b): LEAD-TO-PLAN advisory gate that
 * proactively surfaces "near-miss" validation_gate_registry gaps -- a gate_key that is
 * DISABLED for at least one sibling sd_type but has no row at all for the SD currently under
 * LEAD review. This reproduces the exact shape of the originating incident:
 * GATE6_BRANCH_ENFORCEMENT was already DISABLED for feature/bugfix sd_types when an
 * infrastructure SD hit it with no row at all, discovering the block only at PLAN-TO-EXEC --
 * several phases after LEAD had already approved it. That specific row now exists (created
 * 2026-02-19); this gate exists so the NEXT such gap surfaces at LEAD-TO-PLAN instead.
 *
 * Deliberately NOT "warn on any gate absent from the registry for this sd_type" -- the
 * registry is a sparse exception list by design (absence is the correct default for the vast
 * majority of gates), and a PLAN-phase review measured that premise would flag 85 of 93 gates
 * (91%) on every single LEAD-TO-PLAN handoff, noise nobody would ever read. The sibling-
 * disabled discriminator below is deliberately narrower and reproduces only the originating
 * incident's shape.
 */

import { fetchAllPaginated } from '../../../../../../lib/db/fetch-all-paginated.mjs';

const AUDITED_PHASES = ['LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'EXEC-TO-PLAN', 'PLAN-TO-LEAD', 'LEAD-FINAL-APPROVAL'];

/** Lowercase for sd_type comparison; sd_type='all' is excluded separately (dead-by-construction
 * in gate-policy-resolver.js's exact-equality matcher -- never treat it as a real type). */
function normalizeSdType(value) {
  return String(value || '').toLowerCase();
}

/**
 * Derive near-miss findings from ONE unfiltered validation_gate_registry read.
 *
 * ownTypeDecided membership is by ROW PRESENCE, never an applicability allowlist -- the
 * registry carries at least 4 distinct applicability values today (REQUIRED, OPTIONAL,
 * DISABLED, OPTIONAL_OVERRIDE) and may grow more; only a row's EXISTENCE for this sd_type
 * means "this SD's type has already made an explicit decision," regardless of which value it
 * holds (confirmed against gate-policy-resolver.js: every applicability value except DISABLED
 * falls through to "gate runs", so a REQUIRED/OPTIONAL/OPTIONAL_OVERRIDE row is just as much a
 * real decision as a DISABLED one).
 *
 * sd_type=NULL (a validation_profile-scoped row, not a concrete sd_type decision) and
 * sd_type='all' (dead-by-construction, never matched by the live resolver) are excluded
 * entirely from both the sibling-disabled map and the own-type-decided set.
 */
export function computeNearMissFindings(manifestNames, registryRows, sdType) {
  const sdTypeLower = normalizeSdType(sdType);
  const concreteRows = (registryRows || []).filter(
    (r) => r.sd_type != null && normalizeSdType(r.sd_type) !== 'all'
  );

  const siblingDisabledMap = new Map(); // gate_key -> Set(sd_type)
  const ownTypeDecided = new Set(); // gate_key -- row presence, any applicability value

  for (const row of concreteRows) {
    const rowSdTypeLower = normalizeSdType(row.sd_type);
    if (rowSdTypeLower === sdTypeLower) {
      ownTypeDecided.add(row.gate_key);
      continue;
    }
    if (row.applicability === 'DISABLED') {
      if (!siblingDisabledMap.has(row.gate_key)) siblingDisabledMap.set(row.gate_key, new Set());
      siblingDisabledMap.get(row.gate_key).add(row.sd_type);
    }
  }

  const findings = [];
  for (const gateKey of manifestNames) {
    if (ownTypeDecided.has(gateKey)) continue;
    const siblingTypes = siblingDisabledMap.get(gateKey);
    if (siblingTypes && siblingTypes.size > 0) {
      findings.push({
        type: 'NEAR_MISS',
        gate_key: gateKey,
        disabled_for_sd_types: [...siblingTypes],
      });
    }
  }
  return findings;
}

/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-015 FR-4: why this returns a calibrated 100/90/85 instead of a
 * constant 100. This gate is `required:false` (never blocks), but `gate.weight` is read via
 * `gate.weight || 1.0` in ValidationOrchestrator.js -- a falsy `weight:0` does NOT zero out a
 * gate's contribution to the handoff's weighted-average score (0 || 1.0 evaluates to 1.0 in
 * JS), so this gate's score DOES feed into the aggregate like any other gate, and a constant
 * 100 would silently inflate every LEAD-TO-PLAN handoff's score regardless of what this gate
 * actually found. AUDIT_INCOMPLETE wins the tie-break over NEAR_MISS: a partial audit could
 * itself be masking additional near-misses in the phase(s) it couldn't evaluate, which is a
 * worse epistemic state than a complete audit that found real, actionable near-misses.
 */
export function scoreFindings(findings) {
  if (findings.some((f) => f.type === 'AUDIT_INCOMPLETE')) return 85;
  if (findings.some((f) => f.type === 'NEAR_MISS')) return 90;
  return 100;
}

/** `warnings` (human-readable, for the existing handoff CLI's "Warnings: N" display) is always
 * DERIVED from `findings` (the structured, machine-checkable field) -- never populated
 * independently, so the two can never drift apart. */
export function findingsToWarnings(findings) {
  return findings.map((f) => {
    if (f.type === 'NEAR_MISS') {
      return `NEAR_MISS: ${f.gate_key} is DISABLED for sd_type(s) [${f.disabled_for_sd_types.join(', ')}] but has no validation_gate_registry row for this SD's type -- review whether the same exemption applies here.`;
    }
    return `AUDIT_INCOMPLETE: registry audit for ${f.phase} could not be evaluated${f.error ? `: ${f.error}` : ''}.`;
  });
}

/**
 * Runs dryRunHandoff across all 5 phases against an already-constructed orchestrator (or any
 * object exposing a compatible dryRunHandoff(phase, sdId, options) method -- kept as a plain
 * parameter, not a hardcoded `new HandoffOrchestrator(...)` call, purely so tests can inject a
 * stub without mocking a dynamic ESM import).
 *
 * @returns {Promise<{manifestNames: Set<string>, auditIncompletePhases: Array<{phase, error}>}>}
 */
export async function auditPhases(orchestrator, sdId) {
  const manifestNames = new Set();
  const auditIncompletePhases = [];
  for (const phase of AUDITED_PHASES) {
    try {
      const result = await orchestrator.dryRunHandoff(phase, sdId, {});
      if (result?.success && Array.isArray(result.manifest)) {
        for (const gate of result.manifest) {
          if (gate?.name) manifestNames.add(gate.name);
        }
      } else {
        auditIncompletePhases.push({ phase, error: result?.error || 'unknown error' });
      }
    } catch (err) {
      // dryRunHandoff itself always catches and returns {success:false} rather than throwing
      // (confirmed by reading its source) -- this catch is defense-in-depth against a failure
      // in orchestrator construction or the call itself.
      auditIncompletePhases.push({ phase, error: err?.message || String(err) });
    }
  }
  return { manifestNames, auditIncompletePhases };
}

/**
 * SD-LEARN-FIX-ADDRESS-PAT-LES-015 FR-1/TR-2: takes a plain supabase client (matching sibling
 * gate factories' convention, e.g. createScopeReductionVerificationGate(supabase)).
 * LeadToPlanExecutor has no back-reference to the HandoffOrchestrator that constructs it (see
 * HandoffOrchestrator.js: `new LeadToPlanExecutor(executorDeps)` is one-directional), so the
 * validator lazily constructs its own minimal HandoffOrchestrator purely to call
 * dryRunHandoff() -- confirmed side-effect-free at construction (it only self-assembles its
 * other dependencies from {supabase}, no I/O).
 *
 * `opts.orchestratorFactory` is an injectable override (defaults to the real lazy-import
 * construction) purely for test isolation -- never used by production callers.
 */
export function createGateRegistryAuditGate(supabase, opts = {}) {
  const orchestratorFactory =
    opts.orchestratorFactory ||
    (async () => {
      const { HandoffOrchestrator } = await import('../../../HandoffOrchestrator.js');
      return new HandoffOrchestrator({ supabase });
    });

  return {
    name: 'GATE_REGISTRY_AUDIT',
    required: false, // SD-LEARN-FIX-ADDRESS-PAT-LES-015 FR-4: advisory only, never blocks.
    validator: async (ctx) => {
      const sd = ctx?.sd;
      if (!sd?.id || !sd?.sd_type) {
        // Nothing to audit yet (e.g. a synthetic/precheck context with no persisted SD) --
        // never fabricate an audit result, just report a clean pass.
        return { name: 'GATE_REGISTRY_AUDIT', passed: true, score: 100, maxScore: 100, findings: [], warnings: [] };
      }

      try {
        const orchestrator = await orchestratorFactory();
        const { manifestNames, auditIncompletePhases } = await auditPhases(orchestrator, sd.id);

        let registryRows = [];
        const registryFailures = [...auditIncompletePhases];
        try {
          // Paginated (POSTGREST_MAX_ROWS=1000 per page) -- matching gate-policy-resolver.js's
          // own fetch of this same table. Complete today (113 rows), but a plain unbounded
          // .select() silently truncates past 1000, which would emit FALSE near-misses for
          // gate_keys whose real sibling-DISABLED row just happened to fall off the page.
          registryRows = await fetchAllPaginated(() =>
            supabase.from('validation_gate_registry').select('gate_key, sd_type, applicability').order('gate_key')
          );
        } catch (err) {
          // The registry read itself failing means near-miss findings can't be computed for ANY
          // phase, regardless of whether that phase's own manifest fetch succeeded -- mark every
          // not-already-incomplete phase incomplete rather than silently reporting zero findings.
          const message = `registry query failed: ${err?.message || String(err)}`;
          for (const phase of AUDITED_PHASES) {
            if (!registryFailures.some((p) => p.phase === phase)) {
              registryFailures.push({ phase, error: message });
            }
          }
        }

        const findings = [
          ...computeNearMissFindings(manifestNames, registryRows, sd.sd_type),
          ...registryFailures.map((p) => ({ type: 'AUDIT_INCOMPLETE', phase: p.phase, error: p.error })),
        ];

        return {
          name: 'GATE_REGISTRY_AUDIT',
          passed: true, // Never blocks -- advisory only (FR-4).
          score: scoreFindings(findings),
          maxScore: 100,
          findings,
          warnings: findingsToWarnings(findings),
        };
      } catch (err) {
        // SD-LEARN-FIX-ADDRESS-PAT-LES-015 (SECURITY, EXEC-phase review): the per-phase and
        // per-query try/catches above cover every ANTICIPATED failure, but orchestratorFactory()
        // itself (the dynamic import + HandoffOrchestrator construction) sat OUTSIDE any guard.
        // If that throws, an uncaught rejection here does not stay contained to this gate --
        // ValidationOrchestrator.js substitutes {passed:false, score:0} for the whole gate, and
        // that 0 DOES enter the weighted-average aggregate at full weight (required:false only
        // exempts a gate from BLOCKING on failure, not from scoring -- gate.weight is read
        // unconditionally in the scoring sum). That is a strictly WORSE outcome than this gate's
        // own worst deliberate case (score:85 for every phase being AUDIT_INCOMPLETE), directly
        // contradicting FR-4's explicit intent. This outer catch is the fail-safe: whatever went
        // wrong, still return the same honest-but-bounded floor the rest of this gate uses.
        return {
          name: 'GATE_REGISTRY_AUDIT',
          passed: true,
          score: 85,
          maxScore: 100,
          findings: [{ type: 'AUDIT_INCOMPLETE', phase: 'ALL', error: err?.message || String(err) }],
          warnings: [`AUDIT_INCOMPLETE: registry audit could not run at all: ${err?.message || String(err)}.`],
        };
      }
    },
  };
}
