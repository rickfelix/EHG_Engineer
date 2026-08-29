import { describe, it, expect } from 'vitest';
import { applyAmplificationCap } from './lifecycle-sd-bridge.js';
import { EHG_VENTURE_DEFAULT_CAPABILITIES } from './config/venture-default-capabilities.js';

// QF-20260828-605: S19 bridge amplification cap must drop OPTIONAL items first, ERROR
// (never warn-only) on a MANDATORY-capability drop, and let the caller record the drop list.

function optionalPayload(i) {
  return { title: `Venture feature ${i}`, type: 'feature' };
}

describe('applyAmplificationCap (QF-20260828-605)', () => {
  it('is a no-op when payloads are within the cap', () => {
    const payloads = Array.from({ length: 5 }, (_, i) => optionalPayload(i));
    const { payloads: result, dropped } = applyAmplificationCap(payloads);
    expect(result).toHaveLength(5);
    expect(dropped).toEqual([]);
  });

  it('drops optional items first when a mandatory item would otherwise be cut (mandatory-last, 11 payloads)', () => {
    // 10 optional items + 1 mandatory item appended LAST — a naive slice(0, 10) would cut it.
    const optional = Array.from({ length: 10 }, (_, i) => optionalPayload(i));
    const mandatory = { title: EHG_VENTURE_DEFAULT_CAPABILITIES[0].name, type: 'feature' };
    const payloads = [...optional, mandatory];

    const { payloads: result, dropped } = applyAmplificationCap(payloads);

    expect(result).toHaveLength(10);
    expect(result.some((p) => p.title === mandatory.title)).toBe(true);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].title).not.toBe(mandatory.title);
  });

  it('throws (never warns-only) when the excess cannot be absorbed by optional items alone', () => {
    // 11 payloads, all mandatory (more mandatory items than fit under the cap).
    const payloads = EHG_VENTURE_DEFAULT_CAPABILITIES.length >= 11
      ? EHG_VENTURE_DEFAULT_CAPABILITIES.slice(0, 11).map((c) => ({ title: c.name, type: 'feature' }))
      : [
          ...EHG_VENTURE_DEFAULT_CAPABILITIES.map((c) => ({ title: c.name, type: 'feature' })),
          ...Array.from(
            { length: 11 - EHG_VENTURE_DEFAULT_CAPABILITIES.length },
            (_, i) => ({ title: EHG_VENTURE_DEFAULT_CAPABILITIES[i % EHG_VENTURE_DEFAULT_CAPABILITIES.length].name, type: 'feature' }),
          ),
        ];

    expect(() => applyAmplificationCap(payloads)).toThrow(/AMPLIFICATION_CAP_MANDATORY_DROP|mandatory/i);
  });

  it('records the drop list with title/type/reason (bridge-receipt shape)', () => {
    const optional = Array.from({ length: 12 }, (_, i) => optionalPayload(i));
    const { dropped } = applyAmplificationCap(optional);
    expect(dropped).toHaveLength(2);
    for (const d of dropped) {
      expect(d).toHaveProperty('title');
      expect(d).toHaveProperty('type');
      expect(d.reason).toBe('amplification_cap');
    }
  });
});
