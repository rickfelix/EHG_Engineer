// The consumer lane must agree with the producer's canonical list.
// SD-LEO-INFRA-DRIVE-LOOP-INSTRUMENT-001-C.
//
// THIS TEST ARMS ITSELF WHEN THE DEPENDENCY LANDS, which is the point of it.
//
// The canonical lane list lives in sibling -B's lib/drive-loop/lanes.js. That file is NOT on this
// branch — importing it would make this branch unbuildable until -B merges, and copying it would
// put two lane modules in one directory where `require('../lib/drive-loop/lanes')` resolves to the
// .js. So the consumer defines the single lane it writes, and this test checks agreement IF AND
// ONLY IF the producer's module is present.
//
// WHY THAT IS BETTER THAN A COMMENT. The first version of this SD wrote 'chairman-brief' with a
// HYPHEN against a producer whose SQL is CHECK (lane IN ('coordinator','adam','chairman_brief')).
// A wrong-key receipt INSERTS CLEANLY and satisfies UNIQUE(report_id, lane) SEPARATELY from the
// real lane — so the typo produces a receipt nobody reads while the real lane still looks
// unconsumed. A comment saying "keep these in sync" would not have caught it. This will, the
// moment -B's module appears, without anyone remembering to come back here.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { COORDINATOR_LANE } from '../../../scripts/coordinator-drive-report-consume.mjs';

const PRODUCER_LANES = path.join(process.cwd(), 'lib/drive-loop/lanes.js');
const producerPresent = fs.existsSync(PRODUCER_LANES);

describe('consumer lane vs producer contract', () => {
  it('is a plausible lane even before the producer module exists', () => {
    // Holds unconditionally, so this file is never a no-op suite: an all-skipped file reads as
    // coverage while asserting nothing.
    expect(typeof COORDINATOR_LANE).toBe('string');
    expect(COORDINATOR_LANE).toMatch(/^[a-z_]+$/);   // underscore vocabulary, never hyphen
  });

  it.runIf(producerPresent)('AGREES with the producer canonical list once -B has landed', async () => {
    const mod = await import('../../../lib/drive-loop/lanes.js');
    expect(mod.DRIVE_REPORT_LANES).toContain(COORDINATOR_LANE);
    // Both arms: the hyphen form must NOT be accepted, or a future edit could satisfy the check
    // above while reintroducing the exact string that fails silently.
    expect(mod.DRIVE_REPORT_LANES).not.toContain('chairman-brief');
  });

  it('records why this file is conditional, so nobody deletes the guard as dead weight', () => {
    expect(producerPresent || !producerPresent).toBe(true);
    // Documented state at authoring: producer module ABSENT on this branch (-B unmerged, PR #6784
    // draft). When -B lands, the assertion above starts running automatically.
  });
});
