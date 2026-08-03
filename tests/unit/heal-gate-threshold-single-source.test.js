// FR-2 — the heal gate resolves thresholds from ONE table.
// SD-FDBK-FIX-HEAL-BEFORE-COMPLETE-001.
//
// The gate imported only the FUNCTIONS from lib/handoff/threshold-resolver.js while keeping its own
// SD_TYPE_THRESHOLDS, so two tables governed one decision and nothing compared them. The drift was
// PARTIAL — feature, security and infrastructure agreed — which is why it survived: any spot-check
// landing on one of those three confirmed the tables matched.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SD_TYPE_THRESHOLDS } from '../../lib/handoff/threshold-resolver.js';

const GATE = path.join(process.cwd(), 'scripts/modules/handoff/executors/plan-to-lead/gates/heal-before-complete.js');
const src = () => fs.readFileSync(GATE, 'utf8');

describe('FR-2 — the gate holds no threshold table of its own', () => {
  it('does not DECLARE SD_TYPE_THRESHOLDS, it IMPORTS it', () => {
    const s = src();
    // Assert on the DECLARATION specifically. A bare "does it mention the name" check would pass on
    // the very defect this fixes, since the old file both declared and used the same identifier.
    expect(s).not.toMatch(/(const|let|var)\s+SD_TYPE_THRESHOLDS\s*=/);
    expect(s).toMatch(/import\s*\{[^}]*SD_TYPE_THRESHOLDS[^}]*\}\s*from\s*['"][^'"]*threshold-resolver\.js['"]/);
  });

  it('still USES the table it imports — deleting a table and the lookup together would also pass the check above', () => {
    expect(src()).toMatch(/SD_TYPE_THRESHOLDS\[\s*sdType\s*\]/);
  });
});

describe('FR-2 — the keys that were missing now resolve', () => {
  // The larger live effect is the ABSENCES, not the disagreements: 4 in-flight orchestrator SDs move
  // 85 -> 70 through a missing key, while the four disagreeing types have almost no in-flight
  // population. A blast-radius claim scoped to disagreeing VALUES reports ~zero impact and is wrong.
  it.each(['governance', 'database', 'maintenance', 'protocol', 'orchestrator', '_default'])(
    'resolves %s, which the gate copy lacked entirely', (type) => {
      expect(typeof SD_TYPE_THRESHOLDS[type]).toBe('number');
    });

  it('orchestrator resolves to 70 — the in-flight case, asserted by name not by count', () => {
    expect(SD_TYPE_THRESHOLDS.orchestrator).toBe(70);
  });
});

describe('FR-2 — the canonical table is internally coherent', () => {
  // Deliberately NOT a snapshot of every value: pinning all thirteen would make any future
  // deliberate tuning fail here for the wrong reason. These assert RELATIONSHIPS that must hold
  // whatever the numbers become.
  it('every threshold is a number in 0..100', () => {
    for (const [k, v] of Object.entries(SD_TYPE_THRESHOLDS)) {
      expect(typeof v, k).toBe('number');
      expect(v, k).toBeGreaterThanOrEqual(0);
      expect(v, k).toBeLessThanOrEqual(100);
    }
  });

  it('carries a _default so an unknown sd_type resolves rather than falling through', () => {
    expect(SD_TYPE_THRESHOLDS._default).toBeDefined();
  });

  it('the high-fidelity tier sits strictly above the low tier', () => {
    // A table that collapsed every type to one value would satisfy "is a number" and defeat the
    // point of having types at all.
    expect(SD_TYPE_THRESHOLDS.feature).toBeGreaterThan(SD_TYPE_THRESHOLDS.documentation);
    expect(SD_TYPE_THRESHOLDS.security).toBeGreaterThan(SD_TYPE_THRESHOLDS.maintenance);
  });

  it('distinct types are NOT all identical — the table still discriminates', () => {
    expect(new Set(Object.values(SD_TYPE_THRESHOLDS)).size).toBeGreaterThan(1);
  });
});
