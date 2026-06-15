/**
 * SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-1) — Vision Denominator Registry (VDR).
 *
 * The DENOMINATOR is parsed deterministically from EHG-VISION.md's chairman-accepted
 * "## CAPABILITY GAP — at-a-glance table" (one row per REQUIRED vision capability). The
 * NUMERATOR is computed by running one TYPED probe per capability against LIVE signals
 * (no LLM in steady state). The build-% is overall = built-equivalents / probeable-capabilities,
 * with a per-layer breakdown (infra / application / venture / process). Capabilities whose probe
 * returns 'unknown' are EXCLUDED from the denominator and reported, so the % is never fabricated
 * and the component list is fully inspectable/auditable (anti-honesty-lie doctrine).
 *
 * CANON COUPLING: VDR_REGISTRY is keyed to the EXACT capability labels in the vision table.
 * assertRegistryCoherence() FAILS LOUD if the parsed table and the registry drift apart — so a
 * vision edit cannot silently desync the gauge (the denominator and its probes stay in lockstep).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runProbe } from './vdr-probes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const LAYERS = ['infrastructure', 'application', 'venture', 'process'];
export const STATUS_SCORE = { built: 1, partial: 0.5, unbuilt: 0, unknown: null };

/**
 * Parse the "## CAPABILITY GAP — at-a-glance table" markdown table into the denominator rows.
 * Returns [{ capability, today, required }] in document order. Deterministic; no LLM.
 * @param {string} markdown - full EHG-VISION.md content
 */
export function parseCapabilityGap(markdown) {
  const md = String(markdown || '');
  const hdrIdx = md.indexOf('## CAPABILITY GAP');
  if (hdrIdx === -1) return [];
  // Bound the section at the next top-level heading.
  const rest = md.slice(hdrIdx);
  const nextHdr = rest.indexOf('\n## ', 3);
  const section = nextHdr === -1 ? rest : rest.slice(0, nextHdr);
  const rows = [];
  for (const line of section.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim()); // strip leading/trailing pipe
    if (cells.length < 3) continue;
    // Skip the header row and the |---|---| separator.
    if (/^-+$/.test(cells[0].replace(/[:\s]/g, '')) || /vision capability/i.test(cells[0])) continue;
    // Capability label is the bold text in column 1.
    const m = cells[0].match(/\*\*(.+?)\*\*/);
    const capability = (m ? m[1] : cells[0]).trim();
    if (!capability) continue;
    rows.push({ capability, today: cells[1], required: cells[2] });
  }
  return rows;
}

/**
 * VDR_REGISTRY — one entry per vision capability: { capability (must match the table label),
 * layer, probe }. Each probe targets a LIVE signal the vision itself cites (KRs, table counts,
 * code presence). 'capability' must equal the bold label parsed from the table.
 */
export const VDR_REGISTRY = [
  { capability: 'Take a real dollar', layer: 'venture',
    probe: { type: 'kr_status', code: 'KR-2026-07-04' } }, // ≥1 venture can accept real payment
  { capability: 'See distance-to-quit', layer: 'application',
    probe: { type: 'kr_status', code: 'KR-2026-07-05' } }, // the income gauge rendered
  { capability: 'See distance-to-broke', layer: 'application',
    probe: { type: 'code_grep', repo: 'ehg', path: 'src', pattern: 'distance[-_ ]?to[-_ ]?broke', builtWhen: 'present' } },
  { capability: 'Venture-performance read', layer: 'application',
    probe: { type: 'code_grep', repo: 'ehg', path: 'src/components/chairman-v3', pattern: 'PerformanceGauge|performance-gauge|valueAdd|competitiveness', builtWhen: 'present' } },
  { capability: 'Run a self-operating venture', layer: 'venture',
    probe: { type: 'db_count', table: 'agent_messages', min: 1, builtWhen: 'gte' } }, // org alive = messages flowing
  { capability: 'Compound venture-level learning', layer: 'process',
    probe: { type: 'db_count', table: 'pattern_occurrences', min: 1, builtWhen: 'gte' } }, // venture-level engine firing
  { capability: 'Solo-operator survivability', layer: 'infrastructure',
    probe: { type: 'kr_status', code: 'KR-2026-07-02' } }, // ≥90% breakage caught before customers
  { capability: 'Calibrate the gates', layer: 'process',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'lib', pattern: 'calibration[_-]?cohort|gate.*BLOCK.*calibrat', builtWhen: 'present' } },
  { capability: 'The cockpit', layer: 'application',
    probe: { type: 'code_grep', repo: 'ehg', path: 'src', pattern: 'CANONICAL_SURFACES|six[_-]?surfaces|SURFACE_REGISTRY', builtWhen: 'present' } },
  { capability: 'Turn the fleet dial with data', layer: 'infrastructure',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'scripts', pattern: 'token_count|tokens_used|effort_level', builtWhen: 'present' } },
  { capability: 'A queryable, structured north star', layer: 'application',
    probe: { type: 'row_predicate', table: 'key_results', filter: { code: 'KR-2026-07-05' }, builtWhen: 'exists' } },
];

/**
 * FAIL LOUD if the parsed vision table and VDR_REGISTRY have drifted (capability added/removed/renamed).
 * This is the consumer-side invariant for the denominator: the gauge's probe set must stay in lockstep
 * with the vision's REQUIRED capability list, or the % silently measures the wrong thing.
 * @returns {{ ok: boolean, missingProbes: string[], staleProbes: string[] }}
 */
export function assertRegistryCoherence(parsedRows) {
  const parsed = new Set((parsedRows || []).map((r) => r.capability));
  const registered = new Set(VDR_REGISTRY.map((e) => e.capability));
  const missingProbes = [...parsed].filter((c) => !registered.has(c)); // in vision, no probe
  const staleProbes = [...registered].filter((c) => !parsed.has(c));   // probe for a removed capability
  return { ok: missingProbes.length === 0 && staleProbes.length === 0, missingProbes, staleProbes };
}

/**
 * Compute the vision BUILD-completeness gauge. Pure-ish: all IO is injected.
 * @param {object} opts
 * @param {object} opts.io        - { supabase, grep } injected probe IO
 * @param {string} [opts.visionMarkdown] - EHG-VISION.md content; if absent, read from visionPath
 * @param {string} [opts.visionPath]     - path to EHG-VISION.md (default: repo docs/strategy)
 * @returns {Promise<{ overall_pct, per_layer, components, denominator, unknown_count, coherence, measured_at_note }>}
 */
export async function computeBuildGauge({ io = {}, visionMarkdown, visionPath } = {}) {
  let md = visionMarkdown;
  if (md == null) {
    const p = visionPath || path.resolve(__dirname, '..', '..', 'docs', 'strategy', 'EHG-VISION.md');
    // Fail-soft: EHG-VISION.md is the denominator source. If it is unavailable (e.g. a git
    // checkout/CI where the doc is not committed — it is currently an UNTRACKED working-tree file),
    // return an explicit unavailable gauge rather than throwing, so the exec-summary/tile degrade
    // to "gauge unavailable" instead of crashing. Callers should surface unavailable distinctly.
    if (!fs.existsSync(p)) {
      return {
        overall_pct: null, per_layer: {}, components: [], denominator: 0, total_capabilities: 0,
        unknown_count: 0, available: false,
        coherence: { ok: false, missingProbes: [], staleProbes: [] },
        measured_at_note: `vision doc unavailable at ${p} (untracked? commit docs/strategy/EHG-VISION.md to enable the gauge in CI/checkouts)`,
      };
    }
    md = fs.readFileSync(p, 'utf-8');
  }
  const rows = parseCapabilityGap(md);
  const coherence = assertRegistryCoherence(rows);

  const byCap = new Map(VDR_REGISTRY.map((e) => [e.capability, e]));
  const components = [];
  for (const row of rows) {
    const entry = byCap.get(row.capability);
    if (!entry) {
      components.push({ capability: row.capability, layer: 'unmapped', status: 'unknown', detail: 'no probe registered', score: null });
      continue;
    }
    const result = await runProbe(entry.probe, io);
    components.push({
      capability: row.capability,
      layer: entry.layer,
      status: result.status,
      detail: result.detail,
      value: result.value,
      score: STATUS_SCORE[result.status],
    });
  }

  // Overall: built-equivalents / probeable (status !== 'unknown'). Honest — unknowns excluded.
  const scored = components.filter((c) => c.score !== null);
  const overall_pct = scored.length === 0 ? 0 : Math.round((100 * scored.reduce((s, c) => s + c.score, 0)) / scored.length);

  const per_layer = {};
  for (const layer of LAYERS) {
    const inLayer = scored.filter((c) => c.layer === layer);
    per_layer[layer] = inLayer.length === 0 ? null : Math.round((100 * inLayer.reduce((s, c) => s + c.score, 0)) / inLayer.length);
  }

  return {
    overall_pct,
    per_layer,
    components,
    denominator: scored.length,
    total_capabilities: rows.length,
    unknown_count: components.length - scored.length,
    available: true,
    coherence,
    measured_at_note: 'deterministic; no LLM; unknowns excluded from denominator',
  };
}

/**
 * SD-LEO-INFRA-AUTOMATED-ONE-ROADMAP-001 (FR-4/FR-5): SINGLE-SOURCE display mapping of a gauge
 * result → { pct, layerLine, note, available }, so the Adam exec-summary (FR-4) and the
 * Chairman-UI tile (FR-5) render the SAME number the SAME way (no divergent formatting). Pure.
 * @param {object} gauge - a computeBuildGauge() result
 * @param {object} [opts] - { layerLabel: { <layer>: <display label> }, em: <dash> }
 * @returns {{ pct: number|null, layerLine: string, note: string, available: boolean }}
 */
export function formatGaugeForSummary(gauge, opts = {}) {
  const em = opts.em || '—';
  const layerLabel = opts.layerLabel || { infrastructure: 'infrastructure', application: 'UI/UX', venture: 'venture/income', process: 'process' };
  if (!gauge || !gauge.available || typeof gauge.overall_pct !== 'number') {
    return { pct: null, layerLine: '', available: false, note: `(gauge unavailable ${em} ${gauge && gauge.measured_at_note ? gauge.measured_at_note : 'vision doc not found'})` };
  }
  const layerLine = Object.entries(gauge.per_layer || {})
    .filter(([, pct]) => pct != null)
    .map(([layer, pct]) => `${layerLabel[layer] || layer} ${pct}%`)
    .join('  ·  ');
  const note = `(live VDR gauge ${em} ${gauge.denominator}/${gauge.total_capabilities} capabilities probed${gauge.unknown_count ? `, ${gauge.unknown_count} unknown` : ''})`;
  return { pct: gauge.overall_pct, layerLine, note, available: true };
}

