/**
 * Build-SD Review Gate
 *
 * SD-LEO-INFRA-BUILD-SD-REVIEW-GATE-001
 *
 * Second-party review of EVA Stage-19 build payloads (the sd_bridge_payloads),
 * run POST-payload / PRE-INSERT by lib/eva/lifecycle-sd-bridge.js — i.e. BEFORE
 * any build SD exists, while issues are still cheap to fix. Without this gate the
 * Stage-19 bridge emits build SDs to the belt unilaterally (the unreviewed
 * auto-generation risk class — same as the reserved-gate bypass).
 *
 * Four review dimensions:
 *   (a) vision-alignment      — each payload overlaps the chairman-approved vision themes
 *   (b) standards-completeness — the build set covers the mandatory default-capabilities
 *   (c) tier-coherence         — each payload maps to exactly one worker tier
 *   (d) gaps/dupes             — no payload duplicates an existing SD
 *
 * Hybrid ownership (FR-3): the coordinator owns (c)+(d) — cheap deterministic
 * DB/heuristic queries run IN-PROCESS here so the whole review never bottlenecks
 * on the live coordinator. (a)+(b) are the institutional-knowledge dimensions
 * (Adam / a sub-agent panel); for this advisory-first cut they run as in-process
 * heuristics, with the live multi-agent PANEL dispatch a documented follow-on.
 *
 * Advisory-first + FAIL-OPEN (FR-4): defaults to ADVISORY (flag + log, never
 * block). ENFORCING mode (config flag, default off) holds flagged build SDs
 * pre-claim (requires_human_action=true) with a MANDATORY timeout->proceed
 * escape — a dead/slow reviewer must NEVER wedge the build path (the S19 bridge
 * wedged once already on the stack_descriptor incident). The whole review is
 * wrapped in a try/catch + timeout race; any error/timeout => proceed_failopen,
 * no hold.
 *
 * The authoritative mandatory-capability LIST is deliberately NOT defined here —
 * it is owned by the sibling SD (SD-LEO-INFRA-VENTURE-DEFAULT-CAPABILITIES-
 * EXPAND-001) and INJECTED as `mandatoryCapabilities`. When absent, dimension (b)
 * is a fail-safe no-op pass (never flag against an undefined standard).
 *
 * @module lib/eva/build-sd-review-gate
 */

import { fetchAllPaginated } from '../db/fetch-all-paginated.mjs';

export const DEFAULT_REVIEW_TIMEOUT_MS = 20000;

/** Resolve advisory|enforcing from env (BUILD_SD_REVIEW_MODE) then config; default advisory. */
export function resolveReviewMode({ env = process.env, config = null } = {}) {
  const raw = (env?.BUILD_SD_REVIEW_MODE || config?.build_sd_review_mode || 'advisory')
    .toString().trim().toLowerCase();
  return raw === 'enforcing' ? 'enforcing' : 'advisory';
}

/** Lowercase, collapse non-alphanumerics to single spaces — for token/dup comparison. */
export function normalizeReviewKey(s) {
  return (s == null ? '' : String(s)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'onto',
  'venture', 'vision', 'build', 'feature', 'system', 'support', 'enable',
]);

/** Collect significant (>=4 char, non-stopword) lowercase tokens from the curated vision dimensions. */
export function extractVisionTerms(canonicalVision) {
  if (!canonicalVision) return [];
  const dims = canonicalVision.extracted_dimensions
    ?? canonicalVision.metadata?.extracted_dimensions
    ?? null;
  const collected = [];
  const pushFrom = (v) => {
    if (v == null) return;
    if (typeof v === 'string') { collected.push(v); return; }
    if (Array.isArray(v)) { v.forEach(pushFrom); return; }
    if (typeof v === 'object') {
      for (const key of ['name', 'dimension', 'theme', 'label', 'value', 'title']) {
        if (typeof v[key] === 'string') { collected.push(v[key]); break; }
      }
      // a map of theme -> detail: the (non-numeric) keys are themselves themes
      for (const k of Object.keys(v)) { if (Number.isNaN(Number(k))) collected.push(k); }
    }
  };
  pushFrom(dims);
  const out = new Set();
  for (const term of collected) {
    for (const tok of normalizeReviewKey(term).split(' ')) {
      if (tok.length >= 4 && !STOPWORDS.has(tok)) out.add(tok);
    }
  }
  return [...out];
}

function payloadText(p) {
  return normalizeReviewKey([p?.title, p?.scope, p?.description].filter(Boolean).join(' '));
}

// ── Dimension (a): vision-alignment ─────────────────────────────────────────
export function reviewVisionAlignment(payloads, canonicalVision) {
  const flags = [];
  const terms = extractVisionTerms(canonicalVision);
  if (!terms.length) {
    return {
      dimension: 'vision_alignment', owner: 'panel', ran: true, skipped: true,
      reason: 'no curated vision themes available (fail-safe pass)', flags,
    };
  }
  payloads.forEach((p, index) => {
    const hay = payloadText(p);
    const aligned = terms.some((t) => t && hay.includes(t));
    if (!aligned) {
      flags.push({
        dimension: 'vision_alignment', index, title: p?.title || null,
        reason: 'no overlap with the chairman-approved vision themes',
      });
    }
  });
  return { dimension: 'vision_alignment', owner: 'panel', ran: true, skipped: false, flags };
}

// ── Dimension (b): standards-completeness ───────────────────────────────────
// `mandatoryCapabilities`: array of strings, or { name, keywords?: string[] }.
// The build SET must collectively cover each required capability. The LIST is
// injected (owned by the sibling SD); absent => fail-safe no-op pass.
export function reviewStandardsCompleteness(payloads, mandatoryCapabilities) {
  const flags = [];
  const required = Array.isArray(mandatoryCapabilities)
    ? mandatoryCapabilities.filter(Boolean) : [];
  if (!required.length) {
    return {
      dimension: 'standards_completeness', owner: 'panel', ran: true, skipped: true,
      reason: 'no mandatory-capability list configured (fail-safe pass; list owned by sibling SD)',
      flags,
    };
  }
  const haystack = payloads.map(payloadText).join(' ');
  for (const cap of required) {
    const name = typeof cap === 'string' ? cap : (cap.name || cap.capability || '');
    const keywords = (typeof cap === 'object' && Array.isArray(cap.keywords) && cap.keywords.length)
      ? cap.keywords : [name];
    const present = keywords.some((kw) => {
      const k = normalizeReviewKey(kw);
      return k && haystack.includes(k);
    });
    if (!present) {
      flags.push({
        dimension: 'standards_completeness', capability: name || String(cap),
        reason: 'no build payload covers this mandatory default-capability',
      });
    }
  }
  return { dimension: 'standards_completeness', owner: 'panel', ran: true, skipped: false, flags };
}

// ── Dimension (c): tier-coherence ───────────────────────────────────────────
// Reuses the bridge's sprintItemLayerRank (injected as `layerRank`). A payload is
// incoherent if it supplies NO layer-bearing field (so the bridge silently
// defaults its tier) OR its present layer fields disagree on rank (claims >1 tier).
export function reviewTierCoherence(payloads, layerRank) {
  const flags = [];
  if (typeof layerRank !== 'function') {
    return {
      dimension: 'tier_coherence', owner: 'coordinator', ran: true, skipped: true,
      reason: 'no layerRank classifier injected (fail-safe pass)', flags,
    };
  }
  const LAYER_FIELDS = ['architecture_layer', 'scope', 'type'];
  payloads.forEach((p, index) => {
    const present = LAYER_FIELDS.filter((f) => p && p[f]);
    if (present.length === 0) {
      flags.push({
        dimension: 'tier_coherence', index, title: p?.title || null,
        reason: 'no architecture_layer/scope/type — cannot map to a single worker tier (silent default)',
      });
      return;
    }
    const ranks = new Set(present.map((f) => layerRank({ [f]: p[f] })));
    if (ranks.size > 1) {
      flags.push({
        dimension: 'tier_coherence', index, title: p?.title || null,
        reason: `conflicting layer signals across fields — maps to multiple tiers (${[...ranks].join(',')})`,
      });
    }
  });
  return { dimension: 'tier_coherence', owner: 'coordinator', ran: true, skipped: false, flags };
}

// ── Dimension (d): gaps/dupes ───────────────────────────────────────────────
// Normalized-title belt scan of non-cancelled SDs. Throws on DB error so the
// caller's fail-open path handles it (never silently swallow).
export async function reviewGapsDupes(payloads, { supabase, logger = console } = {}) {
  const flags = [];
  if (!supabase) {
    return {
      dimension: 'gaps_dupes', owner: 'coordinator', ran: true, skipped: true,
      reason: 'no supabase client (fail-safe pass)', flags,
    };
  }
  // SD-LEO-INFRA-COUNT-TRUNCATION-DISCIPLINE-001 FR-6 batch 7: the prior .limit(5000)
  // exceeded the PostgREST max-rows cap, so the server silently clamped the belt scan
  // to 1000 rows — dupes beyond that were invisible. Paginate to the declared 5000 cap.
  let data;
  try {
    data = await fetchAllPaginated(() => supabase
      .from('strategic_directives_v2')
      .select('sd_key,title,status')
      .neq('status', 'cancelled')
      .order('sd_key', { ascending: true }), { maxRows: 5000 });
  } catch (e) {
    throw new Error(`gaps_dupes belt scan failed: ${e.message}`);
  }
  const existing = new Map();
  for (const row of (data || [])) {
    const key = normalizeReviewKey(row.title);
    if (key && !existing.has(key)) existing.set(key, row.sd_key);
  }
  payloads.forEach((p, index) => {
    const key = normalizeReviewKey(p?.title);
    if (key && existing.has(key)) {
      flags.push({
        dimension: 'gaps_dupes', index, title: p?.title || null,
        existing_sd: existing.get(key),
        reason: `duplicate of existing SD ${existing.get(key)}`,
      });
    }
  });
  return { dimension: 'gaps_dupes', owner: 'coordinator', ran: true, skipped: false, flags };
}

function withTimeout(promise, ms) {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`build-sd review timeout after ${ms}ms`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Review a set of Stage-19 build payloads PRE-INSERT.
 *
 * @param {Object} input
 * @param {Array}  input.payloads               - sd_bridge_payloads (sprint items)
 * @param {Object} [input.ventureContext]       - { id, name } (for logging)
 * @param {Object} [input.canonicalVision]      - the chairman-approved L2 vision row (extracted_dimensions)
 * @param {Array}  [input.mandatoryCapabilities]- injected default-capability list (sibling SD owns it)
 * @param {('advisory'|'enforcing')} [input.mode] - overrides config resolution
 * @param {number} [input.timeoutMs]            - fail-open timeout (default 20s)
 * @param {Object} [deps]
 * @param {Object} [deps.supabase]              - dup belt scan client
 * @param {Object} [deps.logger]                - logger (default console)
 * @param {Function} [deps.layerRank]           - sprintItemLayerRank (tier-coherence)
 * @param {Object} [deps.env]                   - env source (default process.env)
 * @param {Object} [deps.config]                - chairman_dashboard_config row
 * @returns {Promise<{verdict, mode, dimensions, flags, hold, failOpen, error?}>}
 *   verdict ∈ 'pass' | 'flagged' | 'proceed_failopen'. `hold` is true ONLY when
 *   mode='enforcing' AND verdict='flagged' (caller applies requires_human_action).
 */
export async function reviewBuildPayloads(input = {}, deps = {}) {
  const {
    payloads = [],
    ventureContext = null,
    canonicalVision = null,
    mandatoryCapabilities = null,
    mode: modeIn = null,
    timeoutMs = DEFAULT_REVIEW_TIMEOUT_MS,
  } = input;
  const { supabase = null, logger = console, layerRank = null, env = process.env, config = null } = deps;
  const mode = modeIn || resolveReviewMode({ env, config });

  const runReview = async () => {
    const dimensions = {
      vision_alignment: reviewVisionAlignment(payloads, canonicalVision),
      standards_completeness: reviewStandardsCompleteness(payloads, mandatoryCapabilities),
      tier_coherence: reviewTierCoherence(payloads, layerRank),
      gaps_dupes: await reviewGapsDupes(payloads, { supabase, logger }),
    };
    const flags = Object.values(dimensions).flatMap((d) => d.flags || []);
    const verdict = flags.length ? 'flagged' : 'pass';
    return {
      verdict, mode, dimensions, flags,
      hold: mode === 'enforcing' && verdict === 'flagged',
      failOpen: false,
      reviewed_at: new Date().toISOString(),
    };
  };

  try {
    const result = await withTimeout(runReview(), timeoutMs);
    if (result.flags.length) {
      logger.warn(
        `[BuildSDReviewGate] ${result.verdict} (${mode}) for venture ${ventureContext?.name || ventureContext?.id || '?'}: `
        + `${result.flags.length} flag(s) — ${result.flags.map((f) => f.dimension).join(', ')}`,
      );
    }
    return result;
  } catch (err) {
    // FAIL-OPEN: a down/slow/throwing reviewer must NEVER wedge the build path.
    logger.warn(
      `[BuildSDReviewGate] FAIL-OPEN: review error/timeout (${err.message}) — proceeding without hold (mode=${mode})`,
    );
    return {
      verdict: 'proceed_failopen', mode, dimensions: {}, flags: [],
      hold: false, failOpen: true, error: err.message,
      reviewed_at: new Date().toISOString(),
    };
  }
}

export default reviewBuildPayloads;
