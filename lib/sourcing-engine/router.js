/**
 * Pure sourcing-engine router — SD-LEO-INFRA-SOURCING-ENGINE-ROUTER-CORE-001 (FR-1..FR-4).
 *
 * routeCandidate(classifiedItem, context) is a PURE, TOTAL decision function: no LLM (the
 * classifier ran upstream), no DB IO, no Date.now()/Math.random(). It maps an already-classified
 * candidate onto exactly ONE of five sourcing LANES, returning the lane plus the routing payload a
 * downstream writer needs.
 *
 * LANE is a FIRST-CLASS field, DISTINCT from `disposition` (FR-3). `disposition` is the item's
 * lifecycle verdict (BUILD | RESEARCH | REFERENCE | CANCEL — see lib/intake/backlog-disposition.mjs);
 * `lane` is the sourcing route. The router passes `disposition` through unchanged and never re-derives
 * or overloads it.
 *
 * This child does NOT read/write the `lane` COLUMN (that is child LEDGER-LANE-COLUMN) and does NOT
 * wire into leo-create-sd (that is child REGISTER-FIRST). It is only the pure decision.
 */
// @wire-check-exempt: foundational pure module landed ahead of its consumers by design — the parent
// engine (SD-LEO-INFRA-SOURCING-ROADMAP-ENGINE-001) fences this child to the pure router only; its
// static importers are the sibling SDs LEDGER-LANE-COLUMN (persists the lane) and REGISTER-FIRST
// (calls routeCandidate before SD creation), which are not yet built. No CLI; consumed via import.

/** The five sourcing lanes (frozen — the canonical vocabulary). */
export const LANES = Object.freeze({
  BELT_READY: 'belt-ready',         // fleet-buildable + conflict-free + non-gated + novel
  BLOCKED_ON: 'blocked-on',         // dep / write-surface conflict with an in-flight SD
  CHAIRMAN_GATED: 'chairman-gated', // needs chairman authority (grant/rls/credential/operational/vision)
  OUTCOME_GATED: 'outcome-gated',   // needs an operational outcome before it is buildable
  DEDUP: 'dedup',                   // already represented by an existing SD
});

/** Authority kinds that force the chairman-gated lane. */
export const CHAIRMAN_AUTHORITIES = Object.freeze([
  'grant', 'rls', 'credential', 'operational', 'vision',
]);

const DEFAULT_JACCARD_THRESHOLD = 0.8;

/** Normalize a title for exact-match comparison: lowercase, trim, collapse internal whitespace. */
function normTitle(t) {
  return String(t == null ? '' : t).toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Tokenize a title into a Set of lowercased word tokens (for Jaccard similarity). */
function tokenize(t) {
  const norm = normTitle(t);
  if (!norm) return new Set();
  return new Set(norm.split(/[^a-z0-9]+/).filter(Boolean));
}

/** Intersection size of two token Sets. */
function intersectionSize(A, B) {
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter;
}

/** Jaccard similarity between two token Sets: |A∩B| / |A∪B| (0 when both empty). */
export function jaccard(a, b) {
  const A = a instanceof Set ? a : tokenize(a);
  const B = b instanceof Set ? b : tokenize(b);
  if (A.size === 0 && B.size === 0) return 0;
  const inter = intersectionSize(A, B);
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

// A fuzzy (non-exact) dedup match requires at least this many SHARED tokens, so a single
// coincidental token can never fuzzy-merge two otherwise-distinct candidates (a true single-token
// duplicate is caught by the exact-title path first). Reorderings like "auth user"/"user auth"
// share 2 tokens and still match.
const MIN_FUZZY_TOKEN_OVERLAP = 2;

function toSet(v) {
  if (v instanceof Set) return v;
  if (Array.isArray(v)) return new Set(v);
  return new Set();
}

const SD_KEY_RE = /^SD-[A-Z0-9-]+$/;

/**
 * Find the existing SD this candidate duplicates, or null. Match wins on ANY of:
 *   (1) source_id is itself an existing sd_key,
 *   (2) exact normalized title equality,
 *   (3) Jaccard(title) >= threshold.
 * @returns {{ sd_key:string, reason:'source_id'|'exact_title'|'jaccard', score?:number }|null}
 */
function findDedupMatch(item, existing, threshold) {
  const srcId = item && item.source_id;
  // (1) source_id already an sd_key present in the existing set
  if (typeof srcId === 'string' && SD_KEY_RE.test(srcId)) {
    const hit = existing.find((e) => e && e.sd_key === srcId);
    if (hit) return { sd_key: hit.sd_key, reason: 'source_id' };
  }
  const myNorm = normTitle(item && item.title);
  const myTokens = tokenize(item && item.title);
  let best = null;
  for (const e of existing) {
    if (!e || !e.sd_key) continue;
    if (myNorm && normTitle(e.title) === myNorm) {
      return { sd_key: e.sd_key, reason: 'exact_title' }; // exact beats fuzzy
    }
    const eTokens = tokenize(e.title);
    const score = jaccard(myTokens, eTokens);
    if (
      score >= threshold &&
      intersectionSize(myTokens, eTokens) >= MIN_FUZZY_TOKEN_OVERLAP &&
      (!best || score > best.score)
    ) {
      best = { sd_key: e.sd_key, reason: 'jaccard', score };
    }
  }
  return best;
}

/** Does this candidate conflict with an in-flight SD (shared write-surface OR a declared dep)? */
function findBlocker(item, inFlight) {
  const mySurfaces = toSet(item && item.writeSurfaces);
  const myDeps = toSet(item && item.dependsOn);
  for (const f of inFlight) {
    if (!f || !f.sd_key) continue;
    if (myDeps.has(f.sd_key)) return { sd_key: f.sd_key, reason: 'dependency' };
    const theirs = toSet(f.writeSurfaces);
    for (const s of mySurfaces) {
      if (theirs.has(s)) return { sd_key: f.sd_key, reason: 'write_surface', surface: s };
    }
  }
  return null;
}

/**
 * Route a classified candidate onto exactly one sourcing lane.
 *
 * @param {{
 *   source_id?: string, title?: string,
 *   disposition?: ('BUILD'|'RESEARCH'|'REFERENCE'|'CANCEL'|null),
 *   rung?: (string|null),
 *   authority?: ('grant'|'rls'|'credential'|'operational'|'vision'|null),
 *   needsOutcome?: boolean, targetRung?: (string|null), enablers?: string[],
 *   writeSurfaces?: string[], dependsOn?: string[]
 * }} classifiedItem
 * @param {{
 *   existing?: Array<{sd_key:string, title?:string}>,
 *   inFlight?: Array<{sd_key:string, writeSurfaces?:string[]}>,
 *   jaccardThreshold?: number,
 *   shippedInfraKeys?: (string[]|Set<string>),
 *   outcomeRealizedKeys?: (string[]|Set<string>)
 * }} [context]
 * @returns {{ lane:string, rung:(string|null), disposition:(string|null),
 *   escalation?:object, blocker?:object, enablers?:string[],
 *   dedup_match_sd_key?:string, re_emit?:boolean }}
 */
export function routeCandidate(classifiedItem, context = {}) {
  const item = classifiedItem || {};
  const ctx = context || {};
  const existing = Array.isArray(ctx.existing) ? ctx.existing : [];
  const inFlight = Array.isArray(ctx.inFlight) ? ctx.inFlight : [];
  const threshold =
    typeof ctx.jaccardThreshold === 'number' ? ctx.jaccardThreshold : DEFAULT_JACCARD_THRESHOLD;

  const disposition = item.disposition == null ? null : item.disposition;
  const rung = item.rung == null ? null : item.rung;
  const base = { rung, disposition };

  // (1) DEDUP — have we already sourced this? Short-circuits, but carries the re-emit flag for the
  // 'infra shipped, but the OUTCOME is not yet realized' case so a downstream writer can re-emit it
  // as outcome work rather than silently suppressing it.
  const dup = findDedupMatch(item, existing, threshold);
  if (dup) {
    const shipped = toSet(ctx.shippedInfraKeys);
    const realized = toSet(ctx.outcomeRealizedKeys);
    const re_emit = shipped.has(dup.sd_key) && !realized.has(dup.sd_key);
    return { ...base, lane: LANES.DEDUP, dedup_match_sd_key: dup.sd_key, re_emit };
  }

  // (2) CHAIRMAN-GATED — needs an authority only the chairman can grant.
  if (item.authority && CHAIRMAN_AUTHORITIES.includes(item.authority)) {
    return { ...base, lane: LANES.CHAIRMAN_GATED, escalation: { to: 'chairman', reason: item.authority } };
  }

  // (3) OUTCOME-GATED — not buildable until an operational outcome exists; surface the target rung
  // it unlocks plus any enabler hints so the consumer knows what must land first.
  if (item.needsOutcome === true) {
    return {
      ...base,
      lane: LANES.OUTCOME_GATED,
      rung: item.targetRung == null ? rung : item.targetRung,
      enablers: Array.isArray(item.enablers) ? item.enablers : [],
    };
  }

  // (4) BLOCKED-ON — a dep or write-surface conflict with an in-flight SD.
  const blocker = findBlocker(item, inFlight);
  if (blocker) {
    return { ...base, lane: LANES.BLOCKED_ON, blocker };
  }

  // (5) BELT-READY — the residual: novel (passed dedup), non-gated, conflict-free → fleet-buildable.
  return { ...base, lane: LANES.BELT_READY };
}
