/**
 * CI invariant T7 — SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C / FR-8.
 *
 * Boundary: lib/eva-support/sd-reader.js MUST NOT import any write function
 * from lib/eva-support/decision-log-store.js.
 *
 * Why: sd-reader is the READ-ONLY query module. Phase 3 audit-row writes
 * (reader_disabled, reader_error) MUST flow through sd-decision-log-writer.js
 * (the dedicated Phase 3 writer with the right column shape), not through the
 * Phase 2 envelope writer (insertEntry). Keeping the boundary explicit prevents
 * an accidental drift where someone adds Phase 2 envelope writes to sd-reader
 * — that would (a) violate the chairman-conversational-only contract of Phase
 * 2 envelopes, and (b) bypass the sd-decision-log-writer's metadata.outcome
 * tagging that the recommendation emitter depends on.
 *
 * This test is the structural guard. Per-module static-source assertions in
 * sd-reader.test.js already cover the same invariant — this CI test elevates
 * to the SD-wide boundary contract.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SD_READER_PATH = join(REPO_ROOT, 'lib', 'eva-support', 'sd-reader.js');

// Banned imports from decision-log-store.
const BANNED = [
  { pattern: /from\s+['"][^'"]*decision-log-store(?:\.js)?['"]/, name: 'any decision-log-store module import' },
  { pattern: /\binsertEntry\b/, name: 'insertEntry identifier (Phase 2 envelope writer)' },
];

// Names that ARE allowed in sd-reader (sanity allowlist, not enforced — just documented):
//   - sd-decision-log-writer.js / writeAuditRow / updateAuditRowMetadata

describe('T7: sd-reader → decision-log-store write boundary', () => {
  it('sd-reader.js exists', () => {
    expect(existsSync(SD_READER_PATH)).toBe(true);
  });

  it('sd-reader.js does NOT import any decision-log-store function', () => {
    const source = readFileSync(SD_READER_PATH, 'utf8');
    const violations = [];
    for (const ban of BANNED) {
      if (ban.pattern.test(source)) {
        violations.push(ban.name);
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `T7 boundary VIOLATION: sd-reader.js imports/references banned identifiers:\n` +
        violations.map((v) => `  - ${v}`).join('\n') +
        `\n\nPhase 3 audit-row writes must use lib/eva-support/sd-decision-log-writer.js\n` +
        `(writeAuditRow / updateAuditRowMetadata), NOT the Phase 2 envelope writer (insertEntry).\n` +
        `See SD-EVA-SUPPORT-CLI-SKILL-ORCH-001-C FR-8 T7 boundary.`
      );
    }
    expect(violations).toHaveLength(0);
  });
});
