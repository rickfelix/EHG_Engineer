/**
 * Build-context design instruction block.
 * SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001 (FR-3, TR-3) built the mechanical verbatim wrap;
 * SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001 authors the generation-form content on top.
 *
 * TWO layers, one no-drift contract:
 *  - shared-design-prompts.json (Prompts 2/3/4) stays the AUDIT single source, byte-identical
 *    (it is cross-repo vendored with a twinned checksum gate — never edited here).
 *  - design-generation-inputs.json carries the AUTHORED build-form: imperative craft do-rules
 *    (each with an `anchor` quoted verbatim from its prompt's audit text — enforced by the
 *    anchor-provenance unit test, so semantic drift between audit-form and generation-form
 *    is a red test, not a silent divergence), the UX Peak conversion do-rules + the
 *    no-fabrication guardrail, the motion grammar, and the MarketLens style exemplar.
 *
 * Render order (build to the rules, then verify against the rubric):
 *   CRAFT DO-RULES -> CONVERSION + GUARDRAIL -> MOTION -> VERIFICATION CHECKLIST -> EXEMPLAR.
 *
 * @module lib/eva/bridge/design-input-instructions
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/** Authored generation inputs (SD-LEO-FEAT-AUTHOR-VENTURE-DESIGN-001). */
const GENERATION_INPUTS = require('./design-generation-inputs.json');

const BUILD_PROMPT_IDS = [2, 3, 4];

/** @returns {string} heading for a prompt entry (label + summary when present) */
function promptHeading(p) {
  return p.summary ? `${p.label || `Prompt ${p.id}`} — ${p.summary}` : (p.label || `Prompt ${p.id}`);
}

/** Render the imperative craft do-rules for the applicable audit prompts. */
function renderCraftSection(applicable, inputs) {
  const craft = inputs?.craft_do_rules || {};
  const sections = applicable
    .map((p) => {
      const rules = Array.isArray(craft[String(p.id)]) ? craft[String(p.id)] : [];
      if (!rules.length) return '';
      const lines = rules.map((r, i) => `${i + 1}. ${r.rule}`);
      return `${promptHeading(p)} — build to these:\n${lines.join('\n')}`;
    })
    .filter(Boolean);
  if (!sections.length) return '';
  return [
    'DESIGN DO-RULES (imperative build-form of the design-audit rubric — apply while building, not after):',
    ...sections,
  ].join('\n\n');
}

/** Render the conversion-psychology do-rules plus the hard no-fabrication guardrail. */
function renderConversionSection(inputs) {
  const conv = inputs?.conversion;
  if (!conv || !Array.isArray(conv.do_rules) || !conv.do_rules.length) return '';
  const lines = conv.do_rules.map((r, i) => `${i + 1}. ${r.principle}: ${r.rule}`);
  const parts = [`${(conv.label || 'Conversion psychology').toUpperCase()} — apply where the page asks for a decision:`, lines.join('\n')];
  if (conv.guardrail) parts.push(conv.guardrail);
  return parts.join('\n\n');
}

/** Render the motion grammar do-rules. */
function renderMotionSection(inputs) {
  const motion = inputs?.motion;
  if (!motion || !Array.isArray(motion.do_rules) || !motion.do_rules.length) return '';
  const lines = motion.do_rules.map((r, i) => `${i + 1}. ${r.rule}`);
  return [`${(motion.label || 'Motion grammar').toUpperCase()}:`, lines.join('\n')].join('\n');
}

/**
 * Render the anti-default distinctiveness do-rules + the correctness-precedence paragraph.
 * SD-LEO-FEAT-CLOSE-DISTINCTIVENESS-GAP-001 (FR-2/FR-3): the chairman-named gap — craft
 * rules teach correctness, conversion rules teach persuasion; THIS section teaches the
 * page to not look machine-made. Precedence is explicit: correctness floors and the
 * no-fabrication guardrail outrank distinctiveness.
 */
function renderDistinctivenessSection(inputs) {
  const d = inputs?.distinctiveness;
  if (!d || !Array.isArray(d.do_rules) || !d.do_rules.length) return '';
  const lines = d.do_rules.map((r, i) => `${i + 1}. ${r.rule}`);
  const parts = [`${(d.label || 'Distinctiveness (anti-default)').toUpperCase()} — make the page unmistakably DESIGNED, not defaulted:`, lines.join('\n')];
  if (d.precedence) parts.push(d.precedence);
  return parts.join('\n\n');
}

/** Render the layered-hero-image do-rules (FR-4, chairman always-want signature). */
function renderHeroImageSection(inputs) {
  const h = inputs?.hero_image;
  if (!h || !Array.isArray(h.do_rules) || !h.do_rules.length) return '';
  const lines = h.do_rules.map((r, i) => `${i + 1}. ${r.rule}`);
  return [`${(h.label || 'Layered AI hero image').toUpperCase()}:`, lines.join('\n')].join('\n');
}

/**
 * Render the per-venture award-library influence (FR-1) — the sampler's blended, PARTIAL
 * token influence. Dynamic (per-venture, seeded), so it arrives via the third parameter
 * rather than the static inputs JSON. Fail-soft: null/absent influence renders nothing.
 */
function renderAwardInfluenceSection(awardInfluence) {
  const dims = awardInfluence?.dimensions;
  if (!dims || !Object.keys(dims).length) return '';
  const lines = Object.entries(dims).map(
    ([dim, v]) => `- ${dim} (from ${v.source_site}, ${v.source_archetype}): ${v.influence}`
  );
  return [
    'AWARD-WINNING DESIGN INFLUENCE (a MINORITY influence sampled per-dimension from award-winning sites — blend these attitudes with the brand genome and subject; NEVER copy any single reference wholesale):',
    lines.join('\n'),
    `(seed ${awardInfluence.seed}${awardInfluence.archetype ? `, archetype bias: ${awardInfluence.archetype}` : ''} — reproducible for this venture, divergent across ventures)`,
  ].join('\n');
}

/** Render the style exemplar (few-shot character, with provenance). */
function renderExemplarSection(inputs) {
  const ex = inputs?.exemplar;
  if (!ex || !Array.isArray(ex.character) || !ex.character.length) return '';
  const lines = ex.character.map((c) => `- ${c}`);
  const header = `STYLE EXEMPLAR (${ex.provenance || 'no provenance'}) — ${ex.note || 'emulate the character, not the content'}:`;
  return [header, lines.join('\n')].join('\n');
}

/**
 * Render the verify-before-finishing checklist — the MECHANICAL, VERBATIM wrap of the audit
 * text (unchanged from SD-LEO-FEAT-ROUTE-VENTURE-DESIGN-001; the audit JSON stays the single
 * source of the audit-form so it cannot drift).
 */
function renderVerifyChecklist(applicable) {
  const sections = applicable.map((p) => `Before finishing, verify your output against ${promptHeading(p)}:\n${p.text}`);
  return [
    'DESIGN VERIFICATION CHECKLIST (derived verbatim from the design-audit rubric -- satisfy every item before finishing):',
    ...sections,
  ].join('\n\n---\n\n');
}

/**
 * @param {Array<{id:number,label?:string,summary?:string,text:string}>} prompts - shared-design-prompts.json content
 * @param {object} [inputs] - generation inputs override (tests only); defaults to design-generation-inputs.json
 * @param {object|null} [dynamic] - per-venture dynamic context: { awardInfluence } from
 *   design-reference-sampler.js (SD-LEO-FEAT-CLOSE-DISTINCTIVENESS-GAP-001 FR-1). Optional and
 *   fail-soft — existing single/double-arg callers are unchanged.
 * @returns {string} imperative build-context instruction block; '' when no applicable audit prompts
 */
export function buildDesignInstructionBlock(prompts, inputs = GENERATION_INPUTS, dynamic = null) {
  const list = Array.isArray(prompts) ? prompts : [];
  const applicable = list.filter((p) => BUILD_PROMPT_IDS.includes(p?.id));
  if (!applicable.length) return '';

  const sections = [
    renderCraftSection(applicable, inputs),
    renderConversionSection(inputs),
    renderDistinctivenessSection(inputs),
    renderMotionSection(inputs),
    renderHeroImageSection(inputs),
    renderAwardInfluenceSection(dynamic?.awardInfluence),
    renderVerifyChecklist(applicable),
    renderExemplarSection(inputs),
  ].filter(Boolean);

  return sections.join('\n\n---\n\n');
}

export { BUILD_PROMPT_IDS, GENERATION_INPUTS };
