/**
 * Automated Differentiation Board — the moat
 * SD-COMPETITIVE-INTELLIGENCE-ACROSS-THE-ORCH-001-E (Phase 2)
 *
 * Runs the existing 6-seat Board-of-Directors deliberation engine
 * (lib/brainstorm/deliberation-engine.js) HEADLESS on a competitor_intelligence
 * record to synthesize a DEFENSIBLE differentiation strategy — then scores a
 * differentiation-delta, gates me-too clones, sanitizes the venture-facing
 * output, and persists everything into the Child A canonical record.
 *
 * No new board engine is built. We inject an `invokeAgent` callback (wrapping
 * getLLMClient at the Opus tier) into the owned engine. The creative work (board
 * deliberation, verdict) is the LLM's; the SCORING + GATING + SANITIZATION are
 * deterministic, pure, and auditable here.
 */

import { executeDeliberation, synthesizeVerdict } from '../brainstorm/deliberation-engine.js';
import { getLLMClient } from '../llm/client-factory.js';
import { getCompetitorIntelligence, upsertCompetitorIntelligence } from './canonical-store.js';

export const DEFAULT_DELTA_THRESHOLD = 0.5;

/**
 * Build an invokeAgent callback for headless board runs. Wraps getLLMClient at
 * the Opus tier (the board synthesis is the only Opus-tier step — cost tiering
 * per the CFO constraint). Signature matches the engine: (systemPrompt, userPrompt) => string.
 *
 * @param {Object} [opts]
 * @param {string} [opts.provider]
 * @param {string} [opts.model]
 * @returns {Function}
 */
export function buildOpusInvokeAgent(opts = {}) {
  return async (systemPrompt, userPrompt) => {
    const client = getLLMClient({
      provider: opts.provider || process.env.DELIBERATION_PROVIDER || 'anthropic',
      model: opts.model || process.env.DELIBERATION_MODEL || 'claude-opus-4-8',
      purpose: 'validation',
    });
    const res = await client.complete(systemPrompt, userPrompt, { max_tokens: 4096, timeout: 120000 });
    return typeof res === 'string' ? res : res?.content || '';
  };
}

/**
 * Structure a judiciary verdict + deliberation into a differentiation strategy.
 * Pure — parses the verdict text into a structured object. The board's job is to
 * force a defensible angle; this captures it without inventing content.
 *
 * @param {string} verdictText
 * @param {Object} deliberationResult - return of executeDeliberation
 * @param {string|null} verdictId
 * @returns {Object} differentiation_strategy
 */
export function synthesizeDifferentiationStrategy(verdictText, deliberationResult = {}, verdictId = null) {
  const text = String(verdictText || '');
  // Pull a RECOMMENDATION block if present, else use the whole verdict.
  const recoMatch = text.match(/RECOMMENDATION:?\s*([\s\S]*?)(?:\n[A-Z ]{3,}:|\n\d\.|$)/i);
  const recommendation = (recoMatch ? recoMatch[1] : text).trim();

  // Extract candidate "unique advantage" bullet lines from the verdict.
  const uniqueAdvantages = extractAdvantageLines(text);

  return {
    angle: recommendation.slice(0, 600),
    unique_advantages: uniqueAdvantages,
    consensus: sectionOf(text, 'CONSENSUS'),
    tensions: sectionOf(text, 'TENSIONS'),
    source_verdict_id: verdictId,
    source_debate_session_id: deliberationResult.debateSessionId || null,
    panel_size: deliberationResult.panelSize || 0,
    quorum_met: deliberationResult.quorumMet === true,
    synthesized_at: null, // stamped by caller (no Date in pure fn for determinism in tests)
  };
}

/**
 * Compute a deterministic differentiation-delta in [0,1]. Higher = more
 * defensibly differentiated from the analyzed competitor. Pure + auditable so
 * the moat gate is explainable, not a black box.
 *
 * Signals:
 *  - count of distinct unique advantages (capped)
 *  - presence of a structural/automation angle (EHG's core edge)
 *  - me-too penalty when the strategy's advantages echo the competitor's own
 *    known features (string overlap)
 *
 * @param {Object} strategy - output of synthesizeDifferentiationStrategy
 * @param {Object} record - the competitor_intelligence record (for competitor features)
 * @returns {number} delta in [0,1]
 */
export function computeDifferentiationDelta(strategy, record = {}) {
  const advantages = Array.isArray(strategy?.unique_advantages) ? strategy.unique_advantages : [];
  const distinct = dedupeLower(advantages);

  // Base: more distinct advantages → higher, saturating at 4.
  const breadth = Math.min(distinct.length, 4) / 4; // 0..1

  // Structural/automation angle bonus.
  const angleText = `${strategy?.angle || ''} ${distinct.join(' ')}`.toLowerCase();
  const structural = /(automat|first-principle|structural|cost structure|24\/7|no headcount|ai-operated|workflow)/.test(angleText)
    ? 0.2
    : 0;

  // Me-too penalty: fraction of advantages that merely restate competitor features.
  const competitorFeatures = extractCompetitorFeatures(record).map((f) => f.toLowerCase());
  let echoes = 0;
  for (const a of distinct) {
    const al = a.toLowerCase();
    if (competitorFeatures.some((f) => f && (al.includes(f) || f.includes(al)) && f.length > 4)) echoes += 1;
  }
  const meTooPenalty = distinct.length ? (echoes / distinct.length) * 0.5 : 0.5; // no advantages = max penalty

  const raw = breadth * 0.8 + structural - meTooPenalty;
  return clamp01(Number(raw.toFixed(4)));
}

/**
 * Apply the differentiation-delta gate. Pure.
 * @param {number} delta
 * @param {number} [threshold]
 * @returns {{seedable: boolean, delta: number, threshold: number, reason: string}}
 */
export function applyDeltaGate(delta, threshold = DEFAULT_DELTA_THRESHOLD) {
  const seedable = delta >= threshold;
  return {
    seedable,
    delta,
    threshold,
    reason: seedable
      ? `differentiation_delta ${delta} >= threshold ${threshold} — defensible, seedable`
      : `differentiation_delta ${delta} < threshold ${threshold} — me-too, blocked (operator confirmation required)`,
  };
}

/**
 * Sanitize a venture-facing differentiation strategy: strip direct competitor
 * names/trademarks from the venture-facing fields. Pure. Returns the sanitized
 * strategy plus a status (passed when clean, flagged when residuals remain).
 *
 * @param {Object} strategy
 * @param {string[]} competitorNames - names/trademarks to strip
 * @returns {{sanitized: Object, status: 'passed'|'flagged', residuals: string[]}}
 */
export function sanitizeStrategy(strategy, competitorNames = []) {
  const names = competitorNames
    .filter((n) => typeof n === 'string' && n.trim().length > 1)
    .map((n) => n.trim());
  const residuals = [];

  const scrub = (value) => {
    if (typeof value === 'string') {
      let out = value;
      for (const name of names) {
        const re = new RegExp(escapeRegExp(name), 'gi');
        if (re.test(out)) out = out.replace(re, 'the competitor');
      }
      return out;
    }
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object') {
      const o = {};
      for (const [k, v] of Object.entries(value)) o[k] = scrub(v);
      return o;
    }
    return value;
  };

  const sanitized = scrub(strategy);

  // Residual detection: any competitor name still present anywhere.
  const flat = JSON.stringify(sanitized).toLowerCase();
  for (const name of names) {
    if (flat.includes(name.toLowerCase())) residuals.push(name);
  }

  return { sanitized, status: residuals.length ? 'flagged' : 'passed', residuals };
}

/**
 * Run the headless differentiation board on a competitor_intelligence record:
 * deliberate → synthesize verdict → structure strategy → score delta → gate →
 * sanitize → persist into the canonical record. Engine functions and clients are
 * injectable so this is unit-testable without LLM calls or board DB writes.
 *
 * @param {string} ciRecordId
 * @param {Object} [opts]
 * @param {Object} [opts.supabase]
 * @param {Function} [opts.invokeAgent] - LLM callback (defaults to Opus wrapper)
 * @param {number} [opts.threshold]
 * @param {Function} [opts.deliberateFn] - defaults to executeDeliberation
 * @param {Function} [opts.synthesizeFn] - defaults to synthesizeVerdict
 * @param {string} [opts.nowIso] - timestamp injection (determinism)
 * @returns {Promise<Object>} { ciRecordId, debateSessionId, delta, gate, sanitization_status, strategy, record }
 */
export async function runDifferentiationBoard(ciRecordId, opts = {}) {
  if (!ciRecordId) throw new Error('ciRecordId is required');
  const supabase = opts.supabase;
  const invokeAgent = opts.invokeAgent || buildOpusInvokeAgent(opts);
  const threshold = opts.threshold ?? DEFAULT_DELTA_THRESHOLD;
  const deliberateFn = opts.deliberateFn || executeDeliberation;
  const synthesizeFn = opts.synthesizeFn || synthesizeVerdict;

  const record = await getCompetitorIntelligence({ id: ciRecordId }, { supabase });
  if (!record) throw new Error(`competitor_intelligence record not found: ${ciRecordId}`);

  const competitorName = record.competitor_name || record.competitor_url || 'the competitor';
  const topic = `Differentiation strategy vs competitor: ${competitorName}`;
  const keywords = ['differentiation', 'competition', 'moat', 'positioning'];

  // 1. Deliberate (board) + 2. Synthesize verdict — both via injected engine.
  const deliberation = await deliberateFn({
    topic,
    brainstormSessionId: `ci-board-${ciRecordId}`,
    keywords,
    invokeAgent,
    topicContext: { competitor_intelligence_id: ciRecordId, competitor: competitorName },
  });
  const verdict = await synthesizeFn(deliberation, invokeAgent);

  // 3. Structure strategy
  const strategy = synthesizeDifferentiationStrategy(
    verdict?.verdictText || verdict?.verdict || '',
    deliberation,
    verdict?.verdictId || null
  );
  strategy.synthesized_at = opts.nowIso || null;

  // 4. Score delta + 5. Gate
  const delta = computeDifferentiationDelta(strategy, record);
  const gate = applyDeltaGate(delta, threshold);

  // 6. Sanitize venture-facing strategy
  const competitorNames = [record.competitor_name, deriveDomainName(record.competitor_url)].filter(Boolean);
  const { sanitized, status, residuals } = sanitizeStrategy(strategy, competitorNames);

  // 7. Persist into the Child A canonical record slots
  const persisted = await upsertCompetitorIntelligence(
    {
      id: ciRecordId,
      differentiation_strategy: { ...sanitized, gate, residuals_flagged: residuals },
      differentiation_delta: delta,
      sanitization_status: status,
    },
    { supabase }
  );

  return {
    ciRecordId,
    debateSessionId: deliberation?.debateSessionId || null,
    delta,
    gate,
    sanitization_status: status,
    residuals,
    strategy: sanitized,
    quorumMet: deliberation?.quorumMet === true,
    record: persisted,
  };
}

// ─── pure helpers ──────────────────────────────────────────────────────────

function extractAdvantageLines(text) {
  const lines = String(text).split('\n');
  const out = [];
  for (const line of lines) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.{8,200})$/);
    if (m) out.push(m[1].trim());
  }
  return dedupeLower(out).slice(0, 8);
}

function sectionOf(text, header) {
  const re = new RegExp(`${header}:?\\s*([\\s\\S]*?)(?:\\n[A-Z ]{3,}:|\\n\\d\\.|$)`, 'i');
  const m = String(text).match(re);
  return m ? m[1].trim().slice(0, 400) : '';
}

function extractCompetitorFeatures(record) {
  const ci = record?.competitive_intelligence || {};
  const feats = [];
  if (Array.isArray(ci.key_features)) feats.push(...ci.key_features);
  if (ci.product?.key_features) {
    for (const f of ci.product.key_features) feats.push(typeof f === 'object' ? f.value : f);
  }
  return feats.filter((f) => typeof f === 'string');
}

function deriveDomainName(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  } catch {
    return null;
  }
}

function dedupeLower(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const key = String(a).toLowerCase().trim();
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
