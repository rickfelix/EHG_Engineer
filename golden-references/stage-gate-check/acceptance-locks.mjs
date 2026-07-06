// Structural acceptance LOCKS for the stage-gate-check reference — pure
// predicates over the JS source, node-builtins-only. Textual locks are
// NECESSARY BUT WEAK for JS (aliasing/indirection evade regex); the
// behavioral suite (tests/unit/golden-references/stage-gate-acceptance.test.js)
// carries enforcement by CALLING the reference. Locks catch the obvious
// doctrine violations; behavior proves the contract.
export const DEFAULT_MODULE = 'golden-references/stage-gate-check/gate-check.mjs';

/** Strip block + line comments so a mention in prose never counts as code. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Extract the evaluateGate function CODE body (comments stripped), stopping at
 *  the JSDoc that precedes emitEvidence so the emitter's `sink` param mention
 *  never leaks into the predicate-scoped checks. */
function predicateBody(src) {
  const start = src.search(/export function evaluateGate/);
  if (start === -1) return null;
  // End at the JSDoc block that introduces the next export (or emitEvidence).
  const rest = src.slice(start + 1);
  const jsdoc = rest.search(/\n\/\*\*/);
  const nextExport = rest.search(/\nexport /);
  const cut = [jsdoc, nextExport].filter((i) => i !== -1).sort((a, b) => a - b)[0];
  const body = cut === undefined ? rest : rest.slice(0, cut);
  return stripComments('e' + body);
}

/** The catch block's return, comments stripped. */
function catchBody(src) {
  const body = predicateBody(src);
  if (!body) return null;
  const at = body.search(/catch\s*\(/);
  return at === -1 ? '' : body.slice(at);
}

export function buildLocks() {
  return {
    reference_only_header: (s) => /REFERENCE ONLY/.test(s),
    // Doctrine 1 (purity, scoped to the predicate body — the emitter may do
    // I/O by design): no clock, randomness, network, DB, ambient global, or
    // async inside the decision. NOTE: textual purity is NECESSARY-BUT-WEAK
    // (impurity can hide in a called helper or a module-scope const); the
    // determinism BEHAVIORAL test (double-call deep-equal, run against the
    // ADAPTED module too — see the parameterized runner) is the real proof.
    predicate_purity: (s) => {
      const body = predicateBody(s);
      if (!body) return false;
      return !/(Date\.now|new Date|Math\.random|await |fetch\(|\.rpc\(|supabase|setTimeout|setInterval|process\.env|globalThis|performance\.now|crypto\.random|Date\()/.test(body);
    },
    // Doctrine 2: explicit presence validation with named-missing BLOCK.
    fail_closed_on_missing: (s) => /missing inputs:/.test(s) && /REQUIRED_INPUTS/.test(s),
    // Doctrine 3: separated emission — emitter exists, takes the verdict, and
    // the predicate body never references a sink.
    evidence_separation: (s) => /export function emitEvidence\(verdict, sink\)/.test(s)
      && !/sink/.test(predicateBody(s) || 'sink'),
    // Doctrine 4: ONE authoritative decision predicate. Counts evaluate*
    // exports across ALL forms (function, const-arrow, re-export named) so a
    // second decider can't hide as an arrow or re-export (the schism the
    // doctrine forbids). Batch/compose wrappers (name ends Batch|All|Many) are
    // legal composition (they delegate to the primary — the estate's own
    // governance engine exports evaluate + evaluateBatch), so they don't count
    // as a second decision source.
    single_predicate_source: (s) => {
      const names = new Set();
      for (const m of s.matchAll(/export\s+(?:async\s+)?function\s+(evaluate\w*)/g)) names.add(m[1]);
      for (const m of s.matchAll(/export\s+const\s+(evaluate\w*)\s*=/g)) names.add(m[1]);
      for (const m of s.matchAll(/export\s*\{[^}]*?\bas\s+(evaluate\w*)/g)) names.add(m[1]);
      for (const m of s.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const raw of m[1].split(',')) {
          const nm = raw.trim().split(/\s+as\s+/).pop().trim();
          if (/^evaluate\w*$/.test(nm)) names.add(nm);
        }
      }
      const deciders = [...names].filter((n) => !/(Batch|All|Many)$/.test(n));
      return deciders.length === 1;
    },
    // Doctrine 5: totality — the CATCH block returns a BLOCK verdict (scoped
    // to the catch, so an allowed:false elsewhere can't mask a catch that
    // returns pass) AND flags internal_error so a code bug is distinguishable
    // from a policy block.
    exception_total: (s) => {
      const c = catchBody(s);
      return !!c && /evaluation error/.test(c) && /allowed:\s*false/.test(c)
        && !/allowed:\s*true/.test(c) && /internal_error:\s*true/.test(c);
    },
    // Verdict contract honestly framed: cites BOTH estate decision engines AND
    // discloses this is a deliberately-binary shape (the estate is non-binary
    // — escalate/present-to-chairman). Not a faithful-normalization overclaim.
    verdict_shape_cited: (s) => /decision-filter-engine/.test(s)
      && /(DELIBERATELY BINARY|deliberately binary)/.test(s)
      && /(ESCALATE|PRESENT_TO_CHAIRMAN|tri-state)/.test(s),
  };
}

/** Evaluate every lock over a module's source; returns { ok, failed: [] }. */
export function judgeSource(src) {
  const locks = buildLocks();
  const failed = Object.entries(locks).filter(([, check]) => !check(src)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}
