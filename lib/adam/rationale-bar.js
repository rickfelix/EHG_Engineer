/**
 * The Adam rationale bar — the hard gate every candidate must clear before it
 * may surface as an advisory. SD-LEO-INFRA-ADAM-OPPORTUNITY-SCAN-001. PURE +
 * READ-ONLY (no DB, no I/O — fully unit-testable).
 *
 * A candidate clears the bar only if it:
 *   1. carries the full ordered rationale structure (incl. a REQUIRED counterfactual),
 *   2. cites a live anchor — an objective/KR, or (per-venture) an L2 vision + live metric,
 *   3. has non-zero OKR linkage (a 0 score is a missing-OKR GAP, not a valid low priority),
 *   4. does not duplicate an open SD,
 *   5. passes the CONST-002 (proposer != approver) + CONST-010 (factual framing) self-check.
 *
 * Scoring reuses lib/eva/okr-priority-integrator.js constants (off-track KR x3).
 * A GLOBAL cap of <=1 advisory per tick is enforced by selectAdvisory().
 */
import {
  getContributionWeights,
  getKRStatusMultipliers,
} from '../eva/okr-priority-integrator.js';
import { clamp, CLAMP_HI, candidatePreferenceClass } from './preference-model.js';

/**
 * CARDINAL INVARIANT (the whole point of this SD): a preference/Q2 weight must
 * NEVER override genuine objective (KR-status) signal. We enforce this with a
 * DOMINANT status tier that is the PRIMARY sort key — preference + wave
 * multipliers only ever reorder candidates WITHIN the same status tier.
 *
 * statusTier rank (higher = more urgent, surfaces first):
 *   off_track   -> 5  (most urgent)
 *   at_risk     -> 4
 *   not_started -> 3
 *   pending     -> 3  (treated as not-yet-acted, mid urgency)
 *   unknown     -> 2  (defaults to on_track-ish; never urgent)
 *   on_track    -> 2
 *   completed   -> 1
 *   achieved    -> 1  (least urgent)
 *
 * Because statusTier is compared BEFORE the (bounded) effective score, an
 * off-track candidate ALWAYS outranks an on-track one regardless of class,
 * preference weight, or wave alignment — the bounded-clamp arithmetic is no
 * longer load-bearing for cross-tier safety (it only nudges intra-tier order).
 */
const STATUS_TIER = Object.freeze({
  off_track: 5,
  at_risk: 4,
  not_started: 3,
  pending: 3,
  on_track: 2,
  completed: 1,
  achieved: 1,
});

/** Map a candidate's KR status to its dominant urgency tier (unknown -> on_track tier 2). */
export function statusTierOf(candidate) {
  const status = candidate && candidate.objective_kr && candidate.objective_kr.kr_status;
  return STATUS_TIER[status] ?? 2; // unknown / no anchor -> on_track-ish (never urgent)
}

/** Is the candidate at an URGENT objective tier (off_track / at_risk)? */
export function isUrgentStatus(candidate) {
  const status = candidate && candidate.objective_kr && candidate.objective_kr.kr_status;
  return status === 'off_track' || status === 'at_risk';
}

// FR-3: the LEO Roadmap. The Q2 wave-alignment term keys STRICTLY on this id and
// self-gates to a 1.0 no-op until it has waves (it has 0 today), so it can never
// false-fire on the EVA-Intake roadmap (ed12bf74…, 462 items).
export const LEO_ROADMAP_ID = '3aa2f3e2-75fa-4fc8-a17e-44d553b86674';

export const REQUIRED_RATIONALE_FIELDS = [
  'opportunity',
  'evidence',
  'rationale',
  'risk',
  'counterfactual',
];

// CONST-010: no manipulative/urgent/certainty/emotional framing.
// Exported (SD-LEO-INFRA-SMS-CHANNEL-HARDENING-001-D) so the Adam Outbound Gate reuses the SAME
// regex rather than re-deriving a parallel one that would silently drift from this authority.
export const MANIPULATIVE_PATTERNS =
  /\b(urgent(?:ly)?|immediately|act now|act fast|must act|critical(?:ly)?|guaranteed|certainly|definitely|absolutely|you (?:need|have) to|don'?t miss|last chance)\b/i;

/**
 * Compute an OKR-weighted score for a candidate from the KR it cites.
 * Returns null when no scoreable KR linkage exists (caller treats that as a GAP).
 * @param {object} candidate
 * @returns {number|null}
 */
export function scoreCandidate(candidate) {
  if (!candidate || !candidate.objective_kr || !candidate.objective_kr.kr_status) return null;
  const w = getContributionWeights();
  const m = getKRStatusMultipliers();
  const cw = w[candidate.contribution_type] ?? w.supporting; // unknown -> supporting (0.5)
  const sm = m[candidate.objective_kr.kr_status] ?? m.on_track; // unknown -> on_track (1.0)
  return Math.round(cw * sm * 10); // 0..~45
}

/** CONST-002 + CONST-010 self-check. */
export function passesConstSelfCheck(candidate) {
  const violations = [];
  // CONST-002: a candidate is a PROPOSAL — it must not encode an approve/accept/graduate action.
  if (candidate.action && /accept|approve|graduate|auto[-_ ]?(accept|approve)/i.test(String(candidate.action))) {
    violations.push('CONST-002: candidate encodes an approval action (proposer != approver)');
  }
  // CONST-010: factual framing only.
  const text = [candidate.opportunity, candidate.rationale, candidate.risk, candidate.counterfactual]
    .filter(Boolean)
    .join(' ');
  if (MANIPULATIVE_PATTERNS.test(text)) {
    violations.push('CONST-010: manipulative/urgent/certainty framing detected');
  }
  return { ok: violations.length === 0, violations };
}

/** A candidate must anchor to a live KR, or (per-venture) an L2 vision + live metric. */
export function hasLiveAnchor(candidate) {
  const hasKr = Boolean(candidate.objective_kr && candidate.objective_kr.kr);
  const hasVisionMetric = Boolean(candidate.l2_vision_ref && candidate.live_metric);
  return hasKr || hasVisionMetric;
}

/**
 * FR-3 — the Q2 wave-alignment term. PURE: derives the multiplier and the
 * align/unaligned verdict from a PRE-COMPUTED alignment object (the caller runs
 * okr-wave-linker.calculateAlignment keyed on LEO_ROADMAP_ID and injects it).
 *
 * SELF-GATING: when the alignment has 0 waves (today's LEO Roadmap state) OR no
 * alignment is provided, the term is INACTIVE — multiplier 1.0, never unaligned.
 * This makes it a provable no-op until the LEO Roadmap has waves, so it can never
 * false-fire on the EVA-Intake roadmap.
 *
 * When waves exist: a candidate whose roadmap_wave_ref OKR is in the aligned set
 * is "aligned" (multiplier CLAMP_HI); a Q1-passing candidate that is NOT aligned
 * is flagged unaligned (caller routes it to backlog).
 *
 * @param {object} candidate
 * @param {object} [waveAlignment]  calculateAlignment() result for LEO_ROADMAP_ID
 * @returns {{ active: boolean, multiplier: number, aligned: boolean|null }}
 */
export function waveAlignmentTerm(candidate, waveAlignment) {
  const waves = waveAlignment && Array.isArray(waveAlignment.waves) ? waveAlignment.waves : [];
  if (waves.length === 0) {
    // Inactive — provable no-op (self-gated on 0 waves / missing alignment).
    return { active: false, multiplier: 1.0, aligned: null };
  }
  // Active: derive the aligned OKR-id set from the roadmap's wave linkages.
  const alignedOkrIds = new Set();
  for (const w of waves) {
    for (const id of w.okr_ids || []) alignedOkrIds.add(id);
  }
  // A candidate aligns when its declared roadmap_wave_ref (an OKR id/code) is
  // among the roadmap's aligned OKRs. No ref => unaligned (when the term is on).
  const ref = candidate && candidate.roadmap_wave_ref;
  const aligned = Boolean(ref && alignedOkrIds.has(ref));
  return { active: true, multiplier: aligned ? CLAMP_HI : 1.0, aligned };
}

/**
 * SD-LEO-INFRA-ADAM-GAUGE-ESTATE-SOURCING-001 (FR-2) — THE SPINE WIRE capability_gap term.
 * The LIVE vision gauge as an ADDITIONAL sourcing lens: a candidate that DECLARES the vision
 * capability it advances (candidate.capability) is nudged UP when that capability's build% is LOW
 * (the gauge says it's the weakest) and left untouched when it's already built.
 *
 * PURE + self-gating, MIRRORING waveAlignmentTerm: the per-capability build% map is PRE-COMPUTED by
 * the caller (lib/adam/gauge-lens.js readCapabilityGaps) and injected via opts.capabilityGap. When
 * no map is provided, the candidate declares no capability, or the capability is not in the map
 * (e.g. an 'unknown'/unmeasurable capability excluded by FR-1), the term is INACTIVE — multiplier
 * 1.0, a provable no-op (byte-identical baseline; current production candidates declare no capability).
 *
 * CARDINAL INVARIANT: the multiplier is folded into _effective in selectAdvisory, where the
 * status-tier sort is compared FIRST — so capability_gap can ONLY reorder candidates WITHIN a
 * status tier; it can NEVER override the KR-status tier (preferences + roadmap stay PRIMARY).
 * Bound: lower build% => higher multiplier, capped at CLAMP_HI (same bound as preference/wave) so it
 * can never dominate. built (100%) => 1.0; unbuilt (0%) => CLAMP_HI; partial (50%) => midpoint.
 *
 * @param {object} candidate                     carries an optional `capability` (a VDR capability label)
 * @param {{ gaps?: Record<string, number> }} [capabilityGap]  readCapabilityGaps() result (gaps: cap -> build% 0-100)
 * @returns {{ active: boolean, multiplier: number, buildPct: number|null }}
 */
export function capabilityGapTerm(candidate, capabilityGap) {
  const gaps = capabilityGap && capabilityGap.gaps;
  const cap = candidate && candidate.capability;
  if (!gaps || !cap || !Object.prototype.hasOwnProperty.call(gaps, cap)) {
    return { active: false, multiplier: 1.0, buildPct: null };
  }
  // Defense-in-depth: require a real number. Number(null|''|false) all coerce to 0 (a phantom
  // max-boost); reject non-numbers so a malformed caller map can never invent a 0% gap.
  const buildPct = gaps[cap];
  if (typeof buildPct !== 'number' || !Number.isFinite(buildPct)) {
    return { active: false, multiplier: 1.0, buildPct: null };
  }
  // Lower build% => higher multiplier (bounded by CLAMP_HI). Linear: 100%->1.0, 0%->CLAMP_HI.
  const frac = Math.max(0, Math.min(1, 1 - buildPct / 100));
  const multiplier = 1.0 + (CLAMP_HI - 1.0) * frac;
  return { active: true, multiplier, buildPct };
}

/**
 * Evaluate a single candidate against the bar.
 * @param {object} candidate
 * @param {object} [opts]
 * @param {Set<string>|Array<string>} [opts.openSdKeys]
 * @param {object} [opts.waveAlignment] pre-computed calculateAlignment() for LEO_ROADMAP_ID
 * @returns {{ clears: boolean, score: number|null, reasons: string[], waveUnaligned: boolean }}
 */
export function evaluateCandidate(candidate, opts = {}) {
  const openSdKeys =
    opts.openSdKeys instanceof Set ? opts.openSdKeys : new Set(opts.openSdKeys || []);
  if (!candidate || typeof candidate !== 'object') {
    return { clears: false, score: null, reasons: ['no candidate'] };
  }
  const reasons = [];

  // 1. full rationale structure
  for (const f of REQUIRED_RATIONALE_FIELDS) {
    if (!candidate[f] || String(candidate[f]).trim().length === 0) reasons.push(`missing ${f}`);
  }
  // 2. live anchor — never fabricate
  if (!hasLiveAnchor(candidate)) reasons.push('no live KR or L2-vision+metric anchor');
  // 3. OKR linkage score (0 => missing-OKR GAP, only excused when an L2 vision anchor exists)
  const score = candidate.okr_score != null ? candidate.okr_score : scoreCandidate(candidate);
  if ((score == null || score <= 0) && !candidate.l2_vision_ref) {
    reasons.push('zero OKR linkage (missing-OKR GAP, not a valid candidate)');
  }
  // 4. dedup vs open SDs
  if (candidate.dedup_key && openSdKeys.has(candidate.dedup_key)) reasons.push('duplicates an open SD');
  // 5. CONST self-check
  const cc = passesConstSelfCheck(candidate);
  if (!cc.ok) reasons.push(...cc.violations);

  // FR-3 + CARDINAL INVARIANT (FIX 2): Q1-pass / Q2-unaligned routing. Only
  // ACTIVE when the LEO Roadmap has waves (self-gated). A candidate that
  // otherwise clears (Q1 pass) but is NOT wave-aligned is routed to backlog —
  // BUT this exclusion applies ONLY to NON-URGENT candidates (on_track /
  // achieved / completed / pending / not_started / unknown). An off_track or
  // at_risk KR candidate can NEVER be excluded/routed-to-backlog by Q2 wave
  // unalignment; genuine objective signal always clears the wave gate. (Wave
  // alignment may still nudge an urgent candidate's INTRA-TIER order via the
  // multiplier in selectAdvisory, but it never excludes it here.)
  const wave = waveAlignmentTerm(candidate, opts.waveAlignment);
  const q1Pass = reasons.length === 0;
  const urgent = isUrgentStatus(candidate);
  const waveUnaligned = wave.active && q1Pass && wave.aligned === false && !urgent;
  if (waveUnaligned) reasons.push('Q2 wave-unaligned (routed to backlog)');

  return { clears: reasons.length === 0, score, reasons, waveUnaligned };
}

/**
 * Resolve a candidate's PREFERENCE class key for weighting (FR-2).
 *
 * FIX 3 (dead no-op): candidates carry a SOURCE class (harness-backlog /
 * gate-tuning / eva-consultant) but the chairman's seeded directive keys on a
 * TOPIC vocabulary (worker-capability / adam-autonomy). Resolving the raw source
 * class against prefWeights always missed -> identity 1.0 -> the directive had
 * ZERO effect. candidatePreferenceClass() bridges source class + objective_kr.objective
 * to the directive's topic vocabulary so the weight actually applies. It returns
 * the topic when one is mapped, else falls back to the raw source class /
 * scope_key (so non-harness scopes keyed directly by class still work).
 */
function candidateClass(c) {
  return candidatePreferenceClass(c) || (c && (c.class || c.scope_key)) || 'default';
}

/**
 * Evaluate all candidates, rank the cleared ones, and apply the GLOBAL <=1
 * advisory cap. Returns the single advisory to surface (or null => ADAM_OK).
 *
 * CARDINAL INVARIANT (FIX 1): the DOMINANT sort key is the KR-status tier. We
 * sort by (statusTier DESC, effectiveScore DESC, confidence DESC) where
 *   effectiveScore = rawScore * clamp(prefWeights[class] ?? 1.0) * waveMultiplier.
 * Because statusTier is compared FIRST, an off-track candidate ALWAYS outranks
 * an on-track one regardless of class, preference weight, or wave alignment —
 * the preference weight can only reorder candidates WITHIN the same status tier.
 * (The bounded clamp's cross-class safety now comes from this statusTier-dominant
 * sort, NOT from the clamp arithmetic; intra-tier inversion across classes is the
 * intended, acceptable effect of the weight.)
 *
 * BYTE-IDENTICAL baseline: a FLAT all-1.0 prefWeights map with no wave alignment
 * yields effectiveScore === rawScore for every candidate, so the ordering is the
 * same (statusTier, then rawScore, then confidence) as the OKR-only baseline —
 * which is itself now sorted statusTier-first. On every rank change a
 * perturbation trace is emitted.
 *
 * @param {Array} candidates
 * @param {object} [opts]
 * @param {Set<string>|Array<string>} [opts.openSdKeys]
 * @param {object} [opts.prefWeights]   class -> bounded weight (from preference-model)
 * @param {object} [opts.waveAlignment] pre-computed calculateAlignment() for LEO_ROADMAP_ID
 * @param {object} [opts.capabilityGap] FR-2 SPINE WIRE: readCapabilityGaps() result ({gaps: cap->build%});
 *        an ADDITIONAL intra-tier multiplier (lower build% => higher rank). 1.0 no-op when absent.
 * @returns {{ surfaced: object|null, verdict: 'ADAM_OK'|'SURFACED', cleared: number, evaluated: Array, trace: Array }}
 */
export function selectAdvisory(candidates, opts = {}) {
  const prefWeights = opts.prefWeights || {};
  const evaluated = (candidates || []).map((c) => {
    const e = evaluateCandidate(c, opts);
    return { candidate: c, ...e };
  });
  const cleared = evaluated.filter((x) => x.clears);
  if (cleared.length === 0) {
    return { surfaced: null, verdict: 'ADAM_OK', cleared: 0, evaluated, trace: [] };
  }

  // Annotate each cleared candidate with its status tier, bounded weight + effective score.
  for (const x of cleared) {
    const cls = candidateClass(x.candidate);
    const prefW = clamp(prefWeights[cls] ?? 1.0); // bounded; missing -> identity 1.0
    const wave = waveAlignmentTerm(x.candidate, opts.waveAlignment); // 1.0 when inactive
    const capGap = capabilityGapTerm(x.candidate, opts.capabilityGap); // FR-2: 1.0 when inactive
    x._class = cls;
    x._prefW = prefW;
    x._waveMul = wave.multiplier;
    x._capGapMul = capGap.multiplier;
    x._tier = statusTierOf(x.candidate); // DOMINANT sort key (CARDINAL INVARIANT)
    // FR-2: capability_gap is ANOTHER bounded intra-tier multiplier folded into _effective —
    // the statusTier sort (below) is compared FIRST, so it can never override KR-status.
    x._effective = (x.score ?? 0) * prefW * wave.multiplier * capGap.multiplier;
  }

  // BASELINE order = OKR-only ordering, statusTier-dominant (raw score, then confidence).
  const baseline = [...cleared].sort(
    (a, b) =>
      b._tier - a._tier ||
      (b.score ?? 0) - (a.score ?? 0) ||
      (b.candidate.confidence ?? 0) - (a.candidate.confidence ?? 0)
  );
  const baseRankByCand = new Map(baseline.map((x, i) => [x.candidate, i]));

  // FINAL order = statusTier (DOMINANT), then effective score, then confidence.
  // statusTier compared FIRST guarantees off-track always outranks on-track; the
  // preference/wave weight can only reorder WITHIN a tier.
  const finalOrder = [...cleared].sort(
    (a, b) =>
      b._tier - a._tier ||
      (b._effective ?? 0) - (a._effective ?? 0) ||
      (b.candidate.confidence ?? 0) - (a.candidate.confidence ?? 0)
  );

  // Emit a rank-perturbation trace for EVERY candidate whose rank moved.
  const trace = [];
  finalOrder.forEach((x, finalRank) => {
    const baseRank = baseRankByCand.get(x.candidate);
    if (baseRank !== finalRank) {
      const combined = x._prefW * x._waveMul * x._capGapMul;
      trace.push({
        base_rank: baseRank,
        final_rank: finalRank,
        moved_by_weight: combined !== 1.0,
        class: x._class,
        weight: combined,
      });
    }
  });

  return {
    surfaced: { ...finalOrder[0].candidate, okr_score: finalOrder[0].score, effective_score: finalOrder[0]._effective },
    verdict: 'SURFACED',
    cleared: cleared.length,
    evaluated,
    trace,
  };
}

/** Format the surfaced candidate into the ordered advisory body string. */
export function formatAdvisoryBody(c) {
  if (!c) return '';
  const anchor = c.objective_kr && c.objective_kr.kr
    ? `${c.objective_kr.objective || '(objective)'} / ${c.objective_kr.kr} (off-track delta: ${c.objective_kr.off_track_delta ?? 'n/a'})`
    : `L2-vision ${c.l2_vision_ref} + live metric ${c.live_metric}`;
  return [
    `[ADAM ADVISORY] scope=${c.scope_key}`,
    `Opportunity: ${c.opportunity}`,
    `Objective/KR: ${anchor}`,
    `Evidence: ${c.evidence}`,
    `Rationale: ${c.rationale}`,
    `Risk: ${c.risk}`,
    `Counterfactual: ${c.counterfactual}`,
    `Confidence: ${c.confidence ?? 'n/a'}`,
  ].join('\n');
}
