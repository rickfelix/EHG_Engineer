// Structural acceptance LOCKS for the deviation-record-writer reference — pure
// predicates over the JS source, node-builtins-only. Textual locks are NECESSARY
// BUT WEAK (the -C lesson); the behavioral suite (parameterized over
// GOLDEN_REF_MODULE) CALLS recordDeviation/reconcile against a real sink and is
// the primary enforcement — ESPECIALLY the WRONG-REFERENT and thin-reason checks
// (the -D self-mask class) that no grep can prove.
export const DEFAULT_MODULE = 'golden-references/deviation-record-writer/deviation-writer.mjs';

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** Code body of a named exported function, comments stripped. */
function fnBody(src, name) {
  const start = src.search(new RegExp('export function ' + name + '\\b'));
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const jsdoc = rest.search(/\n\/\*\*/);
  const nextExport = rest.search(/\nexport /);
  const cut = [jsdoc, nextExport].filter((i) => i !== -1).sort((a, b) => a - b)[0];
  return stripComments('e' + (cut === undefined ? rest : rest.slice(0, cut)));
}

export function buildLocks() {
  return {
    reference_only_header: (s) => /REFERENCE ONLY/.test(s),

    // D1: the record is BOUND to artifactRef at the write site — recordDeviation
    // builds a record literal carrying artifactRef and appends it to the sink.
    write_at_divergence_referent_bound: (s) => {
      const b = fnBody(s, 'recordDeviation');
      if (!b) return false;
      const recordLit = b.match(/record\s*=\s*\{([\s\S]*?)\};/);
      return !!recordLit && /artifactRef/.test(recordLit[1]) && /sink\.append\s*\(/.test(b);
    },

    // D2/D3: the required trio is VALIDATED — artifactRef presence, weight-in-
    // allowlist, non-empty why — each guarded by a throw (a malformed / narrative-
    // only record is rejected, not stored). >= 3 throws, one per guard.
    structured_required_trio: (s) => {
      const b = fnBody(s, 'recordDeviation');
      if (!b) return false;
      const throwsEnough = (b.match(/throw new Error/g) || []).length >= 3;
      const guardsArtifact = /!artifactRef|typeof artifactRef/.test(b);
      const guardsWeight = /WEIGHTS\.includes\(\s*weight\s*\)/.test(b);
      const guardsWhy = /!why|String\(why\)\.trim\(\)/.test(b);
      return throwsEnough && guardsArtifact && guardsWeight && guardsWhy;
    },

    // D3: the closed taxonomy is the estate-EXACT set (frozen), and weight is
    // validated against it (not an open string). Order-independent.
    closed_weight_allowlist: (s) => {
      const decl = s.match(/WEIGHTS\s*=\s*Object\.freeze\(\[([^\]]*)\]\)/);
      if (!decl) return false;
      const vals = decl[1].split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean).sort();
      const expected = ['critical', 'declared-descope', 'minor', 'moderate'];
      return JSON.stringify(vals) === JSON.stringify(expected) && /WEIGHTS\.includes\(/.test(s);
    },

    // D3: legality of COVERAGE requires a SENSIBLE reason — distilling the estate's
    // classifyDeviationReason sense-making pass (length floor AND a causal marker),
    // NOT mere length and NOT weight membership; reconcile must USE qualifies() for
    // coverage. A length-only gate greens token-stuffing, so the causal check is
    // load-bearing.
    qualifying_reason_gate: (s) => {
      const q = fnBody(s, 'qualifies');
      if (!q) return false;
      const lengthFloor = /length\s*<\s*QUALIFYING_REASON_MIN_LENGTH/.test(q);
      const causalSenseMaking = /CAUSAL_MARKERS\.test/.test(q); // not just length — the anti-token-stuffing gate
      const wordFloor = /SENSIBLE_MIN_WORDS/.test(q);           // word-count element locked too
      const r = fnBody(s, 'reconcile');
      return lengthFloor && causalSenseMaking && wordFloor && !!r && /qualifies\s*\(/.test(r);
    },

    // D4: reconcile is a REFERENT-BOUND set difference — coverage requires
    // d.artifactRef === the expected item (not mere existence), delivered items
    // are subtracted, and it returns the undocumented gap set.
    reconcile_referent_set_difference: (s) => {
      const r = fnBody(s, 'reconcile');
      if (!r) return false;
      const referentMatch = /\.artifactRef\s*===\s*e\b/.test(r);
      const subtractsDelivered = /deliveredSet\.has\(\s*e\s*\)/.test(r);
      const returnsUndocumented = /undocumented/.test(r);
      return referentMatch && subtractsDelivered && returnsUndocumented;
    },

    // The sink is an INJECTED parameter (recordDeviation's first arg; reconcile
    // takes the deviations array) — never a MODULE-LEVEL singleton ledger. The
    // module-scope check anchors at column 0 so makeSink's local `records` is fine.
    injected_sink: (s) => {
      const takesSink = /export function recordDeviation\(sink,/.test(s);
      const reconcileTakesArray = /export function reconcile\(expected,\s*delivered,\s*deviations\)/.test(s);
      const b = fnBody(s, 'recordDeviation');
      const usesInjected = !!b && /sink\.append\s*\(/.test(b);
      const moduleSingleton = /^(const|let|var)\s+records\s*=/m.test(s); // column-0 = module scope
      return takesSink && reconcileTakesArray && usesInjected && !moduleSingleton;
    },

    // Isolation law: node: builtins ONLY, across static import, export-from, and
    // dynamic import(); no bare require calls either. (Vacuously true for a
    // zero-import module — this reference imports nothing.)
    builtins_only_import: (s) => {
      const spec = [
        ...[...s.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]),
        ...[...s.matchAll(/^\s*export\s+[^'"]*?\sfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]),
        ...[...s.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
      ];
      const hasRequire = /\brequire\s*\(/.test(s);
      return !hasRequire && spec.every((i) => i.startsWith('node:'));
    },
  };
}

/** Evaluate every lock over a module's source; returns { ok, failed: [] }. */
export function judgeSource(src) {
  const locks = buildLocks();
  const failed = Object.entries(locks).filter(([, check]) => !check(src)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}
