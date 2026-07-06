// Structural acceptance LOCKS for the idempotent-composite-upsert reference — pure
// predicates over the JS source, node-builtins-only. Textual locks are NECESSARY BUT
// WEAK (the -C lesson); the behavioral suite (parameterized over GOLDEN_REF_MODULE) that
// RUNS the seam against a store adapter — two identical writes converge to one row, a
// silent-drop store makes the seam FAIL LOUD, a partial key collapses distinct rows — is
// the primary enforcement (the -F lesson: a "no bad keyword" textual check is a weak proxy
// for the real behavior).
export const DEFAULT_MODULE = 'golden-references/idempotent-composite-upsert/upsert-seam.mjs';

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** Code body of a named function (exported or not), comments stripped. */
function fnBody(src, name) {
  const start = src.search(new RegExp('(export )?(async )?function ' + name + '\\b'));
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const jsdoc = rest.search(/\n\/\*\*/);
  const nextFn = rest.search(/\n(export )?(async )?function /);
  const cut = [jsdoc, nextFn].filter((i) => i !== -1).sort((a, b) => a - b)[0];
  return stripComments('e' + (cut === undefined ? rest : rest.slice(0, cut)));
}

export function buildLocks() {
  return {
    reference_only_header: (s) => /REFERENCE ONLY/.test(s),

    // D1: the key is computed from the FULL keyCols (keyOf maps every column) and the write
    // is store.upsert(key,row) (converge), not an insert.
    upsert_full_composite_key: (s) => {
      const u = fnBody(s, 'upsertByKey');
      const k = fnBody(s, 'keyOf');
      if (!u || !k) return false;
      return /keyOf\(keyCols,\s*record\)/.test(u) && /keyCols\.map\(/.test(k) && /store\.upsert\(\s*key,\s*row\s*\)/.test(u);
    },

    // D2: the new value is the EXTERNAL record; the verify read-back happens AFTER the write
    // (never a read-before-write to derive the row = a racy read-modify-write).
    inputs_not_from_mutated_row: (s) => {
      const u = fnBody(s, 'upsertByKey');
      if (!u) return false;
      const fromRecord = /row\s*=\s*\{\s*\.\.\.record/.test(u);
      const upsertIdx = u.indexOf('store.upsert(');
      const getIdx = u.indexOf('store.getByKey(');
      return fromRecord && upsertIdx !== -1 && getIdx !== -1 && getIdx > upsertIdx;
    },

    // D2 carve-out: bumpVersion does a DB-atomic increment (store.atomicIncrement), NEVER an
    // app-side read-then-write (no getByKey inside bumpVersion).
    version_counter_carveout: (s) => {
      const b = fnBody(s, 'bumpVersion');
      if (!b) return false;
      return /store\.atomicIncrement\(/.test(b) && !/getByKey\(/.test(b);
    },

    // D3: readBack reads BY THE FULL composite key (getByKey on the JSON-encoded tuple), never
    // an unordered scan / find / limit.
    deterministic_readback: (s) => {
      const r = fnBody(s, 'readBack');
      if (!r) return false;
      return /store\.getByKey\(\s*JSON\.stringify\(keyVals\)/.test(r) && !/store\.all\(|\.limit\(|\.find\(/.test(r);
    },

    // D4: verify the write landed by read-back and THROW if not (fail loud on a silent no-op).
    verify_write_landed_fail_loud: (s) => {
      const u = fnBody(s, 'upsertByKey');
      if (!u) return false;
      return /const landed\s*=\s*store\.getByKey\(/.test(u) && /if\s*\(\s*!landed[\s\S]*?throw new Error/.test(u);
    },

    // D4/h2: updated_at is stamped explicitly from the injected clock on every write.
    explicit_updated_at: (s) => {
      const u = fnBody(s, 'upsertByKey');
      return !!u && /updated_at:\s*clock\.now\(\)/.test(u);
    },

    // D4/h1-null: a null/undefined key component FAILS LOUD (NULL is distinct from NULL).
    null_key_fail_loud: (s) => {
      const k = fnBody(s, 'keyOf');
      if (!k) return false;
      return /===\s*null\s*\|\|\s*v\s*===\s*undefined/.test(k) && /throw new Error/.test(k);
    },

    // store + clock are INJECTED parameters, never module singletons.
    injected_store_clock: (s) => {
      const takes = /export function upsertByKey\(store,\s*keyCols,\s*record,\s*opts/.test(s);
      const noSingleton = !/^(const|let|var)\s+store\s*=/m.test(s);
      return takes && noSingleton;
    },

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
