/**
 * QF-20260816-696 — two SD-type-keyed lookup maps carried a phantom `fix` key (the canonical
 * sd_type is `bugfix`; `fix` never matches anything real):
 *   - scripts/eva/vision-to-patterns.js's SD_TYPE_EXEMPT_DIMENSIONS: `fix` never matched, so
 *     bugfix SDs never got the V09 exemption and spawned false VGAP-V09 rows.
 *   - lib/handoff/threshold-resolver.js's SD_TYPE_ADDRESSABLE_DIMENSIONS: carried a dead `fix`
 *     entry duplicating the correct `bugfix` entry, contradicting its own docstring's claim
 *     that the phantom key "was removed" (SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001).
 *
 * Fixed both. This pins every key in both maps as canonical (or one of the small set of
 * intentionally-retained defensive aliases — see lib/handoff/threshold-resolver.js's own
 * docstring on SD_TYPE_THRESHOLDS) so a phantom key of this shape cannot silently recur.
 *
 * A2 ultrareview #7065 merged_bug_008.
 */
import { describe, it, expect, vi } from 'vitest';
import { isValidSdType } from '../../lib/sd-type-enum.js';
import { SD_TYPE_ADDRESSABLE_DIMENSIONS } from '../../lib/handoff/threshold-resolver.js';

// vision-to-patterns.js imports the event bus at module scope; mirror the existing
// vision-to-patterns.test.js mock so importing it here has no real side effects.
vi.mock('../../lib/eva/event-bus/vision-events.js', () => ({
  publishVisionEvent: vi.fn(),
  VISION_EVENTS: { GAP_DETECTED: 'vision.gap_detected' },
}));

const { SD_TYPE_EXEMPT_DIMENSIONS } = await import('../../scripts/eva/vision-to-patterns.js');

// SD-FDBK-INFRA-TYPE-SOURCE-TRUTH-001's own documented, deliberately-retained exceptions —
// domain groupings kept as defensive aliases for legacy callers, explicitly out of scope for
// that SD's cleanup per LEAD scope-lock. NOT phantom values: these are a documented decision,
// unlike `fix`, which was never intentional.
const DOCUMENTED_NON_CANONICAL_ALIASES = new Set(['governance', 'maintenance', 'protocol']);

function assertMapKeysCanonicalOrAliased(map, mapName) {
  for (const key of Object.keys(map)) {
    if (DOCUMENTED_NON_CANONICAL_ALIASES.has(key)) continue;
    expect(isValidSdType(key), `${mapName}["${key}"] is neither a canonical sd_type nor a documented alias`).toBe(true);
  }
}

describe('SD-type-keyed consumer maps — every key is canonical or a documented alias (QF-20260816-696)', () => {
  it('vision-to-patterns.js SD_TYPE_EXEMPT_DIMENSIONS has no phantom keys', () => {
    assertMapKeysCanonicalOrAliased(SD_TYPE_EXEMPT_DIMENSIONS, 'SD_TYPE_EXEMPT_DIMENSIONS');
  });

  it('threshold-resolver.js SD_TYPE_ADDRESSABLE_DIMENSIONS has no phantom keys', () => {
    assertMapKeysCanonicalOrAliased(SD_TYPE_ADDRESSABLE_DIMENSIONS, 'SD_TYPE_ADDRESSABLE_DIMENSIONS');
  });

  it('neither map carries the specific phantom `fix` key (the exact QF regression)', () => {
    expect(Object.keys(SD_TYPE_EXEMPT_DIMENSIONS)).not.toContain('fix');
    expect(Object.keys(SD_TYPE_ADDRESSABLE_DIMENSIONS)).not.toContain('fix');
  });

  it('SD_TYPE_EXEMPT_DIMENSIONS exempts bugfix (not fix) from V09 — the exact QF acceptance case', () => {
    expect(SD_TYPE_EXEMPT_DIMENSIONS.bugfix).toBeInstanceOf(Set);
    expect(SD_TYPE_EXEMPT_DIMENSIONS.bugfix.has('V09')).toBe(true);
  });

  it('SD_TYPE_ADDRESSABLE_DIMENSIONS.bugfix is unchanged by dropping the duplicate fix entry', () => {
    expect(SD_TYPE_ADDRESSABLE_DIMENSIONS.bugfix).toEqual(['reliability', 'quality', 'performance', 'security']);
  });
});
