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
    // I/O by design): no clock, randomness, network, DB, or async inside the
    // decision.
    predicate_purity: (s) => {
      const body = predicateBody(s);
      if (!body) return false;
      return !/(Date\.now|new Date|Math\.random|await |fetch\(|\.rpc\(|supabase|setTimeout|setInterval)/.test(body);
    },
    // Doctrine 2: explicit presence validation with named-missing BLOCK.
    fail_closed_on_missing: (s) => /missing inputs:/.test(s) && /REQUIRED_INPUTS/.test(s),
    // Doctrine 3: separated emission — emitter exists, takes the verdict, and
    // the predicate body never references a sink.
    evidence_separation: (s) => /export function emitEvidence\(verdict, sink\)/.test(s)
      && !/sink/.test(predicateBody(s) || 'sink'),
    // Doctrine 4: exactly ONE evaluate* export (single authoritative predicate).
    single_predicate_source: (s) => (s.match(/export (async )?function evaluate/g) || []).length === 1,
    // Doctrine 5: totality — the CATCH block itself must return a BLOCK
    // verdict (scoped to the catch, so an allowed:false elsewhere in the body
    // cannot mask a catch that returns pass).
    exception_total: (s) => {
      const c = catchBody(s);
      return !!c && /evaluation error/.test(c) && /allowed:\s*false/.test(c) && !/allowed:\s*true/.test(c);
    },
    // Verdict contract cited (normalization of the eva triad, not a 15th shape).
    verdict_shape_cited: (s) => /decision-filter/.test(s) && /allowed: boolean, reason: string, evidence: array/i.test(s.replace(/\{|\}/g, '')),
  };
}

/** Evaluate every lock over a module's source; returns { ok, failed: [] }. */
export function judgeSource(src) {
  const locks = buildLocks();
  const failed = Object.entries(locks).filter(([, check]) => !check(src)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}
