#!/usr/bin/env node
/**
 * SD-LEO-INFRA-EVERY-CLAIM-WRITE-001 (FR-4) — an `.or()` filter on an UPDATE must project the
 * columns it filters on.
 *
 * WHY A LINT AND NOT A ONE-LINE FIX: a correct site already existed (lib/quick-fix-claim.mjs) while
 * the broken one sat next to it, so the knowledge was present and simply not enforced. A pin catches
 * the instance; only a property catches the class.
 *
 * THE RULE, MEASURED — and it is NARROWER than "any filter must project its columns":
 *   - On a PostgREST **UPDATE**, an `.or()` resolves its columns against the RETURNING projection.
 *     Filter on a column absent from `.select(...)` and you get 42703 on every call.
 *   - `.eq()` is **UNAFFECTED**: `.update().eq('claiming_session_id', x).select('id')` works fine
 *     (measured: OK rows=1). Several correct release sites do exactly this — flagging them would be
 *     a false positive, so this lint deliberately does NOT look at `.eq()`.
 *   - An UPDATE with **no `.select()`** resolves against the table and is fine.
 *   - A **SELECT** with the same `.or()` always works. Only UPDATE chains are inspected.
 * Over-broadening this rule would churn working code; that is why the scope is pinned here.
 *
 * The 42703 it prevents says "column ... does not exist" about a column that DOES exist — the error
 * misnames its own cause, which is what made the original defect read as transient cache staleness.
 *
 * KNOWN LIMITATION — what this control CANNOT see, stated concretely so nobody reads a clean run as
 * proof of absence:
 *  1. A `.or()` whose argument is a VARIABLE rather than a string literal is invisible. MEASURED:
 *     `.update({...}).eq('id', i).or(orFilter).select('id')` yields ZERO findings, and this is not
 *     hypothetical — `lib/claim/reacquire-self-live.mjs:304` builds its filter into `orFilter` and
 *     passes it exactly that way. That site is correct today (it projects the column), but if it
 *     ever narrows its projection THIS LINT WILL NOT CATCH IT. A text scan cannot resolve a value.
 *  2. A chain assembled across statements (`let q = sb.from(t).update(x); if (c) q = q.or(...);`)
 *     is not contiguous text, so the window never sees the `.or()` and the `.select()` together.
 *  3. The scan window ends at the first statement terminator or 2000 characters, whichever comes
 *     first; a chain longer than that is truncated and under-reported.
 * All three fail SILENT (a miss, never a false alarm). Closing them needs an AST pass, not a regex.
 */

/** Columns referenced inside an `.or(...)` argument: `col.op.value`, comma-separated. */
export function orFilterColumns(orArg) {
  const cols = [];
  for (const m of String(orArg || '').matchAll(/([A-Za-z_][A-Za-z0-9_]*)\.(?:is|eq|neq|gt|gte|lt|lte|like|ilike|in|cs|cd)\./g)) {
    cols.push(m[1]);
  }
  return [...new Set(cols)];
}

/** Columns named in a `.select('a, b')` projection. `*` (or a bare `.select()`) means "everything". */
export function projectionColumns(selectArg) {
  const raw = String(selectArg ?? '').trim();
  if (raw === '' || raw === '*') return '*';
  return raw.split(',').map((c) => c.trim().split(/[\s:(]/)[0]).filter(Boolean);
}

/**
 * Find UPDATE chains whose `.or()` filters on a column their `.select()` does not project.
 * Text-scanned rather than AST-parsed to stay dependency-free; the chain window ends at the
 * statement terminator so a later unrelated `.select()` cannot be misattributed.
 */
export function findUnprojectedOrFilters(source, filePath = '<source>') {
  const findings = [];
  // COMMENTS ARE BLANKED FIRST — A COMMENT IS NOT CODE. Measured: against the real pre-fix
  // lib/claim-guard.mjs this reported TWO findings for ONE defect, because a comment above the
  // chain quoting `.update(...)` opened a scan window that swallowed the genuine chain below it.
  // Blanked (not deleted) so byte offsets — and therefore reported line numbers — stay true.
  const text = String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
  for (const m of text.matchAll(/\.update\s*\(/g)) {
    const chain = text.slice(m.index, m.index + 2000).split(/;\s*(?:\r?\n|$)/)[0];
    const orMatch = chain.match(/\.or\s*\(\s*[`'"]([^`'"]*)[`'"]/);
    if (!orMatch) continue;
    const selectMatch = chain.match(/\.select\s*\(\s*[`'"]([^`'"]*)[`'"]\s*\)/);
    if (!selectMatch) continue; // no projection requested -> resolves against the table -> fine
    const projected = projectionColumns(selectMatch[1]);
    if (projected === '*') continue;
    const missing = orFilterColumns(orMatch[1]).filter((c) => !projected.includes(c));
    if (missing.length > 0) {
      findings.push({
        file: filePath,
        line: text.slice(0, m.index).split('\n').length,
        missing,
        projection: selectMatch[1],
        message:
          `.update(...).or(...) filters on ${missing.join(', ')} but .select('${selectMatch[1]}') does not project `
          + `${missing.length > 1 ? 'them' : 'it'}. On a PostgREST UPDATE an .or() resolves against the RETURNING `
          + 'projection, so this returns 42703 on EVERY call — and the error names the column as missing when it exists.'
      });
    }
  }
  return findings;
}
