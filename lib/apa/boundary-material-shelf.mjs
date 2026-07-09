// APA Boundary-Material Shelf — durable versioned floor-edge fixture source.
// SD-LEO-INFRA-APA-BOUNDARY-MATERIAL-001 (PART A: dependency-free schema + assembler guard).
//
// The APA calibration set needs BOUNDARY fixtures: real-world, sub-award screens sitting right
// at the pass/fail line. This module is the durable, versioned CONTAINER + the selection GUARD.
// It consumes the `capture_png` fixture format from SD-LEO-INFRA-APA-FIXTURE-HARNESS-001.
//
// SCOPE NOTE (PART A only): this ships the schema (data contract), the shelf loader/validator, and
// the assembler "forbidden all-same-side" band-diversity guard — the piece that prevents the exact
// failure the first swap-round set hit. FENCED as follow-ups (see the SD): the pixel-level
// baked-in-raster brand-strip SCANNER (needs an OCR dependency decision) and the actual curation /
// live-site capture / design-banding of real floor-edge screens (APA-cluster, taste-gated).

import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The three floor-edge bands, ordered above→line→below. */
export const SHELF_BANDS = Object.freeze(['above', 'on_line', 'below']);

/** Bands on the "pass" side vs the "fail" side of the ~4.0 floor. `on_line` is the line itself. */
const ABOVE_SIDE = new Set(['above']);
const BELOW_SIDE = new Set(['below']);

/** Canonical on-disk location of the versioned shelf manifest. */
export const SHELF_MANIFEST_PATH = path.resolve('docs/design/apa-boundary-material-shelf/manifest.json');

/**
 * Validate a single shelf entry against the boundary-material data contract.
 * Throws with a descriptive message on the first violation; returns true when valid.
 */
export function validateShelfEntry(entry, index = 0) {
  const where = `shelf entry [${index}]${entry && entry.id ? ` (${entry.id})` : ''}`;
  if (!entry || typeof entry !== 'object') throw new Error(`${where}: not an object`);
  if (!entry.id || typeof entry.id !== 'string') throw new Error(`${where}: missing string 'id'`);
  // Boundary material is always a live-site capture — no hand-authored HTML wrapper.
  if (entry.format !== 'capture_png') throw new Error(`${where}: format must be 'capture_png' (got '${entry.format}')`);
  if (!SHELF_BANDS.includes(entry.band)) {
    throw new Error(`${where}: band must be one of ${SHELF_BANDS.join('|')} (got '${entry.band}')`);
  }
  // Per-band craft justification + a11y notes are MANDATORY (the anti-reputation-confabulation
  // discipline: every floor-edge pick must carry why it sits at its band, and its a11y read).
  if (!entry.craft_justification || !String(entry.craft_justification).trim()) {
    throw new Error(`${where}: missing non-empty 'craft_justification'`);
  }
  if (entry.a11y_notes === undefined || entry.a11y_notes === null || !String(entry.a11y_notes).trim()) {
    throw new Error(`${where}: missing non-empty 'a11y_notes'`);
  }
  return true;
}

/**
 * Validate the whole shelf manifest shape: a versioned container with an entries[] array.
 * Every entry must pass validateShelfEntry. Returns the parsed shelf on success.
 */
export function validateShelf(shelf) {
  if (!shelf || typeof shelf !== 'object') throw new Error('shelf: not an object');
  if (typeof shelf.shelf_version !== 'number' || shelf.shelf_version < 1) {
    throw new Error(`shelf: 'shelf_version' must be a positive number (got ${JSON.stringify(shelf.shelf_version)})`);
  }
  if (!Array.isArray(shelf.entries)) throw new Error("shelf: 'entries' must be an array");
  shelf.entries.forEach((e, i) => validateShelfEntry(e, i));
  return shelf;
}

/** Load + validate the versioned shelf manifest from disk (default: SHELF_MANIFEST_PATH). */
export async function loadShelf(manifestPath = SHELF_MANIFEST_PATH) {
  const raw = await readFile(manifestPath, 'utf8');
  return validateShelf(JSON.parse(raw));
}

/**
 * The assembler's "FORBIDDEN all-same-side" guard.
 *
 * A boundary selection that sits entirely on one side of the floor (all `above`, or all `below`)
 * does NOT test the floor edge — it was the exact failure the first swap-round set hit. A valid
 * selection must (a) be non-empty, (b) span at least 2 distinct bands, and (c) NOT be all-on-one-
 * side (not exclusively `above` and not exclusively `below`; an `on_line` fixture straddles). Throws
 * on violation; returns { bands, warnings } on success (warns when fewer than all 3 bands present).
 */
export function assertBandDiversity(selection) {
  if (!Array.isArray(selection) || selection.length === 0) {
    throw new Error('boundary selection: must be a non-empty array of shelf entries');
  }
  const bands = selection.map((e, i) => {
    if (!SHELF_BANDS.includes(e && e.band)) throw new Error(`boundary selection [${i}]: invalid band '${e && e.band}'`);
    return e.band;
  });
  const distinct = new Set(bands);
  if (distinct.size < 2) {
    throw new Error(`FORBIDDEN all-same-side selection: only band '${[...distinct][0]}' present — a floor-edge test must span >=2 bands (${SHELF_BANDS.join('|')})`);
  }
  const allAbove = bands.every((b) => ABOVE_SIDE.has(b));
  const allBelow = bands.every((b) => BELOW_SIDE.has(b));
  if (allAbove || allBelow) {
    throw new Error(`FORBIDDEN all-same-side selection: every fixture is on the '${allAbove ? 'above' : 'below'}' side of the floor — include an on_line and/or opposite-side pick`);
  }
  const warnings = [];
  if (distinct.size < SHELF_BANDS.length) {
    warnings.push(`selection spans ${distinct.size}/${SHELF_BANDS.length} bands (${[...distinct].join(',')}) — one-per-band (above,on_line,below) is the recommended minimum`);
  }
  return { bands: [...distinct], warnings };
}
