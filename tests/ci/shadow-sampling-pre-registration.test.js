// SD-WRITERCONSUMER-ASYMMETRY-DETECTION-SCOPECOMPLETION-ORCH-001-0 / FR-C0-7
// Shadow-sampling protocol must be pre-registered in app_config BEFORE any backfill row UPDATE.
// Asserts writer code-path semantics (pre-registration happens before fetch+update).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRITER_PATH = join(__dirname, '../../scripts/lineage/backfill-vision-key.mjs');

describe('shadow-sampling pre-registration temporal invariant (writer code-path)', () => {
  const src = readFileSync(WRITER_PATH, 'utf8');

  it('writer defines preRegisterShadowProtocol helper', () => {
    expect(src).toMatch(/async function preRegisterShadowProtocol/);
  });

  it('preRegisterShadowProtocol upserts app_config child_0_shadow_sampling_protocol', () => {
    expect(src).toMatch(/APP_CONFIG_KEYS\.SHADOW_SAMPLING_PROTOCOL/);
    expect(src).toMatch(/from\(['"]app_config['"]\)/);
    expect(src).toMatch(/\.upsert\(/);
  });

  it('writer calls pre-register BEFORE fetchInScopeCohort and UPDATE loop', () => {
    const preIdx = src.indexOf('await preRegisterShadowProtocol');
    const fetchIdx = src.indexOf('await fetchInScopeCohort');
    const loopIdx = src.indexOf('for (const sd of cohort)');
    expect(preIdx).toBeGreaterThan(-1);
    expect(fetchIdx).toBeGreaterThan(-1);
    expect(loopIdx).toBeGreaterThan(-1);
    expect(preIdx).toBeLessThan(fetchIdx);
    expect(preIdx).toBeLessThan(loopIdx);
  });

  it('writer aborts when kill-switch active (before any UPDATE)', () => {
    expect(src).toMatch(/await isKillSwitchActive/);
    const killIdx = src.indexOf('await isKillSwitchActive');
    const preIdx = src.indexOf('await preRegisterShadowProtocol');
    expect(killIdx).toBeLessThan(preIdx);
  });
});
