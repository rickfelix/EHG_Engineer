// Structural acceptance LOCKS for the witness-evidence-emitter reference —
// pure predicates over the JS source, node-builtins-only. Textual locks are
// NECESSARY BUT WEAK (the -C lesson); the behavioral suite (parameterized over
// GOLDEN_REF_MODULE) CALLS emit/verify against a real governed store and is the
// primary enforcement — ESPECIALLY the lying-action and crash-rollback checks
// that no grep can prove.
export const DEFAULT_MODULE = 'golden-references/witness-evidence-emitter/witness-emitter.mjs';

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
    // D1: the action runs INSIDE the transaction callback (its real effect and
    // the witness commit together), and there are NO writes outside it. Requires
    // exactly one transaction() and the action() call to appear inside its body.
    action_inside_transaction: (s) => {
      const b = fnBody(s, 'emitWitness');
      if (!b) return false;
      const txn = b.match(/opts\.transaction\(\([^)]*\)\s*=>\s*\{([\s\S]*?)\}\)/);
      if (!txn) return false;
      const inside = txn[1];
      // action invoked inside the boundary; no store writes outside the callback.
      const actionInside = /action\s*\(/.test(inside);
      const outside = b.replace(txn[0], '');
      const writesOutside = /store\.(set|put|save|insert|upsert|write)\s*\(/.test(outside);
      const oneBoundary = (b.match(/opts\.transaction\(/g) || []).length === 1;
      return actionInside && oneBoundary && !writesOutside;
    },
    // D2: the claim comes from calling the action, not a pre-supplied value.
    never_predeclare: (s) => {
      const b = fnBody(s, 'emitWitness');
      if (!b) return false;
      return /=\s*action\s*\(/.test(b) && !/claimed_result\s*=\s*opts\./.test(b);
    },
    // D3 + D5: verify re-derives from an INJECTED deriveTruth over the store and
    // must NOT read the witness's claim or the action's return (the tautology).
    independent_rederivation: (s) => {
      const b = fnBody(s, 'verifyWitness');
      if (!b) return false;
      return /opts\.deriveTruth\s*\(/.test(b)
        && !/witness\.claimed_result/.test(b)
        && !/witness\.observed_result/.test(b);
    },
    // verify re-hashes the RE-DERIVED truth (not the witness's own value) and
    // compares to the witness hash.
    verify_by_read: (s) => {
      const b = fnBody(s, 'verifyWitness');
      if (!b) return false;
      return /hashContent\s*\(\s*actual\s*\)/.test(b) && /evidence_hash/.test(b);
    },
    // D4: content AND canonical crypto hash — witness carries claimed_result AND
    // evidence_hash; the hash is CANONICAL (sorted keys) so a store re-read
    // re-hashes stably; not a boolean-only witness.
    tamper_evident_canonical: (s) => {
      const b = fnBody(s, 'emitWitness');
      if (!b) return false;
      const witnessLit = b.match(/witness\s*=\s*\{([\s\S]*?)\};/);
      const carries = witnessLit && /claimed_result/.test(witnessLit[1]) && /evidence_hash/.test(witnessLit[1]);
      const canonicalHash = /createHash\(['"]sha256/.test(s) && /Object\.keys\([^)]*\)\.sort\(\)/.test(s);
      return !!carries && canonicalHash;
    },
    // verified starts null (emitter never self-asserts).
    verified_null_at_emit: (s) => {
      const b = fnBody(s, 'emitWitness');
      return !!b && /verified:\s*null/.test(b) && !/verified:\s*true/.test(b);
    },
    // Store + deriveTruth are INJECTED parameters, never module singletons.
    injected_dependencies: (s) => /emitWitness\(action,\s*opts\)/.test(s)
      && /verifyWitness\(witness,\s*opts\)/.test(s)
      && !/^\s*(const|let|var)\s+store\s*=/m.test(s),
    builtins_only_import: (s) => {
      const imports = [...s.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
      return imports.length > 0 && imports.every((i) => i.startsWith('node:'));
    },
  };
}

/** Evaluate every lock over a module's source; returns { ok, failed: [] }. */
export function judgeSource(src) {
  const locks = buildLocks();
  const failed = Object.entries(locks).filter(([, check]) => !check(src)).map(([name]) => name);
  return { ok: failed.length === 0, failed };
}
