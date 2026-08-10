// QF-20260810-290: the fleet-dashboard STALE section must not call .replace on a null sd_key.
// SILENT-HOLDER-AUDIT-001 (#6932) widened the claimed roster to admit qf_id-only rows (sd_key is
// the MIRROR and is NULL for QF holders); a stale such row crashed the ENTIRE dashboard on every
// 5-min tick (coordinator reproduced 3x). Source pin: every sd_key.replace in the render is guarded
// with a `|| s.qf_id`/`|| ''` fallback. A behavioural test would need printWorkers exported (it is
// not); the guard mirrors the already-behaviourally-tested claimed-worker section.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../../scripts/fleet-dashboard.cjs'), 'utf8');

describe('fleet-dashboard STALE section guards null sd_key (QF-holder rows)', () => {
  // Scoped to the STALE section ONLY: that is where #6932 admitted qf_id-only (sd_key null) rows.
  // Other sd_key.replace sites in this file operate on rows where sd_key is non-null by
  // construction (children / claimed SDs from strategic_directives_v2) and are out of scope.
  it('the stale-session render uses the (s.sd_key || s.qf_id || ...) guard, not bare s.sd_key.replace', () => {
    const staleIdx = src.indexOf('d.staleSessions.length > 0');
    expect(staleIdx).toBeGreaterThan(-1);
    // End-anchor on the shortSd assignment rather than a fixed slice — a fixed window is a
    // guard whose subject moves when comment lines are added above the pinned line (the exact
    // slice-moves class this session already hit once).
    const shortSdIdx = src.indexOf('const shortSd', staleIdx);
    const block = src.slice(staleIdx, shortSdIdx + 120);
    expect(block).toMatch(/\(s\.sd_key \|\| s\.qf_id \|\| '\?'\)\.replace/);
    expect(block).not.toMatch(/[^|(]\s*s\.sd_key\.replace\(/);
  });
});
