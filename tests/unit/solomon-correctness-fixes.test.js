/**
 * solomon-correctness-fixes.test.js — SD-LEO-INFRA-SOLOMON-CONSULT-001C
 *
 * Pins the Phase-C round-trip correctness fixes (panel-verified) so a PARTIAL change
 * cannot pass CI:
 *   - dispatch.cjs SENTINEL_TARGETS includes 'broadcast-solomon' (else the buffered-ask
 *     consult path dead-letters via DISPATCH_TARGET_INVALID).
 *   - model-config.js TRIPLE-update — VALID_PURPOSES + MODEL_DEFAULTS.claude.solomon +
 *     ENV_VARS.claude.solomon — all three together. A partial update either THROWS on the
 *     unknown purpose, or silently IGNORES the CLAUDE_MODEL_SOLOMON override.
 *   - The pin defaults to Opus 4.8 (claude-opus-4-8) with ZERO Fable dependency, and is
 *     swappable via CLAUDE_MODEL_SOLOMON.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const dispatch = require('../../lib/coordinator/dispatch.cjs');
const modelConfig = require('../../lib/config/model-config.js');

describe('Phase C — broadcast-solomon sentinel (dispatch.cjs)', () => {
  it('SENTINEL_TARGETS includes broadcast-solomon', () => {
    expect(dispatch.SENTINEL_TARGETS).toContain('broadcast-solomon');
  });

  it('isSentinelTarget recognises broadcast-solomon (when exported)', () => {
    if (typeof dispatch.isSentinelTarget === 'function') {
      expect(dispatch.isSentinelTarget('broadcast-solomon')).toBe(true);
      expect(dispatch.isSentinelTarget('definitely-not-a-sentinel')).toBe(false);
    }
  });

  it('no regression — pre-existing sentinels still present', () => {
    expect(dispatch.SENTINEL_TARGETS).toContain('broadcast');
    expect(dispatch.SENTINEL_TARGETS).toContain('broadcast-coordinator');
  });
});

describe('Phase C — solomon model purpose triple-update (model-config.js)', () => {
  const { VALID_PURPOSES, MODEL_DEFAULTS, ENV_VARS, getClaudeModel } = modelConfig;

  it('VALID_PURPOSES includes solomon', () => {
    expect(VALID_PURPOSES).toContain('solomon');
  });

  it('MODEL_DEFAULTS.claude.solomon is the Opus 4.8 pin (no Fable dependency)', () => {
    expect(MODEL_DEFAULTS.claude.solomon).toBe('claude-opus-4-8');
  });

  it('ENV_VARS.claude.solomon is CLAUDE_MODEL_SOLOMON', () => {
    expect(ENV_VARS.claude.solomon).toBe('CLAUDE_MODEL_SOLOMON');
  });

  it('getClaudeModel("solomon") does not throw and defaults to Opus 4.8', () => {
    const origPurpose = process.env.CLAUDE_MODEL_SOLOMON;
    const origDefault = process.env.CLAUDE_MODEL;
    delete process.env.CLAUDE_MODEL_SOLOMON;
    delete process.env.CLAUDE_MODEL; // clear the generic default override too
    try {
      expect(() => getClaudeModel('solomon')).not.toThrow();
      expect(getClaudeModel('solomon')).toBe('claude-opus-4-8');
    } finally {
      if (origPurpose !== undefined) process.env.CLAUDE_MODEL_SOLOMON = origPurpose;
      if (origDefault !== undefined) process.env.CLAUDE_MODEL = origDefault;
    }
  });

  it('getClaudeModel("solomon") honours CLAUDE_MODEL_SOLOMON (proves ENV_VARS wiring, not just MODEL_DEFAULTS)', () => {
    const origPurpose = process.env.CLAUDE_MODEL_SOLOMON;
    process.env.CLAUDE_MODEL_SOLOMON = 'claude-fable-5-when-cleared';
    try {
      expect(getClaudeModel('solomon')).toBe('claude-fable-5-when-cleared');
    } finally {
      if (origPurpose === undefined) delete process.env.CLAUDE_MODEL_SOLOMON;
      else process.env.CLAUDE_MODEL_SOLOMON = origPurpose;
    }
  });
});
