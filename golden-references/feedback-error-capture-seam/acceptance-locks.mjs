// Structural acceptance LOCKS for the feedback/error-capture-seam reference —
// pure predicates over the JS source, node-builtins-only. Textual locks are
// NECESSARY BUT WEAK (the -C lesson); the behavioral suite (parameterized over
// GOLDEN_REF_MODULE) CALLS captureBoundary with a planted failure — and with a
// THROWING sink/logger — and is the primary enforcement (best-effort robustness
// and the swallow/never-silent doctrines are things no grep can prove).
export const DEFAULT_MODULE = 'golden-references/feedback-error-capture-seam/capture-seam.mjs';

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}
/** Code body of a named function (exported or not), comments stripped. */
function fnBody(src, name) {
  const start = src.search(new RegExp('(export )?function ' + name + '\\b'));
  if (start === -1) return null;
  const rest = src.slice(start + 1);
  const jsdoc = rest.search(/\n\/\*\*/);
  const nextFn = rest.search(/\n(export )?function /);
  const cut = [jsdoc, nextFn].filter((i) => i !== -1).sort((a, b) => a - b)[0];
  return stripComments('e' + (cut === undefined ? rest : rest.slice(0, cut)));
}

export function buildLocks() {
  return {
    reference_only_header: (s) => /REFERENCE ONLY/.test(s),

    // D1: captureBoundary wraps op() in try/catch and routes failure to capture(),
    // whose failure path appends a structured entry to the injected sink.
    capture_at_boundary: (s) => {
      const cb = fnBody(s, 'captureBoundary');
      const cap = fnBody(s, 'capture');
      if (!cb || !cap) return false;
      const wrapsOp = /try\s*\{[\s\S]*?op\(\)[\s\S]*?\}\s*catch/.test(cb) && /return capture\(/.test(cb);
      const appendsEntry = /sink\.append\(\s*\{[\s\S]*?symptom[\s\S]*?dedup_hash/.test(cap);
      return wrapsOp && appendsEntry;
    },

    // D2 (never-throws): the boundary catch RETURNS (never re-throws); the sink write
    // is wrapped in try/catch; the logger goes through safeLog (which swallows a
    // logger failure). No bare throw on the failure path — the seam must not become
    // the swallow footgun it fights.
    never_throws_best_effort: (s) => {
      const cb = fnBody(s, 'captureBoundary');
      const cap = fnBody(s, 'capture');
      const sl = fnBody(s, 'safeLog');
      if (!cb || !cap || !sl) return false;
      const catchReturns = /catch\s*\([^)]*\)\s*\{\s*return capture\(/.test(cb);
      const sinkWrapped = /try\s*\{\s*sink\.append\([\s\S]*?\}\s*catch/.test(cap);
      const safeLoggerWrapped = /try\s*\{\s*logger\.error\([\s\S]*?\}\s*catch/.test(sl);
      const noBareThrow = !/\bthrow\b/.test(cap);
      return catchReturns && sinkWrapped && safeLoggerWrapped && noBareThrow;
    },

    // D2 (never-silent): the FIRST-capture branch emits BOTH a durable row (sink.append)
    // AND a stderr line (safeLog logger). Both present in the else branch.
    never_silent_stderr_and_row: (s) => {
      const cap = fnBody(s, 'capture');
      if (!cap) return false;
      return /sink\.append\(/.test(cap) && /safeLog\(\s*logger/.test(cap);
    },

    // D3: dedup_hash is composed of STABLE fields ONLY (utcDay + symptom + source);
    // emitted_at (volatile) is NOT part of the hash but IS stored on the row.
    dedup_stable_fields_only: (s) => {
      const dh = fnBody(s, 'dedupHash');
      const cap = fnBody(s, 'capture');
      if (!dh || !cap) return false;
      const stableHash = /\$\{utcDay\}::\$\{symptom\}::\$\{source\}/.test(dh) && !/emitted_at/.test(dh);
      const volatileStored = /emitted_at:\s*clock\.now\(\)/.test(cap);
      return stableHash && volatileStored;
    },

    // D3: dedup lookup is co-scoped by (category, dedup_hash) — same hash under a
    // different category is a new row.
    category_scoped_dedup: (s) => {
      const cap = fnBody(s, 'capture');
      if (!cap) return false;
      return /sink\.findByHash\(\s*\{\s*category,\s*dedup_hash\s*\}\s*\)/.test(cap);
    },

    // D4: the SUCCESS path writes nothing — captureBoundary's non-throwing return has
    // no sink/logger/safeLog call (discrimination is throw-vs-return, not truthiness).
    healthy_path_silent: (s) => {
      const cb = fnBody(s, 'captureBoundary');
      if (!cb) return false;
      const returnsValue = /return\s*\{\s*ok:\s*true,\s*value\s*\}/.test(cb);
      const noWriteOnSuccess = !/sink\.|logger\.|safeLog\(/.test(cb); // all writes live in capture()
      return returnsValue && noWriteOnSuccess;
    },

    // sink/logger/clock are INJECTED (destructured from deps), never module singletons.
    injected_deps: (s) => {
      const cap = fnBody(s, 'capture');
      if (!cap) return false;
      const destructured = /const\s*\{\s*sink,\s*logger,\s*clock/.test(cap);
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
