/**
 * Cascade-layer health recomputer (SD-LEO-INFRA-CASCADE-KR-RECOMPUTE-GOV31-001)
 *
 * KR-GOV-3.1 ("Governance cascade layers operational: 6 of 6") was frozen at a dead 2026-02
 * bootstrap current_value=2/6 (last_updated_by=null) — no recompute job existed, so the number
 * never reflected reality. This module derives the value HONESTLY from a per-layer operational
 * predicate and writes it via the canonical key_results update.
 *
 * Per-layer health predicate (ALL THREE conjuncts must be POSITIVELY true for a layer to pass):
 *   1. dataRows       — every backing table for the layer has >0 active rows
 *   2. cliResolves    — the layer's canonical management CLI script exists on disk
 *   3. validatorReads — cascade-validator.js reads/validates the layer (its marker is in the source)
 *
 * ANTI-INFLATION BY CONSTRUCTION: a layer passes ONLY on all-three-positive; any missing signal
 * (no rows / missing CLI / absent validator marker / a query error) FAILS the layer. So the
 * recomputer can only ever report FEWER-OR-EQUAL passing layers than reality — it can never inflate.
 * It writes 6 only when all 6 layers independently pass.
 *
 * PURE-CORE: checkLayerHealth/computeCascadeHealth/recomputeKrGov31 take injectable deps
 * (supabase, fileExists, validatorSource, currentYear, now) so the predicate + recomputer are
 * deterministically unit-testable without DB/fs/clock.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join as joinPath } from 'node:path';

export const KR_CODE = 'KR-GOV-3.1';
export const TARGET_LAYERS = 6;
export const RECOMPUTE_WRITER = 'CASCADE-RECOMPUTE';

// Repo root (lib/governance/<file> → up two). Used only by the default (non-injected) dep loaders.
const REPO_ROOT = joinPath(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VALIDATOR_REL = 'scripts/modules/governance/cascade-validator.js';

/**
 * The 6 governance-cascade layers, each with its backing table(s) + active filter, its canonical
 * management CLI (existence = the "CLI resolves" signal), and the marker proving cascade-validator.js
 * reads the layer. Multi-table layers (constitution, okr) require BOTH tables to have rows.
 * Verified against scripts/modules/governance/cascade-validator.js + scripts/eva/*-command.mjs.
 */
export const CASCADE_LAYERS = [
  {
    key: 'mission',
    tables: [{ table: 'missions', filter: (q) => q.eq('status', 'active') }],
    cli: 'scripts/eva/mission-command.mjs',
    validatorMarker: "layer: 'mission'",
  },
  {
    key: 'constitution',
    tables: [
      { table: 'aegis_constitutions', filter: (q) => q.eq('is_active', true) },
      { table: 'aegis_rules', filter: (q) => q.eq('is_active', true) },
    ],
    cli: 'scripts/eva/constitution-command.mjs',
    validatorMarker: "layer: 'constitution'",
  },
  {
    key: 'vision',
    tables: [{ table: 'eva_vision_documents', filter: (q) => q.eq('status', 'active') }],
    cli: 'scripts/eva/vision-command.mjs',
    validatorMarker: "layer: 'vision'",
  },
  {
    key: 'strategy',
    tables: [{ table: 'strategic_themes', filter: (q, year) => q.eq('status', 'active').eq('year', year) }],
    cli: 'scripts/eva/strategy-command.mjs',
    validatorMarker: "layer: 'strategy'",
  },
  {
    key: 'okr',
    tables: [
      { table: 'objectives', filter: (q) => q.eq('is_active', true) },
      { table: 'key_results', filter: (q) => q.eq('is_active', true) },
    ],
    cli: 'scripts/eva/okr-command.mjs',
    validatorMarker: "layer: 'okr'",
  },
  {
    key: 'sd',
    // The SD layer is the corpus itself; any row means the layer is populated. The validator reads
    // strategic_directives_v2 in validateCascadeAtHandoff (parent-SD cascade), so the table name is
    // the read marker.
    tables: [{ table: 'strategic_directives_v2', filter: null }],
    cli: 'scripts/leo-create-sd.js',
    validatorMarker: 'strategic_directives_v2',
  },
];

/** Count rows for a table with an optional active filter. Any error → {ok:false} (fails the layer). */
async function countRows(supabase, table, applyFilter, currentYear) {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (applyFilter) q = applyFilter(q, currentYear);
    const { count, error } = await q;
    if (error) return { ok: false, count: 0 };
    return { ok: true, count: count || 0 };
  } catch {
    return { ok: false, count: 0 };
  }
}

/**
 * Compute the 3-conjunct health predicate for one layer. ALL THREE must be positively true to pass.
 * @param {Object} layer - a CASCADE_LAYERS entry
 * @param {{supabase:Object, fileExists:Function, validatorSource:string, currentYear:number}} deps
 * @returns {Promise<{layer:string, dataRows:boolean, cliResolves:boolean, validatorReads:boolean, pass:boolean}>}
 */
export async function checkLayerHealth(layer, deps) {
  const { supabase, fileExists, validatorSource, currentYear } = deps;

  // (1) data rows: EVERY backing table must have >0 active rows (conservative AND).
  let dataRows = true;
  for (const t of layer.tables) {
    const r = await countRows(supabase, t.table, t.filter, currentYear);
    if (!r.ok || r.count <= 0) { dataRows = false; break; }
  }

  // (2) the layer's canonical CLI exists on disk.
  const cliResolves = typeof fileExists === 'function' ? !!fileExists(layer.cli) : false;

  // (3) cascade-validator reads the layer (its marker is present in the validator source).
  const validatorReads = typeof validatorSource === 'string' && validatorSource.includes(layer.validatorMarker);

  return { layer: layer.key, dataRows, cliResolves, validatorReads, pass: dataRows && cliResolves && validatorReads };
}

/** Default fileExists: resolve a repo-root-relative path on disk. */
function defaultFileExists(relPath) {
  return existsSync(joinPath(REPO_ROOT, relPath));
}

/** Default validator source loader (empty string on read failure → validatorReads false, conservative). */
function defaultValidatorSource() {
  try { return readFileSync(joinPath(REPO_ROOT, VALIDATOR_REL), 'utf8'); }
  catch { return ''; }
}

/**
 * Compute health for all 6 cascade layers. passingCount = number of layers passing all 3 conjuncts.
 * @param {{supabase:Object, fileExists?:Function, validatorSource?:string, currentYear?:number}} deps
 * @returns {Promise<{layers:Array, passingCount:number}>}
 */
export async function computeCascadeHealth(deps) {
  const resolved = {
    supabase: deps.supabase,
    fileExists: deps.fileExists || defaultFileExists,
    validatorSource: deps.validatorSource !== undefined ? deps.validatorSource : defaultValidatorSource(),
    currentYear: deps.currentYear,
  };
  const layers = [];
  for (const layer of CASCADE_LAYERS) layers.push(await checkLayerHealth(layer, resolved));
  return { layers, passingCount: layers.filter((l) => l.pass).length };
}

/**
 * Derive KR-GOV-3.1 current_value from honest per-layer health and (when apply) write it via the
 * canonical key_results update (mirrors lib/eva/kr-reality-checker.js attemptKRUpdate). Dry-run by
 * default (no write). Idempotent: a re-run writes the same derived value.
 *
 * @param {{supabase:Object, apply?:boolean, now?:string, fileExists?:Function, validatorSource?:string, currentYear?:number}} opts
 * @returns {Promise<{before:(number|null), passingCount:number, status:string, perLayer:Array, wrote:boolean}>}
 */
export async function recomputeKrGov31(opts) {
  const { supabase, apply = false } = opts;
  const currentYear = opts.currentYear !== undefined ? opts.currentYear : new Date().getFullYear();
  const now = opts.now || new Date().toISOString();

  const health = await computeCascadeHealth({ supabase, fileExists: opts.fileExists, validatorSource: opts.validatorSource, currentYear });
  const passingCount = health.passingCount;
  // ANTI-INFLATION: status 'achieved' requires the FULL target; anything less is 'at_risk'.
  const status = passingCount >= TARGET_LAYERS ? 'achieved' : 'at_risk';

  let before = null;
  try {
    const { data } = await supabase.from('key_results').select('current_value').eq('code', KR_CODE).maybeSingle();
    before = data ? data.current_value : null;
  } catch { before = null; }

  let wrote = false;
  if (apply) {
    const { error } = await supabase
      .from('key_results')
      .update({ current_value: passingCount, status, last_updated_by: RECOMPUTE_WRITER, updated_at: now })
      .eq('code', KR_CODE);
    if (error) throw new Error(`KR-GOV-3.1 write failed: ${error.message}`);
    wrote = true;
  }

  return { before, passingCount, status, perLayer: health.layers, wrote };
}

export default { CASCADE_LAYERS, checkLayerHealth, computeCascadeHealth, recomputeKrGov31, KR_CODE, TARGET_LAYERS };
