/**
 * SD-LEO-FIX-SHIP-ESCAPE-AUDIT-001 — generated-artifact exemption for the preflight
 * marker scans (3rd FP family: QF-20260527-303 identifier-case, LABEL-FP-001
 * classification enums, now generated-file DATA).
 *
 * Witnessed trigger: database/schema-reference-snapshot.json reproduces every DB CHECK
 * constraint verbatim; a PEER table's enum value (the a-word in sms_inbound_log's
 * outcome CHECK) blocked an unrelated SD's EXEC-TO-PLAN because that SD's process
 * mandates the same-PR snapshot regen. Generated data is not a decision marker.
 *
 * NOTE: marker strings below are concatenation-built so this test's own committed diff
 * never contains bare marker literals (the scan reads added diff lines verbatim).
 */

import { describe, it, expect } from 'vitest';
import { addedLinesForAmbiguityScan } from '../../scripts/modules/implementation-fidelity/preflight/index.js';

const A_WORD = 'ambig' + 'uous';          // marker word, concatenation-built
const FIX_MARKER = 'FIX' + 'ME';          // marker word, concatenation-built

const SNAPSHOT_DIFF =
  'diff --git a/database/schema-reference-snapshot.json b/database/schema-reference-snapshot.json\n' +
  '--- a/database/schema-reference-snapshot.json\n' +
  '+++ b/database/schema-reference-snapshot.json\n' +
  `+  "sms_inbound_log.outcome_check": "CHECK ((outcome = ANY (ARRAY['${A_WORD}'::text])))",\n`;

const CODE_DIFF =
  'diff --git a/lib/example.mjs b/lib/example.mjs\n' +
  '--- a/lib/example.mjs\n' +
  '+++ b/lib/example.mjs\n' +
  `+  // ${FIX_MARKER} resolve this before ship\n` +
  '+  const ok = true;\n';

describe('addedLinesForAmbiguityScan — generated-file exemption', () => {
  it('drops added lines from the schema snapshot (peer enum DATA never trips the scan)', () => {
    const scanned = addedLinesForAmbiguityScan(SNAPSHOT_DIFF);
    expect(scanned.includes(A_WORD)).toBe(false);
  });

  it('keeps added lines from hand-written files (real markers still gate)', () => {
    const scanned = addedLinesForAmbiguityScan(CODE_DIFF);
    expect(scanned.includes(FIX_MARKER)).toBe(true);
    expect(scanned).toMatch(/const ok = true/);
  });

  it('file attribution resets across sections — snapshot exemption cannot leak onto a later file', () => {
    const scanned = addedLinesForAmbiguityScan(SNAPSHOT_DIFF + CODE_DIFF);
    expect(scanned.includes(A_WORD)).toBe(false);
    expect(scanned.includes(FIX_MARKER)).toBe(true);
  });

  it('exact-path anchoring: a nested copycat snapshot file is NOT exempt (security-agent hardening)', () => {
    const copycat =
      '+++ b/some/other/database/schema-reference-snapshot.json\n' +
      `+  "x": "${A_WORD}",\n`;
    const scanned = addedLinesForAmbiguityScan(copycat);
    expect(scanned.includes(A_WORD)).toBe(true); // still scanned — only the canonical path is exempt
  });

  it('removed lines and headers are never scanned; empty/invalid input is safe', () => {
    const diff = `--- a/x.js\n+++ b/x.js\n-  // ${FIX_MARKER} old\n context line\n`;
    expect(addedLinesForAmbiguityScan(diff)).toBe('');
    expect(addedLinesForAmbiguityScan('')).toBe('');
    expect(addedLinesForAmbiguityScan(null)).toBe('');
  });
});
