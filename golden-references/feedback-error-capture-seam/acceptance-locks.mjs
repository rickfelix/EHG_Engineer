// Structural acceptance LOCKS for the feedback/error-capture-seam reference —
// pure predicates over the JS source, node-builtins-only. Textual locks are
// NECESSARY BUT WEAK (the -C lesson) and a "no throw keyword" check is a proxy for
// throw-SAFETY (the -F adversarial lesson) — so the behavioral suite (parameterized
// over GOLDEN_REF_MODULE) that CALLS captureBoundary with a hostile thrown value, a
// throwing sink/logger/clock, and an async op is the PRIMARY enforcement.
export const DEFAULT_MODULE = 'golden-references/feedback-error-capture-seam/capture-seam.mjs';

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** Code body of a named function (exported or not, sync or async), comments stripped. */
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

    // D1: captureBoundary wraps op() in try/catch and routes failure through the
    // last-ditch guard to record(), which appends a schema-shaped entry to the sink.
    capture_at_boundary: (s) => {
      const cb = fnBody(s, 'captureBoundary');
      const rec = fnBody(s, 'record');
      if (!cb || !rec) return false;
      const wrapsOp = /try\s*\{[\s\S]*?op\(\)[\s\S]*?\}\s*catch/.test(cb) && /return guard\(/.test(cb);
      const appendsEntry = /sink\.append\(\s*entry\s*\)/.test(rec) && /buildEntry\(/.test(rec);
      return wrapsOp && appendsEntry;
    },

    // D2 (never-throws — for ANY input): the boundary routes failure through guard()
    // (a last-ditch try that returns a best-effort result rather than propagate); the
    // pure prologue is throw-safe (symptomOf guards String(err); utcDayOf handles an
    // invalid/NaN time); the sink write and the logger are each wrapped; no bare throw.
    never_throws_best_effort: (s) => {
      const cb = fnBody(s, 'captureBoundary');
      const g = fnBody(s, 'guard');
      const sl = fnBody(s, 'safeLog');
      const sy = fnBody(s, 'symptomOf');
      const ud = fnBody(s, 'utcDayOf');
      const rec = fnBody(s, 'record');
      if (!cb || !g || !sl || !sy || !ud || !rec) return false;
      const catchGuards = /catch\s*\([^)]*\)\s*\{\s*return guard\(/.test(cb);
      const depsCoerced = /deps\s*=\s*deps\s*\|\|\s*\{\}/.test(cb); // an explicit null must not slip the default
      const guardCatchReturns = /catch\s*\([^)]*\)\s*\{[\s\S]*?return\s*\{\s*ok:\s*false/.test(g);
      const guardLogNullSafe = /safeLog\(\s*deps\s*&&\s*deps\.logger/.test(g); // catch handler must not deref null deps
      const safeLoggerWrapped = /try\s*\{\s*logger\.error\([\s\S]*?\}\s*catch/.test(sl);
      const symptomGuarded = /try\s*\{[\s\S]*?String\(err\)[\s\S]*?\}\s*catch/.test(sy);
      const clockGuarded = /Number\.isFinite/.test(ud);
      const sinkWrapped = /try\s*\{\s*sink\.append\([\s\S]*?\}\s*catch/.test(rec);
      const noBareThrow = !/\bthrow\b/.test(cb) && !/\bthrow\b/.test(rec);
      return catchGuards && depsCoerced && guardCatchReturns && guardLogNullSafe && safeLoggerWrapped && symptomGuarded && clockGuarded && sinkWrapped && noBareThrow;
    },

    // D2 (never-silent): the FIRST-capture path emits BOTH a durable row (sink.append)
    // AND a stderr line (safeLog logger).
    never_silent_stderr_and_row: (s) => {
      const rec = fnBody(s, 'record');
      if (!rec) return false;
      return /sink\.append\(/.test(rec) && /safeLog\(\s*logger/.test(rec);
    },

    // D3: dedup_hash is STABLE fields ONLY (utcDay + symptom + source); emitted_at
    // (volatile) is stored on the entry but NOT part of the hash.
    dedup_stable_fields_only: (s) => {
      const dh = fnBody(s, 'dedupHash');
      const be = fnBody(s, 'buildEntry');
      if (!dh || !be) return false;
      const stableHash = /\$\{utcDay\}::\$\{symptom\}::\$\{String\(source\)\}/.test(dh) && !/emitted_at/.test(dh);
      const volatileStored = /emitted_at:\s*safeNow\(clock\)/.test(be);
      return stableHash && volatileStored;
    },

    // D3: dedup lookup is co-scoped by (category, dedup_hash).
    category_scoped_dedup: (s) => {
      const rec = fnBody(s, 'record');
      if (!rec) return false;
      return /findByHash\(\s*\{\s*category,\s*dedup_hash/.test(rec);
    },

    // D4: the SUCCESS path writes nothing (all writes live in record()); discrimination
    // is throw-vs-return, not truthiness.
    healthy_path_silent: (s) => {
      const cb = fnBody(s, 'captureBoundary');
      if (!cb) return false;
      const returnsValue = /return\s*\{\s*ok:\s*true,\s*value\s*\}/.test(cb);
      const noWriteOnSuccess = !/sink\.|logger\.|safeLog\(/.test(cb);
      return returnsValue && noWriteOnSuccess;
    },

    // sink/logger/clock are INJECTED (destructured from deps), never module singletons.
    injected_deps: (s) => {
      const rec = fnBody(s, 'record');
      const be = fnBody(s, 'buildEntry');
      if (!rec || !be) return false;
      const destructured = /const\s*\{[^}]*\bsink\b[^}]*\}\s*=\s*deps/.test(rec) && /const\s*\{[^}]*\bclock\b[^}]*\}\s*=\s*deps/.test(be);
      const noSingleton = !/^(const|let|var)\s+(sink|logger|clock)\s*=/m.test(s);
      return destructured && noSingleton;
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
