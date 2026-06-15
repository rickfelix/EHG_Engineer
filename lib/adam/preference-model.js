/**
 * Adam preference model — SD-LEO-INFRA-ADAM-PRIORITY-ANCHORING-001 (FR-2).
 *
 * PURE / injectable. Computes a BOUNDED per-candidate-class weight map that the
 * rationale bar (selectAdvisory) applies as a multiplier on the raw OKR score.
 * The map is the UNION of:
 *   (a) EXPLICIT chairman_preferences rows (resolved via chairman-preference-store
 *       getPreferences) — the DOMINANT term; and
 *   (b) the chairman_decisions verdicts as a WEAK soft prior — these are
 *       gate/review verdicts, NOT topical priorities, so their derived class is
 *       conservative and their weight contribution is small and never dominant.
 *
 * CARDINAL SAFETY RULES (the whole point of this SD):
 *   - A preference/Q2 weight must NEVER override genuine objective (KR-status)
 *     signal. The PRIMARY guarantee now lives in selectAdvisory: the KR-status
 *     TIER is the DOMINANT sort key, so an off-track (or at_risk) candidate
 *     ALWAYS outranks a less-urgent one regardless of class, preference weight,
 *     or wave alignment. The bounded clamp below is NO LONGER load-bearing for
 *     CROSS-tier safety — it only nudges INTRA-tier order (see note).
 *   - Weights are BOUNDED: clamp() keeps every weight in [CLAMP_LO, CLAMP_HI]
 *     around 1.0. A weight is NEVER 0 (never zeroes a candidate) and is never
 *     non-finite. This keeps the intra-tier nudge proportionate.
 *   - A FLAT all-1.0 weight map produces selection BYTE-IDENTICAL to the
 *     (statusTier-dominant) OKR-only ordering (the multiplier is identity 1.0).
 *   - The explicit chairman_preferences term DOMINATES the weak decisions prior.
 *
 * INTRA-TIER NOTE (clamp is now only an intra-tier nudge):
 *   Cross-class inversion WITHIN the same status tier (e.g. boosting an on-track
 *   gate-tuning candidate above an on-track eva-consultant one) is the INTENDED,
 *   acceptable effect of the chairman directive — both are at the SAME objective
 *   urgency. The OLD proof (3*CLAMP_LO >= 1*CLAMP_HI, ratio 1.5625 <= 3) showed
 *   the clamp alone could not invert off-track below on-track within ONE
 *   contribution class; that arithmetic still holds but is now SUPERSEDED as the
 *   safety mechanism by the statusTier-dominant sort, which holds across ALL
 *   classes and contribution types (the clamp could NOT, e.g. off-track/supporting
 *   raw 15 vs on-track/direct raw 15 was invertible by weight under the old
 *   score-dominant sort — the tier sort fixes exactly that case).
 */

// Bounded clamp range, symmetric in ratio around 1.0 (0.8 = 1/1.25).
export const CLAMP_LO = 0.8;
export const CLAMP_HI = 1.25;

// Standing directive seeded as the first explicit preference (FR-2 data seed).
export const WORKER_CAPABILITY_PREF_KEY = 'priority.worker_capability_over_adam_autonomy';
export const STANDING_WORKER_CAPABILITY_DIRECTIVE = Object.freeze({
  chairmanId: 'ehg_chairman',
  ventureId: null, // global
  key: WORKER_CAPABILITY_PREF_KEY,
  // Class weights the chairman's standing directive expresses: prefer
  // worker-capability work over Adam-autonomy work. Bounded values (pre-clamp).
  value: {
    'worker-capability': CLAMP_HI,
    'adam-autonomy': CLAMP_LO,
  },
  valueType: 'object',
  source: 'chairman_directive',
});

/**
 * FIX 3 (dead no-op closure) — candidate SOURCE class -> directive TOPIC class.
 *
 * THE BUG: harness candidates carry a SOURCE class (harness-backlog /
 * gate-tuning / eva-consultant), but the chairman's standing directive
 * (STANDING_WORKER_CAPABILITY_DIRECTIVE) keys on a TOPIC vocabulary
 * (worker-capability / adam-autonomy). selectAdvisory looked up prefWeights by
 * the raw source class, which NEVER matched the directive keys -> identity 1.0 ->
 * the directive was a guaranteed no-op (proven: prefWeights['harness-backlog']
 * is undefined for a directive that only defines 'worker-capability' /
 * 'adam-autonomy').
 *
 * THE BRIDGE (semantically correct): a candidate's TOPIC is what the chairman
 * actually expressed a priority over. We derive it from the candidate's
 * objective (O-GOV-1/2/3) — the governance objective it concerns — falling back
 * to the source class. The directive 'worker-capability > adam-autonomy' is a
 * topic priority; the harness source class is a SOURCE; this map is the bridge.
 *
 *   O-GOV-2 "Raise LEO Intelligence Integration Score"  (gate-tuning)
 *       -> 'worker-capability'  (making the LEO machinery / workers smarter)
 *   O-GOV-3 "Deploy Strategic Governance Stack"         (eva-consultant)
 *       -> 'adam-autonomy'      (governance-stack / Adam-machinery work)
 *   O-GOV-1 "Foundation Cleanup & Consolidation"        (harness-backlog)
 *       -> UNMAPPED (neutral infra debt — neither topic; stays at identity 1.0)
 *
 * Source class is mapped equivalently as a fallback (when objective is absent)
 * so the bridge is robust to either keying axis.
 */
export const CANDIDATE_TOPIC_BY_OBJECTIVE = Object.freeze({
  'O-GOV-2': 'worker-capability',
  'O-GOV-3': 'adam-autonomy',
  // O-GOV-1 deliberately omitted -> neutral (identity weight).
});

export const CANDIDATE_TOPIC_BY_SOURCE_CLASS = Object.freeze({
  'gate-tuning': 'worker-capability',
  'eva-consultant': 'adam-autonomy',
  // 'harness-backlog' deliberately omitted -> neutral (identity weight).
});

/**
 * Resolve a candidate's preference TOPIC class (the directive vocabulary), or
 * null when the candidate maps to no directive topic (-> identity weight 1.0).
 * Prefers the objective_kr.objective axis (most semantically precise), then the
 * source class. PURE.
 *
 * @param {object} candidate
 * @returns {string|null}
 */
export function candidatePreferenceClass(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const objective = candidate.objective_kr && candidate.objective_kr.objective;
  if (objective && CANDIDATE_TOPIC_BY_OBJECTIVE[objective]) {
    return CANDIDATE_TOPIC_BY_OBJECTIVE[objective];
  }
  const sourceClass = candidate.class || candidate.scope_key;
  if (sourceClass && CANDIDATE_TOPIC_BY_SOURCE_CLASS[sourceClass]) {
    return CANDIDATE_TOPIC_BY_SOURCE_CLASS[sourceClass];
  }
  return null;
}

/** Clamp a numeric weight into the documented bounded range. Non-finite -> 1.0. */
export function clamp(w) {
  if (typeof w !== 'number' || !Number.isFinite(w)) return 1.0;
  if (w < CLAMP_LO) return CLAMP_LO;
  if (w > CLAMP_HI) return CLAMP_HI;
  return w;
}

/** The list of explicit preference keys the model resolves. */
export const PREFERENCE_KEYS = [WORKER_CAPABILITY_PREF_KEY];

/**
 * Derive a WEAK class prior from chairman_decisions. These are gate/review
 * verdicts (approve/go/reject across stage gates), NOT topical priorities — so
 * we only nudge a single conservative class ('conservative') by a tiny amount
 * reflecting overall verdict caution, and we cap the total nudge so it can never
 * approach, let alone dominate, the explicit term. Returns { weights, consumed }.
 *
 * @param {Array} decisions  chairman_decisions rows (each may have .status/.decision)
 * @param {number} [perDecisionNudge=0.01]  weak influence per decision
 * @param {number} [maxNudge=0.1]           cap on the aggregate decisions nudge
 */
export function deriveDecisionsPrior(decisions, { perDecisionNudge = 0.01, maxNudge = 0.1 } = {}) {
  const rows = Array.isArray(decisions) ? decisions : [];
  if (rows.length === 0) return { weights: {}, consumed: 0 };
  // Count rejections/blocks as a caution signal toward the 'conservative' class.
  let cautious = 0;
  for (const d of rows) {
    const verdict = String(d?.decision ?? d?.status ?? '').toLowerCase();
    if (/reject|deny|block|no[-_ ]?go|kill|hold/.test(verdict)) cautious += 1;
  }
  // Magnitude is small and capped: at most maxNudge ABOVE 1.0, never dominant.
  const nudge = Math.min(maxNudge, cautious * perDecisionNudge);
  const weights = nudge > 0 ? { conservative: 1.0 + nudge } : {};
  return { weights, consumed: rows.length };
}

/**
 * Compute the bounded preference weight map. PURE given injected inputs.
 *
 * @param {object} args
 * @param {object} [args.store]        chairman-preference-store-like (getPreferences)
 * @param {object} [args.supabase]     used to build a default store if store omitted
 * @param {string} [args.chairmanId='ehg_chairman']
 * @param {string|null} [args.ventureId=null]
 * @param {Array} [args.decisions=[]]  chairman_decisions rows (weak prior)
 * @returns {Promise<{ weights: object, explicitClasses: string[], decisionsConsumed: number, source: string }>}
 */
export async function computePreferenceWeights({
  store,
  supabase,
  chairmanId = 'ehg_chairman',
  ventureId = null,
  decisions = [],
} = {}) {
  // Resolve the explicit (dominant) preference term, fail-soft.
  let explicitWeights = {};
  const explicitClasses = [];
  try {
    let resolver = store;
    if (!resolver && supabase) {
      const mod = await import('../eva/chairman-preference-store.js');
      resolver = mod.createChairmanPreferenceStore({ supabaseClient: supabase });
    }
    if (resolver && typeof resolver.getPreferences === 'function') {
      const resolved = await resolver.getPreferences({ chairmanId, ventureId, keys: PREFERENCE_KEYS });
      for (const [, pref] of resolved instanceof Map ? resolved : Object.entries(resolved || {})) {
        const val = pref?.value;
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const [cls, w] of Object.entries(val)) {
            if (typeof w === 'number') {
              explicitWeights[cls] = w; // dominant — overwrites any prior
              explicitClasses.push(cls);
            }
          }
        }
      }
    }
  } catch {
    explicitWeights = {};
  }

  // Weak decisions prior (soft, capped — never dominant).
  const { weights: priorWeights, consumed: decisionsConsumed } = deriveDecisionsPrior(decisions);

  // UNION: start from the weak prior, then let the explicit term DOMINATE
  // (overwrite) any overlapping class. Finally clamp every value to the range.
  const merged = { ...priorWeights };
  for (const [cls, w] of Object.entries(explicitWeights)) merged[cls] = w; // dominant
  const weights = {};
  for (const [cls, w] of Object.entries(merged)) weights[cls] = clamp(w);

  return {
    weights,
    explicitClasses: [...new Set(explicitClasses)],
    decisionsConsumed,
    source: explicitClasses.length ? 'explicit+decisions' : (decisionsConsumed ? 'decisions-only' : 'empty'),
  };
}

/**
 * Idempotent seed of the standing 'worker-capability > Adam-autonomy' directive
 * as an EXPLICIT chairman_preferences row. Skips the write if the row already
 * exists (resolves via the store). This is a one-row DATA seed against the
 * existing chairman_preferences table — NO schema change.
 *
 * INVOCATION: run at deploy/activation, e.g.
 *   node -e "import('./lib/adam/preference-model.js').then(m =>
 *     m.seedStandingPreference({ supabase }))"
 * It is NOT executed during EXEC/tests — it performs a live DB write.
 *
 * @param {object} args
 * @param {object} [args.store]    chairman-preference-store-like
 * @param {object} [args.supabase] used to construct a default store if store omitted
 * @returns {Promise<{ seeded: boolean, skipped: boolean, error?: string }>}
 */
export async function seedStandingPreference({ store, supabase } = {}) {
  let resolver = store;
  if (!resolver) {
    if (!supabase) return { seeded: false, skipped: false, error: 'no store or supabase provided' };
    const mod = await import('../eva/chairman-preference-store.js');
    resolver = mod.createChairmanPreferenceStore({ supabaseClient: supabase });
  }
  const d = STANDING_WORKER_CAPABILITY_DIRECTIVE;
  // Idempotency: skip if already present.
  try {
    const existing = await resolver.getPreference({
      chairmanId: d.chairmanId,
      ventureId: d.ventureId,
      key: d.key,
    });
    if (existing) return { seeded: false, skipped: true };
  } catch {
    // fall through to attempt the write
  }
  const res = await resolver.setPreference({
    chairmanId: d.chairmanId,
    ventureId: d.ventureId,
    key: d.key,
    value: d.value,
    valueType: d.valueType,
    source: d.source,
  });
  if (!res?.success) return { seeded: false, skipped: false, error: res?.error || 'setPreference failed' };
  return { seeded: true, skipped: false };
}
