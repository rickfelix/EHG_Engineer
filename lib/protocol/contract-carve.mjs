/**
 * lib/protocol/contract-carve.mjs — SD-LEO-FIX-CLAUDE-ADAM-SPLIT-001 (FR-2/FR-3/FR-4).
 *
 * Pure helpers for carving a governed contract row (leo_protocol_sections) into its gated file
 * plus companion rows, expressed as located CUTS rather than hand-typed OLD/NEW pairs:
 *
 *   move = { section, name, key, cuts: [{ from, to, with?, dest? }] }
 *
 * `key` locates the clause (a substring unique to the section); each cut removes [from, to) —
 * the text from the start of `from` up to (not including) `to` — replaces it with `with`
 * (default: nothing) and hands the removed text to `dest` ('provenance' | 'manual'). `to: null`
 * means "to the end of the line `from` sits on". Because a cut starts at `from` and the clause
 * header is never inside a cut, marker headers stay byte-identical by construction.
 *
 * Idempotency: the companion heading (`headingFor(name)`) is the applied-marker — once a move has
 * landed, applying it again is a no-op. Callers still run their own fail-closed marker check.
 *
 * Pure: no DB, no fs. Shared by scripts/one-off/split-adam-contract-sd-split-001.mjs and
 * scripts/one-off/split-exec-core-contracts-sd-split-001.mjs (a one-off must never import
 * another one-off — NC-EXEC-006).
 */

/** Heading under which a move's carved text is appended to a companion row. */
export function headingFor(name, tag) {
  return `### ${name} (${tag})`;
}

/** The site pointer cites the ratification ids when the name carries them, else the heading name. */
export function pointerRef(name) {
  const m = name.match(/\(([0-9a-f]{8}(?:, [0-9a-f]{8})*(?: \+ [0-9a-f]{8})?)\)$/);
  return m ? m[1] : name;
}

/**
 * Apply one move to `content`.
 * @param {string} content - the section row's current content
 * @param {{section:number, name:string, key:string, cuts:Array<{from:string,to:string|null,with?:string,dest?:string}>}} move
 * @param {{provenance:string, manual:string}} companions - current companion contents (read-only here)
 * @param {string} tag - the SD/FR tag written into companion headings
 * @returns {{content:string, removed:{provenance:string[], manual:string[]}, applied:boolean}}
 */
export function applyMove(content, move, companions, tag) {
  const removed = { provenance: [], manual: [] };
  // The companion heading is the applied-marker: once a move has landed, re-running is a no-op by construction.
  if (companions.provenance.includes(headingFor(move.name, tag)) || companions.manual.includes(headingFor(move.name, tag))) {
    return { content, removed, applied: false };
  }
  const keyIdx = content.indexOf(move.key);
  if (keyIdx < 0) throw new Error(`MOVE "${move.name}": key not found in section ${move.section} — the contract drifted; re-derive the anchor.`);
  if (content.indexOf(move.key, keyIdx + 1) >= 0) throw new Error(`MOVE "${move.name}": key is not unique in section ${move.section}.`);
  let touched = 0;
  for (const cut of move.cuts) {
    const dest = cut.dest || 'provenance';
    const fromIdx = content.indexOf(cut.from, keyIdx);
    if (fromIdx < 0) throw new Error(`MOVE "${move.name}": cut anchor not found: ${JSON.stringify(cut.from.slice(0, 80))}`);
    let toIdx;
    if (cut.to === null) {
      const nl = content.indexOf('\n', fromIdx);
      toIdx = nl < 0 ? content.length : nl;
    } else {
      toIdx = content.indexOf(cut.to, fromIdx + cut.from.length);
      if (toIdx < 0) throw new Error(`MOVE "${move.name}": cut end not found: ${JSON.stringify(cut.to.slice(0, 80))}`);
    }
    removed[dest].push(content.slice(fromIdx, toIdx).trim());
    content = content.slice(0, fromIdx) + (cut.with || '') + content.slice(toIdx);
    touched++;
  }
  if (touched === 0) return { content, removed, applied: false };
  // SITE-EDIT pointer (ratification c44cd9d8): on the clause's own line for a bullet/paragraph
  // key, or as its own line right under a heading key. Skipped when the clause already names the
  // companion.
  const lineStart = content.lastIndexOf('\n', keyIdx) + 1;
  let lineEnd = content.indexOf('\n', keyIdx);
  if (lineEnd < 0) lineEnd = content.length;
  let line = content.slice(lineStart, lineEnd);
  const ref = pointerRef(move.name);
  const pointers = [];
  if (removed.provenance.length && !/PROVENANCE/.test(line)) pointers.push(`(provenance: PROVENANCE § ${ref})`);
  if (removed.manual.length && !/MANUAL/.test(line)) pointers.push(`(procedure: MANUAL § ${ref})`);
  if (pointers.length) {
    if (line.startsWith('#')) {
      content = content.slice(0, lineEnd) + `\n\n_${pointers.join(' ')}_` + content.slice(lineEnd);
    } else {
      const tail = line.match(/ \(Ratifications? [^()]*\.\)\s*$/);
      const ptr = ' ' + pointers.join(' ');
      line = tail ? line.slice(0, tail.index) + ptr + line.slice(tail.index) : line + ptr;
      content = content.slice(0, lineStart) + line + content.slice(lineEnd);
    }
  }
  return { content, removed, applied: true };
}

/** Append carved segments to a companion under the move's heading (no-op if already present). */
export function appendToCompanion(companion, name, segments, tag) {
  const heading = headingFor(name, tag);
  if (companion.includes(heading)) return companion;
  return companion.trimEnd() + `\n\n---\n\n${heading}\n\n${segments.join('\n\n')}\n`;
}

/**
 * Apply a list of moves against a map of section contents, appending carved text to the
 * companions. Returns the new contents, the new companions and the applied/skipped names.
 * @param {Object<number,string>} contents - section id -> content (mutated copy returned)
 * @param {Array} moves
 * @param {{provenance:string, manual:string}} companions
 * @param {string} tag
 */
export function applyMoves(contents, moves, companions, tag) {
  const out = { ...contents };
  const comp = { ...companions };
  const applied = []; const skipped = [];
  for (const move of moves) {
    const r = applyMove(out[move.section], move, comp, tag);
    out[move.section] = r.content;
    if (!r.applied) { skipped.push(move.name); continue; }
    for (const dest of ['provenance', 'manual']) {
      if (r.removed[dest].length) comp[dest] = appendToCompanion(comp[dest], move.name, r.removed[dest], tag);
    }
    applied.push(move.name);
  }
  return { contents: out, companions: comp, applied, skipped };
}
