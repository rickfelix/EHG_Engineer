/**
 * SD-LEO-FIX-SHIP-ESCAPE-AUDIT-001 — generated-artifact exemption for the preflight
 * ambiguity/stub scans (3rd FP family: QF-20260527-303 identifier-case,
 * LABEL-FP-001 classification enums, now generated-file DATA).
 *
 * Witnessed trigger: database/schema-reference-snapshot.json reproduces every DB CHECK
 * constraint verbatim; a PEER table's enum value ('ambiguous' in sms_inbound_log's
 * outcome CHECK) blocked an unrelated SD's EXEC-TO-PLAN because that SD's process
 * mandates the same-PR snapshot regen. Generated data is not a decision marker.
 */

import { describe, it, expect } from 'vitest';
import { addedLinesForAmbiguityScan } from '../../scripts/modules/implementation-fidelity/preflight/index.js';

const SNAPSHOT_DIFF =
  'diff --git a/database/schema-reference-snapshot.json b/database/schema-reference-snapshot.json\n' +
  '--- a/database/schema-reference-snapshot.json\n' +
  '+++ b/database/schema-reference-snapshot.json\n' +
  '+  "sms_inbound_log.outcome_check": "CHECK ((outcome = ANY (ARRAY[\'ambiguous\'::text])))",\n';

const CODE_DIFF =
  'diff --git a/lib/example.mjs b/lib/example.mjs\n' +
  '--- a/lib/example.mjs\n' +
  '+++ b/lib/example.mjs\n' +
  '+  // FIXME resolve this before ship\n' +
  '+  const ok = true;\n';

describe('addedLinesForAmbiguityScan — generated-file exemption', () => {
  it('drops added lines from the schema snapshot (peer enum DATA never trips the scan)', () => {
    const scanned = addedLinesForAmbiguityScan(SNAPSHOT_DIFF);
    expect(scanned).not.toMatch(/ambiguous/);
  });

  it('keeps added lines from hand-written files (real markers still gate)', () => {
    const scanned = addedLinesForAmbiguityScan(CODE_DIFF);
    expect(scanned).toMatch(/FIXME/);
    expect(scanned).toMatch(/const ok = true/);
  });

  it('file attribution resets across sections — snapshot exemption cannot leak onto a later file', () => {
    const scanned = addedLinesForAmbiguityScan(SNAPSHOT_DIFF + CODE_DIFF);
    expect(scanned).not.toMatch(/ambiguous/);
    expect(scanned).toMatch(/FIXME/);
  });

  it('removed lines and headers are never scanned; empty/invalid input is safe', () => {
    const diff = '--- a/x.js\n+++ b/x.js\n-  // FIXME old\n context line\n';
    expect(addedLinesForAmbiguityScan(diff)).toBe('');
    expect(addedLinesForAmbiguityScan('')).toBe('');
    expect(addedLinesForAmbiguityScan(null)).toBe('');
  });
});
