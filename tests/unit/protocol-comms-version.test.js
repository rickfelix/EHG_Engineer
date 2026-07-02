/**
 * SD-LEO-INFRA-THREE-WAY-COMMS-RELIABILITY-001-C (FR-2) — protocol-version-skew detection.
 * Pure-function tests for lib/coordinator/protocol-comms-version.cjs.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PROTOCOL_COMMS_VERSION, detectVersionSkew } = require('../../lib/coordinator/protocol-comms-version.cjs');

describe('detectVersionSkew', () => {
  it('returns null when payload carries no version stamp (pre-versioning producer)', () => {
    expect(detectVersionSkew({ kind: 'coordinator_reply', body: 'hi' })).toBeNull();
  });
  it('returns null when payload is null/undefined', () => {
    expect(detectVersionSkew(null)).toBeNull();
    expect(detectVersionSkew(undefined)).toBeNull();
  });
  it('returns null when the stamped version matches this process\'s own', () => {
    expect(detectVersionSkew({ protocol_comms_version: PROTOCOL_COMMS_VERSION })).toBeNull();
  });
  it('returns {senderVersion, receiverVersion} when the stamped version differs', () => {
    const skew = detectVersionSkew({ protocol_comms_version: PROTOCOL_COMMS_VERSION + 1 });
    expect(skew).toEqual({ senderVersion: PROTOCOL_COMMS_VERSION + 1, receiverVersion: PROTOCOL_COMMS_VERSION });
  });
  it('detects a skew from an older sender too (not just newer)', () => {
    const skew = detectVersionSkew({ protocol_comms_version: 0 });
    expect(skew).toEqual({ senderVersion: 0, receiverVersion: PROTOCOL_COMMS_VERSION });
  });
});
