/**
 * SD-LEO-INFRA-FW3-FRAMING-PLUMBING-001-B
 *
 * FRAMING_CLASSES is a payload.framing_class sub-discriminator on the EXISTING
 * adam_advisory + payload.oracle=true leg (FW-3 design doc §6c) — NOT a new
 * PAYLOAD_KINDS entry. Pinned here so a future edit can't silently add a third
 * value or accidentally promote it into PAYLOAD_KINDS/DIRECTIVE_KINDS.
 */
import { describe, it, expect } from 'vitest';
import { FRAMING_CLASSES, PAYLOAD_KINDS, DIRECTIVE_KINDS } from '../../../lib/fleet/worker-status.cjs';

describe('FRAMING_CLASSES — FW-3 wire discriminator', () => {
  it('exposes exactly the two enum values {instrument, pick}', () => {
    expect(FRAMING_CLASSES).toEqual({ INSTRUMENT: 'instrument', PICK: 'pick' });
    expect(Object.values(FRAMING_CLASSES)).toHaveLength(2);
  });

  it('is NOT registered as a new PAYLOAD_KINDS entry (payload-shape reuse, not a new kind)', () => {
    expect(Object.values(PAYLOAD_KINDS)).not.toContain('instrument');
    expect(Object.values(PAYLOAD_KINDS)).not.toContain('pick');
    expect(Object.values(PAYLOAD_KINDS)).not.toContain('framing_class');
  });

  it('is NOT a DIRECTIVE_KIND (it is a field on adam_advisory, not a kind at all)', () => {
    expect(DIRECTIVE_KINDS).not.toContain('instrument');
    expect(DIRECTIVE_KINDS).not.toContain('pick');
  });
});
