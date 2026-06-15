/**
 * SD-completion deliverable canary — live-end-state verification, beyond the PR/handoff proxy.
 *
 * SD-LEO-INFRA-STRENGTHEN-COMPLETION-DELIVERABLE-001.
 *
 * The existing completion gate (enforce_progress_on_completion trigger) and the PCVP verifier
 * (lib/eva/post-completion-verifier.js) only prove the WORKFLOW ran: progress=100%, an EXEC-phase
 * handoff exists, a PR_MERGE shipping_decision exists, stories marked completed. None verify that the
 * SD's DECLARED deliverables actually EXIST and FUNCTION at main — so a PR can merge while the
 * deliverable is absent or hollow and still pass. This module adds that live-end-state probe.
 *
 * DESIGN (mirrors lib/breakage/active-canary-probes.cjs): a PURE, unit-testable core
 * (deriveDeclaredDeliverables / classifyExistence / classifyFunctionalAdequacy / aggregateCanary) +
 * a thin IO layer (probeDeliverable / runDeliverableCanary). Every classifier is CONSERVATIVE: any
 * uncertain/unassessable case returns inconclusive (pass:true) — it NEVER false-fails. Only a
 * DECLARED-and-(absent|empty|hollow) deliverable returns pass:false. Default consumption is ADVISORY
 * (record + route); blocking is opt-in (LEO_DELIVERABLE_CANARY_ENFORCE=block) since this runs on every
 * completion.
 *
 * @module lib/eva/deliverable-canary
 */

import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';

// A deliverable smaller than this many bytes at main is treated as empty/hollow (not merely "small").
export const TRIVIAL_BYTES = 8;
// A code deliverable with fewer than this many substantive (non-blank, non-comment-only) lines is hollow.
export const MIN_SUBSTANTIVE_LINES = 3;

// Repo top-level dirs that anchor a real deliverable path (used to extract paths from free-text scope).
const PATH_ANCHOR = '(?:lib|scripts|src|tests?|database|supabase|config|docs|app|api|components|pages|public|\\.github)';
// A repo-relative path token ending in a known source/artifact extension.
const PATH_RE = new RegExp(
  `\\b(${PATH_ANCHOR}/[A-Za-z0-9_.\\-/]+\\.(?:js|mjs|cjs|ts|tsx|jsx|sql|json|ya?ml|md|sh|py|cs|html|css))\\b`,
  'g'
);

// A key_changes entry that REFERENCES an existing/other path (rather than DECLARING a new/changed
// deliverable of THIS SD) must NOT contribute a deliverable-to-verify — else a referenced path that
// doesn't exist in this repo would false-fail. (adversarial review: no-false-fail on the completion gate)
const REFERENCE_PHRASING = /\b(reuse|reuses|reused|see|refer|reference[ds]?|modeled after|based on|unchanged|no changes?|existing|deprecat|removed?|delete[ds]?)\b/i;

// Only CODE files get the functional-adequacy (hollow) probe; config/docs/data/migrations are
// existence-only (a 1-line JSON config or a short re-export is legitimately "small", not "hollow").
const CODE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx)$/i;

/** True when a deliverable ref is a code file eligible for the functional-adequacy probe. */
export function isCodeFile(ref) {
  return CODE_EXT.test(String(ref || ''));
}

/** Classify a repo path into a deliverable kind. */
export function kindForPath(p) {
  const s = String(p).replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)(database|supabase)\/migrations\//.test(s)) return 'migration';
  if (/(^|\/)tests?\//.test(s) || /\.(test|spec)\.[a-z]+$/.test(s)) return 'test';
  return 'file';
}

/** Pull repo-relative paths out of a free-text blob (scope / a key_changes entry). */
function extractPaths(text) {
  if (!text || typeof text !== 'string') return [];
  // Strip URLs first so a path embedded in a citation URL (e.g. github.com/.../lib/x.js) is NOT
  // extracted as a deliverable of this repo (no-false-fail).
  const cleaned = text.replace(/https?:\/\/\S+/gi, ' ');
  const out = [];
  let m;
  PATH_RE.lastIndex = 0;
  while ((m = PATH_RE.exec(cleaned)) !== null) out.push(m[1].replace(/\\/g, '/'));
  return out;
}

/**
 * PURE — derive an SD's DECLARED deliverables into a typed, deduped manifest.
 *
 * Sources, in declared-confidence order:
 *  - scope / key_changes free-text repo paths (declared_from='scope' | 'key_changes')  [what the SD PROMISED]
 *  - git-derived changed files from lib/gap-detection/analyzers/deliverable-analyzer.js (declared_from='git')
 *
 * No I/O. An empty manifest is the caller's INCONCLUSIVE signal (never a fail).
 *
 * @param {object} sd - { scope?, key_changes? (string|string[]) }
 * @param {Array<{file:string, category?:string}>} [changedFiles=[]] - from deliverable-analyzer
 * @returns {Array<{ref:string, kind:'file'|'migration'|'test'|'db_object', declared_from:string}>}
 */
export function deriveDeclaredDeliverables(sd, changedFiles = []) {
  const seen = new Map(); // ref -> entry (first declared_from wins; scope/key_changes outrank git)
  const add = (ref, declared_from) => {
    const norm = String(ref).replace(/\\/g, '/').trim();
    if (!norm || seen.has(norm)) return;
    seen.set(norm, { ref: norm, kind: kindForPath(norm), declared_from });
  };

  const sdObj = sd && typeof sd === 'object' ? sd : {};
  // key_changes may be an array of descriptive strings (each may embed a path) or a string.
  const kc = sdObj.key_changes;
  const kcEntries = Array.isArray(kc) ? kc : (typeof kc === 'string' ? [kc] : []);
  for (const entry of kcEntries) {
    // Skip entries that REFERENCE an existing/other path (reuse/see/removed/etc.) — they are not
    // deliverables THIS SD must produce, so their paths must not be verified-for-existence.
    if (typeof entry === 'string' && REFERENCE_PHRASING.test(entry)) continue;
    for (const p of extractPaths(entry)) add(p, 'key_changes');
  }

  // scope may be a string (markdown table / prose) — extract any embedded paths (URL-stripped).
  if (typeof sdObj.scope === 'string') for (const p of extractPaths(sdObj.scope)) add(p, 'scope');

  // git-derived changed files (corroborating signal). Exclude files the SD DELETED or the old-name
  // of a RENAME — they are correctly absent at main and must NOT false-fail the existence probe.
  // Only added/modified files are "exists now" deliverables.
  for (const f of Array.isArray(changedFiles) ? changedFiles : []) {
    if (f && f.file && f.change_type !== 'deleted' && f.change_type !== 'renamed') add(f.file, 'git');
  }

  return [...seen.values()];
}

/**
 * PURE — classify a deliverable's EXISTENCE from a probe observation.
 * Conservative: a probe that could not run (error / null) is INCONCLUSIVE and passes (fail-open).
 *
 * @param {{ref:string, kind:string}} deliverable
 * @param {{exists:boolean|null, bytes?:number|null, error?:string|null}} fsProbe
 * @returns {{check:'existence', ref:string, status:'present'|'missing'|'empty'|'inconclusive', pass:boolean, detail:string}}
 */
export function classifyExistence(deliverable, fsProbe) {
  const ref = deliverable?.ref ?? '<unknown>';
  const r = fsProbe || {};
  if (r.error || r.exists === null || r.exists === undefined) {
    return { check: 'existence', ref, status: 'inconclusive', pass: true, detail: r.error ? `probe error: ${r.error}` : 'existence unassessable' };
  }
  if (r.exists === false) {
    return { check: 'existence', ref, status: 'missing', pass: false, detail: 'declared deliverable absent at main' };
  }
  const bytes = Number.isFinite(r.bytes) ? r.bytes : null;
  if (bytes !== null && bytes <= TRIVIAL_BYTES) {
    return { check: 'existence', ref, status: 'empty', pass: false, detail: `present but empty (${bytes} bytes <= ${TRIVIAL_BYTES})` };
  }
  return { check: 'existence', ref, status: 'present', pass: true, detail: bytes !== null ? `present (${bytes} bytes)` : 'present' };
}

/**
 * PURE — classify FUNCTIONAL ADEQUACY (non-hollow) from content signals.
 * Conservative + LENIENT: flags HOLLOW (empty stub / comment-only / named symbol absent), NOT merely small.
 * Any unassessable signal => inconclusive (pass:true). Only applied to present 'file'/'test' deliverables.
 *
 * @param {{ref:string, kind:string}} deliverable
 * @param {{substantiveLines:number|null, declaredSymbol?:string|null, symbolPresent?:boolean|null}} signals
 * @returns {{check:'functional_adequacy', ref:string, status:'adequate'|'hollow'|'inconclusive', pass:boolean, detail:string}}
 */
export function classifyFunctionalAdequacy(deliverable, signals) {
  const ref = deliverable?.ref ?? '<unknown>';
  const s = signals || {};
  // A named-but-absent declared symbol is a concrete hollowness signal.
  if (s.declaredSymbol && s.symbolPresent === false) {
    return { check: 'functional_adequacy', ref, status: 'hollow', pass: false, detail: `declared symbol "${s.declaredSymbol}" not found in deliverable` };
  }
  const lines = Number.isFinite(s.substantiveLines) ? s.substantiveLines : null;
  if (lines === null) {
    return { check: 'functional_adequacy', ref, status: 'inconclusive', pass: true, detail: 'adequacy unassessable' };
  }
  if (lines < MIN_SUBSTANTIVE_LINES) {
    return { check: 'functional_adequacy', ref, status: 'hollow', pass: false, detail: `only ${lines} substantive line(s) (< ${MIN_SUBSTANTIVE_LINES}) — stub/comment-only` };
  }
  return { check: 'functional_adequacy', ref, status: 'adequate', pass: true, detail: `${lines} substantive line(s)` };
}

/**
 * PURE — aggregate per-deliverable verdicts into a single canary verdict.
 *  - empty manifest OR every verdict inconclusive  => 'inconclusive' (advisory; NEVER blocks)
 *  - any concrete fail (missing/empty/hollow)       => 'fail'
 *  - otherwise                                      => 'pass'
 *
 * @param {Array<{ref:string, verdicts:Array<{pass:boolean, status:string}>}>} perDeliverable
 * @returns {{verdict:'pass'|'fail'|'inconclusive', failed:Array, total:number, summary:string}}
 */
export function aggregateCanary(perDeliverable) {
  const list = Array.isArray(perDeliverable) ? perDeliverable : [];
  if (list.length === 0) {
    return { verdict: 'inconclusive', failed: [], total: 0, summary: 'no derivable declared deliverables — inconclusive (advisory only)' };
  }
  const failed = [];
  let anyConcrete = false; // at least one verdict that is a definite pass or fail (not inconclusive)
  for (const d of list) {
    const verdicts = Array.isArray(d.verdicts) ? d.verdicts : [];
    const hardFail = verdicts.find((v) => v && v.pass === false);
    const definite = verdicts.some((v) => v && v.status && v.status !== 'inconclusive');
    if (definite) anyConcrete = true;
    if (hardFail) failed.push({ ref: d.ref, status: hardFail.status, detail: hardFail.detail });
  }
  if (failed.length > 0) {
    return { verdict: 'fail', failed, total: list.length, summary: `${failed.length}/${list.length} declared deliverable(s) missing/empty/hollow at main` };
  }
  if (!anyConcrete) {
    return { verdict: 'inconclusive', failed: [], total: list.length, summary: `${list.length} deliverable(s) but none concretely assessable — inconclusive (advisory only)` };
  }
  return { verdict: 'pass', failed: [], total: list.length, summary: `${list.length} declared deliverable(s) present + adequate at main` };
}

// ── Thin IO layer (not part of the pure activation-tested core) ───────────────

/** Count substantive (non-blank, non- pure-comment) lines — a lenient hollowness signal. */
function countSubstantiveLines(content) {
  let n = 0;
  for (const raw of String(content).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line === '*/' || line.startsWith('//') || line.startsWith('*') || line.startsWith('--') || line.startsWith('#') || line.startsWith('/*')) continue;
    n++;
  }
  return n;
}

/**
 * Thin IO — probe a single deliverable at the working tree (main). Returns the fsProbe + signals the
 * pure classifiers consume. NEVER throws — any error becomes an inconclusive observation (fail-open).
 *
 * @param {{ref:string, kind:string}} deliverable
 * @param {{repoRoot?:string, declaredSymbol?:string|null}} [opts]
 */
export function probeDeliverable(deliverable, opts = {}) {
  const repoRoot = opts.repoRoot || process.cwd();
  const abs = path.isAbsolute(deliverable.ref) ? deliverable.ref : path.join(repoRoot, deliverable.ref);
  try {
    if (!existsSync(abs)) return { fsProbe: { exists: false, bytes: null, error: null }, signals: { substantiveLines: null } };
    const bytes = statSync(abs).size;
    let signals = { substantiveLines: null };
    if ((deliverable.kind === 'file' || deliverable.kind === 'test') && isCodeFile(deliverable.ref)) {
      try {
        const content = readFileSync(abs, 'utf8');
        const declaredSymbol = opts.declaredSymbol || null;
        signals = {
          substantiveLines: countSubstantiveLines(content),
          declaredSymbol,
          symbolPresent: declaredSymbol ? content.includes(declaredSymbol) : null,
        };
      } catch (e) {
        signals = { substantiveLines: null, error: e?.message };
      }
    }
    return { fsProbe: { exists: true, bytes, error: null }, signals };
  } catch (e) {
    return { fsProbe: { exists: null, bytes: null, error: e?.message || String(e) }, signals: { substantiveLines: null } };
  }
}

/**
 * Thin IO — run the full canary for an SD. Derives declared deliverables (injectable
 * analyzeDeliverables for the git signal), probes each, classifies, and aggregates. NEVER throws;
 * a derivation/probe failure degrades to inconclusive (advisory). Pure logic lives in the exported
 * classifiers above — this only orchestrates IO.
 *
 * @param {object} sd - { sd_key, scope?, key_changes? }
 * @param {{ analyzeDeliverables?: Function, repoRoot?: string }} [opts]
 * @returns {Promise<{verdict:string, failed:Array, total:number, summary:string, deliverables:Array}>}
 */
export async function runDeliverableCanary(sd, opts = {}) {
  let changedFiles = [];
  try {
    if (typeof opts.analyzeDeliverables === 'function' && sd?.sd_key) {
      const res = await opts.analyzeDeliverables(sd.sd_key);
      changedFiles = (res && Array.isArray(res.deliverables)) ? res.deliverables : [];
    }
  } catch { changedFiles = []; }

  const manifest = deriveDeclaredDeliverables(sd, changedFiles);
  const perDeliverable = manifest.map((d) => {
    const { fsProbe, signals } = probeDeliverable(d, { repoRoot: opts.repoRoot });
    const verdicts = [classifyExistence(d, fsProbe)];
    // Functional adequacy ONLY when the file is present AND is a CODE file (.js/.ts/etc). Config,
    // docs, data, migrations are existence-only — a 1-line JSON/short re-export is legitimately small,
    // not hollow (adversarial review: avoid false-failing small-but-real non-code deliverables).
    if (verdicts[0].pass && verdicts[0].status === 'present' && (d.kind === 'file' || d.kind === 'test') && isCodeFile(d.ref)) {
      verdicts.push(classifyFunctionalAdequacy(d, signals));
    }
    return { ref: d.ref, kind: d.kind, declared_from: d.declared_from, verdicts };
  });

  const agg = aggregateCanary(perDeliverable);
  return { ...agg, deliverables: perDeliverable };
}

/** Whether confirmed canary failures should HARD-BLOCK (opt-in). Default OFF (advisory). */
export function canaryEnforceEnabled() {
  return String(process.env.LEO_DELIVERABLE_CANARY_ENFORCE || '').toLowerCase() === 'block';
}

export default {
  deriveDeclaredDeliverables,
  classifyExistence,
  classifyFunctionalAdequacy,
  aggregateCanary,
  probeDeliverable,
  runDeliverableCanary,
  canaryEnforceEnabled,
  kindForPath,
  TRIVIAL_BYTES,
  MIN_SUBSTANTIVE_LINES,
};
