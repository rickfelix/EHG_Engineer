/**
 * SD-LEO-INFRA-RELAY-QUEUE-CONFIRM-ON-RELAY-DELIVERY-GUARANTEE-001 / FR-1 (TS-8)
 *
 * relay_request MUST be excluded from DIRECTIVE_KINDS, or the generic worker inbox
 * drain would consume it directly and defeat the tracked-queue guarantee -- the
 * same defense class SOLOMON_CONSULT already established.
 */
import { describe, it, expect } from 'vitest';
import { PAYLOAD_KINDS, DIRECTIVE_KINDS } from '../../../lib/fleet/worker-status.cjs';

describe('relay_request / relay_confirm payload kinds', () => {
  it('are registered in PAYLOAD_KINDS', () => {
    expect(PAYLOAD_KINDS.RELAY_REQUEST).toBe('relay_request');
    expect(PAYLOAD_KINDS.RELAY_CONFIRM).toBe('relay_confirm');
  });

  it('relay_request is absent from DIRECTIVE_KINDS (never auto-consumed by the generic drain)', () => {
    expect(DIRECTIVE_KINDS).not.toContain(PAYLOAD_KINDS.RELAY_REQUEST);
    expect(DIRECTIVE_KINDS).not.toContain('relay_request');
  });

  it('relay_confirm is absent from DIRECTIVE_KINDS', () => {
    expect(DIRECTIVE_KINDS).not.toContain(PAYLOAD_KINDS.RELAY_CONFIRM);
  });
});
