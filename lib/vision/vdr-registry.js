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
    // FIX (review): a stood-up 19-agent org produces sustained traffic; a single stray/seed message
    // must not credit 'built'. min=20 ⇒ built (org operating); 1..19 ⇒ partial (beginning); 0 ⇒ unbuilt. Revisable.
    probe: { type: 'db_count', table: 'agent_messages', min: 20, builtWhen: 'gte' } },
  { capability: 'Compound venture-level learning', layer: 'process',
    // FIX (review): a compounding venture-learning engine has multiple occurrences; one row ⇒ partial.
    // min=10 ⇒ built (engine firing); 1..9 ⇒ partial; 0 ⇒ unbuilt. Revisable.
    probe: { type: 'db_count', table: 'pattern_occurrences', min: 10, builtWhen: 'gte' } },
  { capability: 'Solo-operator survivability', layer: 'infrastructure',
    probe: { type: 'kr_status', code: 'KR-2026-07-02' } }, // ≥90% breakage caught before customers
  { capability: 'Calibrate the gates', layer: 'process',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'lib', pattern: 'calibration[_-]?cohort|gate.*BLOCK.*calibrat', builtWhen: 'present' } },
  { capability: 'The cockpit', layer: 'application',
    probe: { type: 'code_grep', repo: 'ehg', path: 'src', pattern: 'CANONICAL_SURFACES|six[_-]?surfaces|SURFACE_REGISTRY', builtWhen: 'present' } },
  { capability: 'Turn the fleet dial with data', layer: 'infrastructure',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'scripts', pattern: 'token_count|tokens_used|effort_level', builtWhen: 'present' } },
  { capability: 'A queryable, structured north star', layer: 'application',
    // SD-EHG-FOUNDATION-NORTHSTAR-CONTRACT-BUILD-001 (FR-3 coherence fix): repointed OFF the
    // shared KR-2026-07-05 (which belongs to ord 2 'See distance-to-quit' and was being
    // double-counted here, AND semantically measured the north star with a distance-to-quit KR).
    // Now probes the canonical north_star record directly: 'built' only when a chairman_ratified
    // record exists (a real, queryable, structured north star). Read via lib/vision/north-star.js.
    probe: { type: 'row_predicate', table: 'north_star', filter: { status: 'chairman_ratified' }, builtWhen: 'exists' } },
  // SD-LEO-INFRA-V1-AUTOMATION-PROBES-001 — automation/intelligence cluster (ordinals 17-20).
  // All code_grep ⇒ a match bands 'partial' (machinery/intent present, NOT a realized rate); absent ⇒
  // 'unknown' (excluded). Deliberately NOT row_predicate→'built' for Automation-by-default: a leo_settings
  // auto_proceed policy flag is NOT the ≥90% realized transition rate the criterion demands (0/4295 carry it).
  { capability: 'Automation-by-default', layer: 'process',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'scripts/hooks', pattern: 'auto_proceed|AUTO-PROCEED|autoProceed', builtWhen: 'present' } },
  { capability: 'Active intelligence per stage', layer: 'process',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'lib/eva/stage-templates/analysis-steps/index.js', pattern: 'getAnalysisStep|analyzeStage', builtWhen: 'present' } },
  { capability: 'Cross-stage data contracts', layer: 'process',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'lib/eva/contracts/stage-contracts.js', pattern: 'STAGE_CONTRACTS|validateCrossStageContract', builtWhen: 'present' } },
  { capability: 'CLI authoritative', layer: 'process',
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'scripts/modules/handoff/cli/cli-main.js', pattern: 'handleWorkflowCommand|handleVerifyCommand', builtWhen: 'present' } },
  // SD-LEO-INFRA-V1-CAPLAYER-PROBES-001 (FR-2): the 2 chairman-ratified capability-layer
  // capabilities that literally name V1 ("capability-saturated"): the Capability Registry and
  // Expertise on-demand. Labels are BYTE-IDENTICAL to the vision_ladder_criteria rows (ordinals
  // 21-22) — the coherence invariant withholds the whole gauge if they drift.
  // MEASUREMENT STRENGTH (FR-4, anti-honesty-lie doctrine): the band is a registry-POPULATION
  // proxy. min is non-trivial (>1, and below the live count) so a single seed row never credits
  // 'built' and the threshold is not gamed to today's value. A populated count proves the registry
  // EXISTS and is governed/versioned — it does NOT independently prove the EVA-router/admission-filter
  // (registry) or live combinatorial panel-composition (expertise); those are deeper realizations
  // tracked elsewhere. Revisable.
  { capability: 'Capability Registry', layer: 'infrastructure',
    probe: { type: 'db_count', table: 'sd_capabilities', min: 50, builtWhen: 'gte' } }, // >=50 governed capabilities ⇒ substantially-populated registry (live 214); 1..49 partial; 0 unbuilt
  { capability: 'Expertise on-demand', layer: 'infrastructure',
    probe: { type: 'db_count', table: 'specialist_registry', min: 10, builtWhen: 'gte' } }, // >=10 registered specialists ⇒ enough for combinatorial composition (live 30); 1..9 partial; 0 unbuilt
  // ── SD-LEO-INFRA-V1-GOV-PROBES-001: 5 V1 GOVERNANCE-cluster capabilities (ordinals 12-16) ──
  // Governance is the chairman-weighted dimension the gauge previously omitted (incl. the
  // highest-weighted 'Govern-by-exception'). PROBE-SOURCE DOCTRINE (anti-honesty-lie): map each
  // capability to the SEMANTICALLY-CORRECT live KR and report its HONEST band (built/partial/unbuilt
  // as the KR actually stands) — NOT merely whichever governance KR happens to be 'achieved'. Reading
  // 'built' off a semantically-wrong-but-achieved KR (e.g. the cascade capability off 'vision event
  // handlers') would inflate a half-built capability, which is exactly what this gauge exists to
  // prevent. Where no KR measures the capability, code_grep bands 'partial' (intent, capped by
  // codeGrepProbe — never 'built') or 'unknown' (no seam, excluded — never false-0). These labels are
  // BYTE-IDENTICAL to the vision_ladder_criteria rows at ordinals 12-16 (assertRegistryCoherence).
  { capability: 'Govern-by-exception', layer: 'process',
    // No KR measures this capability → code_grep the live doctrine-of-constraint trigger fn.
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'database/migrations', pattern: 'enforce_doctrine_of_constraint', builtWhen: 'present' } },
  { capability: 'Decision Filter Engine', layer: 'process',
    // HONEST BAND = partial. SD-LEO-INFRA-DFE-CHAIRMAN-FORWARD-GATE-001 WIRED the engine as an
    // ADVISORY forward filter (it now actually runs over each chairman decision and records a verdict
    // to audit_log — see recordForwardGateScore) — genuine progress over the prior "defined but never
    // invoked" state. But the live vision_ladder_criteria ord-13 REQUIRED state is "a live
    // decision-filter engine GATING chairman decisions", and CONST-002 forbids this gate from
    // gating/blocking/overriding (advisory-only; a harden-to-blocking mode is a separate chairman-gated
    // SD). Advisory wiring is NOT gating, so banding 'built' would be a LIE-HIGH inflating the
    // chairman's governance gauge. We keep code_grep (presence ⇒ partial) — the honest band — until a
    // future enforce-mode SD makes the engine actually gate, which a coverage/enforce probe can then
    // promote to 'built'. (The audit_log forward-gate coverage exists as advisory telemetry/foundation.)
    probe: { type: 'code_grep', repo: 'EHG_Engineer', path: 'lib/eva', pattern: 'evaluateDecision', builtWhen: 'present' } },
  { capability: 'Governance cascade enforced', layer: 'process',
    // KR-GOV-3.1 = "Governance cascade layers operational: 6 of 6" — THE cascade KR. Live 2/6 at_risk → partial.
    // (NOT KR-GOV-2.3 'vision event handlers' just because it is achieved — that would inflate a half-built capability.)
    probe: { type: 'kr_status', code: 'KR-GOV-3.1' } },
  { capability: 'OKR-driven prioritization + day-28 hard stop', layer: 'process',
    // KR-GOV-3.3 = "Monthly OKR automation operational" owns the day-28 hard-stop (desc: "hard-stop SD creation (day 28)").
    // Live 0/3 at_risk → unbuilt. (NOT KR-GOV-2.2, which covers only the prioritization half — reading it 'built' inflates.)
    probe: { type: 'kr_status', code: 'KR-GOV-3.3' } },
  { capability: 'All 7 governance guardrails', layer: 'process',
    probe: { type: 'kr_status', code: 'KR-GOV-3.2' } }, // KR-GOV-3.2 "Governance guardrails enforced: 7 of 7" achieved 7/7 → built
  // ── SD-LEO-INFRA-V1-CONSOLIDATION-PROBES-001: 3 V1 CONSOLIDATION-cluster capabilities (ordinals
  // 23-25). Labels are BYTE-IDENTICAL to the vision_ladder_criteria rows (the coherence invariant
  // withholds the whole gauge if they drift). DB-signal probes only (no cross-repo grep). Honest
  // banding: a stray/seed row never credits 'built'.
  { capability: 'Backlog distilled and dispositioned', layer: 'process',
    // count_ratio: dispositioned (completion_status=COMPLETED) / total backlog items. Live ~13/145 ≈ 9%
    // → partial (matches reality: distillation begun, not complete). conversion_ledger is the future
    // 'integrated' feeder (empty today); add it to numerFilter when populated. builtAt 0.7 = mostly-dispositioned.
    probe: { type: 'count_ratio', table: 'sd_backlog_map', numerFilter: { completion_status: 'COMPLETED' }, builtAt: 0.7 } },
  { capability: 'Application presentation-surface consolidation', layer: 'application',
    // count_ratio = routes mapped to a canonical feature_area / total routes. (Review finding: a raw
    // gte-count is BACKWARDS for "consolidation" — more routes != more consolidated. A presence count
    // would lie-high.) This measures canonical ORGANIZATION (orphan-free): builtAt 1.0 ⇒ built ONLY at
    // 100% mapped; any orphan/unmapped route drops it to partial. Live 8/8 mapped → built. DB-signal only.
    // NOTE: measures orphan-free canonical organization, NOT surface-count REDUCTION — chairman-refinable.
    probe: { type: 'count_ratio', table: 'ehg_page_routes', numerFilter: { feature_area_id: { not: null } }, builtAt: 1.0 } },
  { capability: 'Competitive vigilance process established', layer: 'process',
    // db_count of OBSERVED competitor baselines only. (Review finding: the 4 live competitive_baselines
    // rows are ALL STATUS_QUO / epistemic_tag='ASSUMPTION' placeholder seeds, stale 2+ weeks — NOT a
    // running vigilance process, so a raw count>=1 would lie-high.) Filtering to epistemic_tag='OBSERVED'
    // ⇒ live count 0 → unbuilt (honest: process not yet established); >=1 real observed baseline ⇒ built.
    probe: { type: 'db_count', table: 'competitive_baselines', filter: { epistemic_tag: 'OBSERVED' }, min: 1, builtWhen: 'gte' } },
];

/**
 * SD-LEO-INFRA-GAUGE-BUILDABLE-VS-OPERATIONAL-001 (FR-1) — buildable vs operational taxonomy.
 *
 * Each capability has a deterministic `nature`:
 *   'buildable'   — the FLEET can complete it by shipping code / populating a fleet table
 *                   (every code_grep probe + the fleet-infra db_count/count_ratio probes).
 *   'operational' — it only flips when a live VENTURE / OPERATION / CHAIRMAN / COMPETITIVE signal
 *                   makes it true (a KR that depends on live income / a running venture / live
 *                   governance enforcement; a chairman-ratified flag; an OBSERVED competitor
 *                   baseline). The fleet cannot make these true by shipping code alone.
 *
 * Why segregate: 'EHG % built' must stop conflating fleet BUILD-DEBT (a buildable capability the
 * fleet simply hasn't shipped yet) with future-staged VENTURE OPERATION (an operational proof that
 * is correctly 0 until a venture runs). The all-criteria overall_pct stays UNCHANGED and honest
 * (anti-honesty-lie doctrine — unknowns still excluded, operational still HONESTLY shown, never
 * hidden); computeBuildGauge additionally exposes a build_pct over buildable capabilities only and
 * an operational_pct over the operational set, so neither number can be gamed.
 *
 * The classification is STATIC code reviewed at PLAN — this Set is the single reviewable artifact.
 * OPERATIONAL = the 10 KR/chairman/venture/competitive-signal capabilities; everything else buildable.
 */
export const OPERATIONAL_NATURE = new Set([
  'Take a real dollar',                          // KR-2026-07-04 — a live venture must accept real payment
  'See distance-to-quit',                        // KR-2026-07-05 — needs the live income signal
  'Run a self-operating venture',                // db_count agent_messages — needs a running venture
  'Compound venture-level learning',             // db_count pattern_occurrences — needs live ventures producing learning
  'Solo-operator survivability',                 // KR-2026-07-02 — live breakage-caught rate
  'A queryable, structured north star',          // row_predicate chairman_ratified — chairman-timed
  'Governance cascade enforced',                 // KR-GOV-3.1 — live governance cascade operation
  'OKR-driven prioritization + day-28 hard stop',// KR-GOV-3.3 — live hard-stop enforcement
  'All 7 governance guardrails',                 // KR-GOV-3.2 — live guardrail enforcement
  'Competitive vigilance process established',   // db_count OBSERVED — a running vigilance process must observe
]);

// Attach the deterministic nature to each registry entry (FR-1: on every one of the 25 entries).
for (const e of VDR_REGISTRY) {
  e.nature = OPERATIONAL_NATURE.has(e.capability) ? 'operational' : 'buildable';
}

// FAIL LOUD: every OPERATIONAL_NATURE member must name a real registry capability (catch a typo /
// a renamed capability before it silently mis-segregates the gauge).
{
  const caps = new Set(VDR_REGISTRY.map((e) => e.capability));
  const orphan = [...OPERATIONAL_NATURE].filter((c) => !caps.has(c));
  if (orphan.length) {
    throw new Error(`VDR taxonomy drift: OPERATIONAL_NATURE names unknown capabilities: ${orphan.join(', ')}`);
  }
}

/**
 * SD-LEO-INFRA-VISION-LADDER-V1-001 (FR-4) — DB vision source.
 * Read the ACTIVE vision rung's criteria from the re-anchorable ladder pointer (vision_ladder_rungs
 * is_active=true → vision_ladder_criteria) and yield the SAME { capability, today, required } rows
 * parseCapabilityGap() produces — so the probe set, the unknowns-excluded denominator, and the
 * coherence invariant are all UNCHANGED. This removes the dependency on a missing EHG-VISION.md file.
 *
 * FAIL-SOFT CONTRACT (HONEST GAUGE — could-not-measure != zero):
 *   - any read error / missing table / no active rung / zero criteria  → throws, so computeBuildGauge
 *     degrades to available:false (NEVER a false 0%).
 *   The caller (computeBuildGauge) wraps this in try/catch and emits an unavailable gauge.
 * @param {object} io - { supabase } injected client
 * @returns {Promise<Array<{capability:string, today:string, required:string}>>}
 */
export async function dbVisionSource(io = {}) {
  const supabase = io && io.supabase;
  if (!supabase) throw new Error('dbVisionSource: no supabase client');
  const { data: rung, error: rungErr } = await supabase
    .from('vision_ladder_rungs')
    .select('id, rung_key, vision_key')
    .eq('is_active', true)
    .maybeSingle();
  if (rungErr) throw new Error(`dbVisionSource: active-rung query error: ${rungErr.message}`);
  if (!rung) throw new Error('dbVisionSource: no active vision rung');
  const { data: crit, error: critErr } = await supabase
    .from('vision_ladder_criteria')
    .select('capability, today, required, ordinal')
    .eq('rung_id', rung.id)
    .order('ordinal', { ascending: true });
  if (critErr) throw new Error(`dbVisionSource: criteria query error: ${critErr.message}`);
  if (!crit || crit.length === 0) throw new Error(`dbVisionSource: active rung ${rung.rung_key} has no criteria`);
  return crit.map((c) => ({
    capability: String(c.capability || '').trim(),
    today: c.today == null ? '' : String(c.today),
    required: c.required == null ? '' : String(c.required),
  }));
}

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
 * @param {string} [opts.visionMarkdown] - EHG-VISION.md content; if absent, fall through to visionSource/visionPath
 * @param {Function|boolean} [opts.visionSource] - async (io) => [{capability,today,required}] DB denominator source
 *        (SD-LEO-INFRA-VISION-LADDER-V1-001 FR-4). `true` ⇒ use the built-in dbVisionSource(io). When set, it takes
 *        precedence over the markdown file; on ANY error the gauge stays fail-soft (available:false), never a false 0%.
 * @param {string} [opts.visionPath]     - path to EHG-VISION.md (fallback when no visionMarkdown/visionSource)
 * @returns {Promise<{ overall_pct, per_layer, components, denominator, unknown_count, coherence, measured_at_note }>}
 */
export async function computeBuildGauge({ io = {}, visionMarkdown, visionSource, visionPath } = {}) {
  let rows;
  let sourceNote = '';
  if (visionMarkdown != null) {
    // Explicit markdown wins (used by unit tests and any caller that already has the doc text).
    rows = parseCapabilityGap(visionMarkdown);
  } else if (visionSource) {
    // FR-4 DB source path: read the active-vision V1 criteria from the ladder pointer. Fail-soft —
    // any read failure (missing table / no active rung / zero criteria) degrades to an unavailable
    // gauge (HONEST: could-not-measure != 0%), never a thrown error and never a false 0%.
    const srcFn = typeof visionSource === 'function' ? visionSource : dbVisionSource;
    try {
      rows = await srcFn(io);
    } catch (e) {
      return {
        overall_pct: null, per_layer: {}, components: [], denominator: 0, total_capabilities: 0,
        unknown_count: 0, available: false,
        coherence: { ok: false, missingProbes: [], staleProbes: [] },
        measured_at_note: `vision DB source unavailable (${e && e.message ? e.message : e}) — gauge withheld (not 0%)`,
      };
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        overall_pct: null, per_layer: {}, components: [], denominator: 0, total_capabilities: 0,
        unknown_count: 0, available: false,
        coherence: { ok: false, missingProbes: [], staleProbes: [] },
        measured_at_note: 'vision DB source returned no criteria — gauge withheld (not 0%)',
      };
    }
    sourceNote = ' (DB vision source)';
  } else {
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
        measured_at_note: `vision doc unavailable at ${p} (untracked? commit docs/strategy/EHG-VISION.md or seed the vision ladder pointer to enable the gauge in CI/checkouts)`,
      };
    }
    rows = parseCapabilityGap(fs.readFileSync(p, 'utf-8'));
  }
  const coherence = assertRegistryCoherence(rows);

  // FIX (review): coherence is NOT advisory. If the vision's REQUIRED-capability list and the probe
  // registry have drifted (a capability added/removed/renamed), the % would silently measure only
  // the still-mapped subset over a wrong denominator. Per the anti-honesty-lie doctrine, FAIL the
  // gauge to available:false on drift rather than emit a number computed over a drifted denominator.
  if (!coherence.ok) {
    return {
      overall_pct: null, per_layer: {}, components: [], denominator: 0,
      total_capabilities: rows.length, unknown_count: 0, available: false, coherence,
      measured_at_note: `registry↔vision drift — gauge withheld (missingProbes=[${coherence.missingProbes.join(', ')}], staleProbes=[${coherence.staleProbes.join(', ')}]); update VDR_REGISTRY to match EHG-VISION.md`,
    };
  }

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
      nature: entry.nature, // FR-1: 'buildable' | 'operational'
      status: result.status,
      detail: result.detail,
      value: result.value,
      score: STATUS_SCORE[result.status],
    });
  }

  // Overall: built-equivalents / probeable (status !== 'unknown'). Honest — unknowns excluded.
  const scored = components.filter((c) => c.score !== null);
  // FIX (review): 0 probeable capabilities (e.g. DB unreachable + no grep seam) means "could not
  // measure anything", NOT "0% built". Return null/available:false so consumers render
  // 'gauge unavailable' rather than a confident, false 0%.
  if (scored.length === 0) {
    return {
      overall_pct: null, per_layer: {}, components, denominator: 0,
      total_capabilities: rows.length, unknown_count: components.length, available: false, coherence,
      measured_at_note: 'no probeable capabilities (all unknown) — gauge unmeasurable this run',
    };
  }
  const overall_pct = Math.round((100 * scored.reduce((s, c) => s + c.score, 0)) / scored.length);

  const per_layer = {};
  for (const layer of LAYERS) {
    const inLayer = scored.filter((c) => c.layer === layer);
    per_layer[layer] = inLayer.length === 0 ? null : Math.round((100 * inLayer.reduce((s, c) => s + c.score, 0)) / inLayer.length);
  }

  // SD-LEO-INFRA-GAUGE-BUILDABLE-VS-OPERATIONAL-001 (FR-2): segregated build vs operational %.
  // overall_pct (above) is UNCHANGED — still all-criteria, the honest anti-honesty-lie rung %.
  // build_pct = fleet's real build progress over buildable capabilities only (unknowns still
  // excluded); operational_pct = the operational set's honest band (shown separately, never folded
  // into build_pct and never silently counted as 0% built). Both null when their set has 0 probeable.
  const pctOf = (subset) => (subset.length === 0 ? null : Math.round((100 * subset.reduce((s, c) => s + c.score, 0)) / subset.length));
  const buildableScored = scored.filter((c) => c.nature === 'buildable');
  const operationalScored = scored.filter((c) => c.nature === 'operational');
  const build_pct = pctOf(buildableScored);
  const operational_pct = pctOf(operationalScored);
  const operationalComponents = components.filter((c) => c.nature === 'operational');
  const operational_status = {
    pct: operational_pct,
    total: operationalComponents.length,
    probed: operationalScored.length,
    unknown: operationalComponents.length - operationalScored.length,
    built: operationalScored.filter((c) => c.score === 1).length,
    awaiting: operationalScored.filter((c) => c.score < 1).length, // not-yet-flipped operational proofs
  };

  return {
    overall_pct,
    build_pct,
    operational_pct,
    operational_status,
    build_denominator: buildableScored.length,
    per_layer,
    components,
    denominator: scored.length,
    total_capabilities: rows.length,
    unknown_count: components.length - scored.length,
    available: true,
    coherence,
    measured_at_note: `deterministic; no LLM; unknowns excluded from denominator${sourceNote}`,
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
    return { pct: null, build_pct: null, operational_pct: null, layerLine: '', buildLine: '', rungLine: '', operationalLine: '', available: false, note: `(gauge unavailable ${em} ${gauge && gauge.measured_at_note ? gauge.measured_at_note : 'vision doc not found'})` };
  }
  const layerLine = Object.entries(gauge.per_layer || {})
    .filter(([, pct]) => pct != null)
    .map(([layer, pct]) => `${layerLabel[layer] || layer} ${pct}%`)
    .join('  ·  ');
  const note = `(live VDR gauge ${em} ${gauge.denominator}/${gauge.total_capabilities} capabilities probed${gauge.unknown_count ? `, ${gauge.unknown_count} unknown` : ''})`;

  // SD-LEO-INFRA-GAUGE-BUILDABLE-VS-OPERATIONAL-001 (FR-3): present BOTH numbers truthfully.
  // LEAD with the fleet-build % (what 'built' honestly means to the chairman — buildable capabilities
  // only), show the all-criteria V1 rung-completion separately, and label the operational rungs as
  // 'awaiting venture operation (V2 precursor)' rather than silently dragging the build % to 0.
  const bp = typeof gauge.build_pct === 'number' ? gauge.build_pct : null;
  const os = gauge.operational_status || {};
  const buildLine = bp != null ? `EHG fleet-build: ${bp}% built ${em} ${gauge.build_denominator || 0} buildable capabilities` : '';
  // Only contrast the all-criteria rung-% when there is a DISTINCT fleet-build line to contrast it
  // against; otherwise the caller leads with the overall_pct itself and a rung line would duplicate it.
  const rungLine = bp != null ? `V1 rung-completion: ${gauge.overall_pct}% ${em} all ${gauge.denominator}/${gauge.total_capabilities} criteria (build-debt + operational)` : '';
  const operationalLine = os.total
    ? `Operational proofs: ${os.built}/${os.probed} flipped ${em} ${os.awaiting} awaiting venture operation (V2 precursor)${os.unknown ? `, ${os.unknown} unmeasured` : ''}`
    : '';

  return { pct: gauge.overall_pct, build_pct: bp, operational_pct: gauge.operational_pct ?? null, layerLine, buildLine, rungLine, operationalLine, note, available: true };
}

