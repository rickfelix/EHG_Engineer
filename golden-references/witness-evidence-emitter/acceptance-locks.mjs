// Structural acceptance LOCKS for the witness-evidence-emitter reference —
// pure predicates over the JS source, node-builtins-only. Textual locks are
// NECESSARY BUT WEAK (the -C lesson); the behavioral suite (parameterized over
// GOLDEN_REF_MODULE) CALLS emit/verify against a real store and is the primary
// enforcement — especially for the self-test-masking checks.
export const DEFAULT_MODULE = 'golden-references/witness-evidence-emitter/witness-emitter.mjs';

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** Body of a named exported function, comments stripped. */
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
    // D1: the emit writes happen inside ONE transaction callback — not two
    // separate awaited writes. Require a single opts.transaction(...) call and
    // NO `await ...write`/two-store-write pattern outside it.
    atomic_single_boundary: (s) => {
      const b = fnBody(s, 'emitWitness');
      if (!b) return false;
      const txnCalls = (b.match(/\.transaction\s*\(/g) || []).length;
      // exactly one transaction boundary; no awaited writes (the forbidden race)
      return txnCalls === 1 && !/await\s+\w+\.(write|set|insert)/.test(b);
    },
    // D2: observed_result is assigned from the action RETURN (a call), never
    // from a parameter/opts field.
    never_predeclare: (s) => {
      const b = fnBody(s, 'emitWitness');
      if (!b) return false;
      return /observed_result\s*=\s*action\s*\(/.test(b)
        && !/observed_result\s*=\s*opts\./.test(b);
    },
    // D3 + D5: verifyWitness re-derives from the STORE and must NOT read
    // witness.observed_result (the tautology).
    verify_by_read: (s) => {
      const b = fnBody(s, 'verifyWitness');
      if (!b) return false;
      return /opts\.store\.(get|has)/.test(b) && !/witness\.observed_result/.test(b);
    },
    independent_rederivation: (s) => {
      const b = fnBody(s, 'verifyWitness');
      if (!b) return false;
      // verify compares a RE-HASH of store content to the witness hash, and
      // never trusts the witness's own observed_result.
      return /hashContent\s*\(\s*rederived/.test(b) && /evidence_hash/.test(b)
        && !/witness\.observed_result/.test(b);
    },
    // D4: content AND hash — evidence_hash computed via crypto AND the WITNESS
    // OBJECT itself carries both observed_result and evidence_hash (not a
    // boolean-only witness). Scoped to the emit body so a stray createHash in a
    // dead helper cannot satisfy it.
    tamper_evident: (s) => {
      const b = fnBody(s, 'emitWitness');
      if (!b) return false;
      const hashComputed = /createHash\(['"]sha256/.test(s) && /evidence_hash\s*=\s*hashContent/.test(b);
      const witnessLit = b.match(/const witness\s*=\s*\{([^}]*)\}/);
      const carries = witnessLit && /observed_result/.test(witnessLit[1]) && /evidence_hash/.test(witnessLit[1]);
      return hashComputed && !!carries;
    },
    // verified starts null (emitter never self-asserts).
    verified_null_at_emit: (s) => {
      const b = fnBody(s, 'emitWitness');
      return !!b && /verified:\s*null/.test(b) && !/verified:\s*true/.test(b);
    },
    // Store/sink is an INJECTED parameter, never a module singleton.
    injected_store: (s) => /emitWitness\(action,\s*opts\)/.test(s)
      && /verifyWitness\(witness,\s*opts\)/.test(s)
      && !/^(const|let)\s+store\s*=/m.test(s),
    // Node-builtins-only import surface (isolation echo; the -A scan is the law).
    builtins_only_import: (s) => {
      const imports = [...s.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      return imports.every((i) => i.startsWith('node:'));
    },
  };
}

/** Evaluate every lock over a module's source; returns { ok, failed: [] }. */
export function judgeSource(src) {
  const locks = buildLocks();
  const failed = Object.entries(locks).filter(([, check]) => !check(src)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}
