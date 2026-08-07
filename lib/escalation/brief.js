/**
 * SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-E — FR_C, the x5 chairman brief.
 *
 * THE RUNG IS AN INTERROGATIVE BRIEF, NEVER A BARE COUNT, and the SD marks this FIRM. The
 * reason is what the rung is FOR: the chairman packet exists so the chairman can ACT, and
 * "3 items unmoved" is not actionable. It names a volume, not a decision. Every field below
 * exists because acting requires it — WHICH item (position), HOW STALE (days), WHY it is stuck
 * (blocker), WHO owns it (owner), and WHAT WAS ALREADY ASKED at x3 so the chairman is not
 * re-asked a question already in flight.
 *
 * THE FAILURE MODE THIS GUARDS IS SILENT. A brief missing a field still renders, still reads
 * like a report, and still gets filed — it simply cannot be acted on, and the packet quietly
 * degrades into a volume gauge. So buildBrief REFUSES rather than emitting a partial: an
 * absent required field throws, naming the field. A brief that cannot be acted on should not
 * exist, because its existence is what makes the packet look healthy.
 */

/** Fields without which the brief is not actionable. Order is display order. */
export const REQUIRED_BRIEF_FIELDS = Object.freeze([
  'position',      // WHICH item — where it sits on the roadmap
  'days_unmoved',  // HOW STALE — the quantity that justifies the rung
  'blocker',       // WHY — named, not "blocked"
  'owner',         // WHO
  'question',      // WHAT WAS ALREADY ASKED at x3, so x5 escalates rather than repeats
]);

/**
 * @param {object} stall
 * @returns {{fields:object, line:string}}
 * @throws {Error} naming every missing field — refuses to emit an unactionable brief
 */
export function buildBrief(stall) {
  if (!stall || typeof stall !== 'object') {
    throw new TypeError(`[brief] stall must be an object, received ${JSON.stringify(stall)}`);
  }

  const missing = REQUIRED_BRIEF_FIELDS.filter((f) => {
    const v = stall[f];
    // Empty string and whitespace count as missing. A blocker of "" renders as a brief with a
    // blank where the reason belongs, which is the degraded-but-plausible output this guards.
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  });

  if (missing.length > 0) {
    throw new Error(
      `[brief] refusing to emit an unactionable x5 chairman brief — missing: ${missing.join(', ')}. ` +
      'FR_C is FIRM: the x5 rung is an interrogative brief, never a bare count. A brief missing a ' +
      'field still renders and still gets filed; it simply cannot be acted on, and the packet ' +
      'degrades into a volume gauge without anyone noticing.'
    );
  }

  const fields = Object.fromEntries(REQUIRED_BRIEF_FIELDS.map((f) => [f, stall[f]]));
  const line =
    `${fields.position} — unmoved ${fields.days_unmoved}d — blocker: ${fields.blocker} — ` +
    `owner: ${fields.owner} — asked at x3: "${fields.question}"`;

  return { fields, line };
}

/**
 * Does a rendered line carry every required field?
 *
 * Exists so a REVIEWER (or a downstream assertion) can check a brief it did not build — e.g. one
 * that arrived as text. Deliberately checks for the field VALUES, not the labels: a template that
 * printed the labels with empty values would pass a label-only check while carrying nothing.
 */
export function briefIsActionable(line, stall) {
  if (typeof line !== 'string' || line.trim() === '') return false;
  try {
    const { fields } = buildBrief(stall);
    return REQUIRED_BRIEF_FIELDS.every((f) => line.includes(String(fields[f])));
  } catch {
    return false;
  }
}
