// QF-20260822-805 -- S2 decision_at backfill.
// Solomon's binding S2 ruling (signal a54582d1 resolution, coordinator directive
// a154c831-cfcd-4dc2-a993-db375d2cb66c): decision_by on rows 922f8dfb/0f9ffc05 was already
// correctly stamped ('adam-08049808') by an earlier write path and must stay untouched --
// the real gap is decision_at left NULL. Adam supplied exact provenance timestamps, each with
// a tolerance window reflecting his turn-grained (not sub-second) session-state stamps.
// PATCH-WHAT-THE-WRITER-COULD-HAVE-WRITTEN: a plain timestamptz value is writer-legal, unlike
// the abandoned decision_by constant patch (lib/solomon/s2-adam-constant-patch.js, superseded).
export const S2_DECISION_AT_TARGETS = Object.freeze([
  {
    id: '922f8dfb-a548-49b4-869e-0f8c7b73fd73',
    decisionAt: '2026-08-21T13:04:00.000Z',
    toleranceMinutes: 2,
    provenance: 'Adam post-compaction tick logged 13:01-13:05Z; deferral was that turn\'s closing action (.claude/adam-session-state-08049808.md, ~13:05Z line).',
  },
  {
    id: '0f9ffc05-2d5a-49c0-9005-e1e5f6993fa3',
    decisionAt: '2026-08-21T13:43:00.000Z',
    toleranceMinutes: 3,
    provenance: 'Adam tick stamped 13:45Z; deferral preceded the Solomon-health stamp same turn (session-state line + transcript tool-call ordering).',
  },
]);

/**
 * Pure: build the decision_at backfill patch set for the S2 rows.
 * @param {{id: string, decision_at: string|null}[]} liveRows - live rows matching the target ids
 * @returns {{applied: object[], skipped: object[]}}
 */
export function buildDecisionAtBackfill(liveRows) {
  const applied = [];
  const skipped = [];
  for (const row of liveRows) {
    const target = S2_DECISION_AT_TARGETS.find((t) => t.id === row.id);
    if (!target) {
      skipped.push({ id: row.id, reason: 'Not one of the 2 named S2 target rows.' });
      continue;
    }
    if (row.decision_at !== null) {
      skipped.push({ id: row.id, reason: `decision_at already set (${row.decision_at}) -- not overwriting a non-NULL value.` });
      continue;
    }
    applied.push({ id: row.id, decisionAt: target.decisionAt, toleranceMinutes: target.toleranceMinutes, provenance: target.provenance });
  }
  return { applied, skipped };
}
