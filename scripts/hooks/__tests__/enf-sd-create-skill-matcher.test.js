// QF-20260504-484: ENF-SD-CREATE-SKILL matcher specificity
// Pre-fix: substring /leo-create-sd\.js/ false-positived on commands that
// merely MENTIONED the script name, including the /sd-create skill's own
// invocations. This test locks in the anchored matcher behaviour.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HOOK_SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '..', 'pre-tool-enforce.cjs'),
  'utf8'
);

// Lift the new matcher's regex out of the hook source for direct testing.
const RX_LINE = HOOK_SRC.match(/const DIRECT_INVOCATION = (\/.+\/);/);
const DIRECT_INVOCATION = RX_LINE ? new RegExp(RX_LINE[1].slice(1, -1)) : null;

describe('ENF-SD-CREATE-SKILL matcher (QF-20260504-484)', () => {
  it('declares an anchored DIRECT_INVOCATION regex (not bare substring)', () => {
    expect(RX_LINE).toBeTruthy();
    expect(RX_LINE[1]).toMatch(/node\\s\+/);
  });

  it('BLOCKS bare direct invocation', () => {
    expect(DIRECT_INVOCATION.test('node scripts/leo-create-sd.js LEO feature "x"')).toBe(true);
  });

  it('BLOCKS quoted-path invocation', () => {
    expect(DIRECT_INVOCATION.test('node "C:/path/scripts/leo-create-sd.js" --from-feedback abc')).toBe(true);
  });

  it('BLOCKS chained invocation', () => {
    expect(DIRECT_INVOCATION.test('cd /tmp && node scripts/leo-create-sd.js')).toBe(true);
  });

  it('ALLOWS commands that only mention the script name in argument strings', () => {
    expect(DIRECT_INVOCATION.test('node scripts/log-harness-bug.js "fix scripts/leo-create-sd.js drift"')).toBe(false);
    expect(DIRECT_INVOCATION.test('gh pr list --search "leo-create-sd.js"')).toBe(false);
    expect(DIRECT_INVOCATION.test('echo leo-create-sd.js')).toBe(false);
  });

  it('still allows the SD_CREATE_VIA_SKILL=1 escape (existing bypass)', () => {
    // Bypass is a separate check in the hook (regex /SD_CREATE_VIA_SKILL=1/),
    // independent of the matcher. Assert the bypass token is still in the source.
    expect(HOOK_SRC).toMatch(/SD_CREATE_VIA_SKILL=1/);
  });
});
